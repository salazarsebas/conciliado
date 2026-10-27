/**
 * src/run/simulate.ts
 *
 * Simulation and error decoding for the /run batch flow.
 *
 * decodeRevertReason — maps PayoutBatch custom errors and USDC ERC20 errors
 *   to a plain English sentence that names the payee or invoice and says
 *   "No USDC moved."
 *
 * runSimulation — calls eth_call + estimateGas via a publicClient and returns
 *   either { ok: true, gasEstimate } or { ok: false, reason }.
 */

import { decodeErrorResult, formatGwei, parseAbi } from 'viem';
import type { Address, Hex, PublicClient } from 'viem';
import { buildAggregate3Calldata } from './calls.js';
import type { Aggregate3Call } from './calls.js';
import { truncateAddress } from '../landing/format.js';

// ─── Error ABIs ──────────────────────────────────────────────────────────────

const PAYOUT_BATCH_ERROR_ABI = parseAbi([
  'error BatchTooLarge(uint256 given, uint256 max)',
  'error EmptyBatch()',
  'error InvoiceRefAlreadyUsed(address payer, bytes32 ref)',
  'error PayeeNotAllowed(address payer, address payee)',
  'error TotalMismatch(uint256 computed, uint256 expected)',
  'error ZeroAmount()',
  'error ZeroPayee()',
]);

const ERC20_ERROR_ABI = parseAbi([
  'error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)',
  'error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)',
]);

// ─── Error decoder ───────────────────────────────────────────────────────────

/**
 * Decode a revert reason from an Error thrown by viem's call/estimateGas.
 * Returns a human-readable message ending with "No USDC moved." for all known errors.
 */
export function decodeRevertReason(err: unknown, invoiceIdByRef?: Map<Hex, string>): string {
  const msg = err instanceof Error ? err.message : String(err);

  // Extract 0x-prefixed hex data from the error message or data property
  let hexData: Hex | null = null;
  if (err instanceof Error && 'data' in err) {
    const d = (err as { data?: unknown }).data;
    if (typeof d === 'string' && /^0x[0-9a-fA-F]+$/.test(d)) {
      hexData = d as Hex;
    }
  }
  if (!hexData) {
    const match = msg.match(/0x[0-9a-fA-F]{8,}/);
    if (match) hexData = match[0] as Hex;
  }

  if (hexData) {
    // Try PayoutBatch custom errors
    try {
      const decoded = decodeErrorResult({ abi: PAYOUT_BATCH_ERROR_ABI, data: hexData });
      return formatPayoutBatchError(decoded.errorName, decoded.args ?? [], invoiceIdByRef);
    } catch { /* not a PayoutBatch error */ }

    // Try ERC20 errors
    try {
      const decoded = decodeErrorResult({ abi: ERC20_ERROR_ABI, data: hexData });
      return formatERC20Error(decoded.errorName, decoded.args ?? []);
    } catch { /* not an ERC20 error */ }
  }

  // Fallback: parse plain text
  if (msg.toLowerCase().includes('insufficient balance') || msg.toLowerCase().includes('insufficient funds')) {
    return 'Insufficient USDC balance to cover the batch total and estimated fee. No USDC moved.';
  }
  if (msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('rejected the request')) {
    return 'You rejected the transaction. No USDC moved.';
  }

  return `Simulation failed: ${msg} No USDC moved.`;
}

function formatPayoutBatchError(
  name: string,
  args: readonly unknown[],
  invoiceIdByRef?: Map<Hex, string>,
): string {
  switch (name) {
    case 'BatchTooLarge': {
      const [given, max] = args as [bigint, bigint];
      return `Batch has ${given} lines but PayoutBatch allows at most ${max}. No USDC moved.`;
    }
    case 'EmptyBatch':
      return 'The batch is empty. No USDC moved.';
    case 'InvoiceRefAlreadyUsed': {
      const [, ref] = args as [Address, Hex];
      const invoiceId = invoiceIdByRef?.get(ref.toLowerCase() as Hex);
      const label = invoiceId ? `invoice "${invoiceId}"` : `ref ${ref.slice(0, 10)}...`;
      return `The reference for ${label} was already used on chain. This invoice was already paid with this salt. No USDC moved.`;
    }
    case 'PayeeNotAllowed': {
      const [, payee] = args as [Address, Address];
      return `Payee ${truncateAddress(payee)} is not on your allow-list. Add them in the "Allow payees" step. No USDC moved.`;
    }
    case 'TotalMismatch': {
      const [computed, expected] = args as [bigint, bigint];
      return `Total mismatch: computed ${computed} but expected ${expected}. No USDC moved.`;
    }
    case 'ZeroAmount':
      return 'A line has a zero amount. No USDC moved.';
    case 'ZeroPayee':
      return 'A line has a zero payee address. No USDC moved.';
    default:
      return `${name}: simulation failed. No USDC moved.`;
  }
}

function formatERC20Error(name: string, args: readonly unknown[]): string {
  switch (name) {
    case 'ERC20InsufficientBalance': {
      const [sender, balance, needed] = args as [Address, bigint, bigint];
      return `Insufficient USDC balance for ${truncateAddress(sender)}: have ${balance}, need ${needed}. No USDC moved.`;
    }
    case 'ERC20InsufficientAllowance': {
      const [spender, allowance, needed] = args as [Address, bigint, bigint];
      return `Insufficient USDC allowance for ${truncateAddress(spender)}: have ${allowance}, need ${needed}. No USDC moved.`;
    }
    default:
      return `ERC20 error ${name}. No USDC moved.`;
  }
}

// ─── Simulation ──────────────────────────────────────────────────────────────

export interface SimulateOk {
  ok: true;
  gasEstimate: bigint;
}

export interface SimulateFail {
  ok: false;
  reason: string;
}

export type SimulateResult = SimulateOk | SimulateFail;

/** Format estimated gas fee in USDC (9 decimals). */
export function formatGasEstimate(gasEstimate: bigint, maxFeePerGas: bigint): string {
  const feeWei = gasEstimate * maxFeePerGas;
  // Convert 18-decimal wei to 9-decimal display
  const SCALE = 1_000_000_000n;  // 10^9
  const intPart = feeWei / (SCALE * SCALE);
  const fracPart = feeWei % (SCALE * SCALE);
  const fracStr = fracPart.toString().padStart(18, '0').slice(0, 9);
  return `${intPart}.${fracStr} USDC`;
}

/** Check on-chain that code is deployed at an address. Returns false for empty contracts. */
export async function checkCodeDeployed(
  client: Pick<PublicClient, 'getCode'>,
  address: Address,
): Promise<boolean> {
  try {
    const code = await client.getCode({ address });
    return typeof code === 'string' && code !== '0x' && code.length > 2;
  } catch {
    return false;
  }
}

export async function runSimulation(opts: {
  client: Pick<PublicClient, 'call' | 'estimateGas'>;
  from: Address;
  to: Address;
  calls: Aggregate3Call[];
  maxFeePerGas: bigint;
  invoiceIdByRef?: Map<Hex, string>;
}): Promise<SimulateResult> {
  const { client, from, to, calls, maxFeePerGas, invoiceIdByRef } = opts;
  const data = buildAggregate3Calldata(calls);
  try {
    await client.call({ account: from, to, data, maxFeePerGas });
    const gasEstimate = await client.estimateGas({ account: from, to, data, maxFeePerGas });
    return { ok: true, gasEstimate };
  } catch (err) {
    return { ok: false, reason: decodeRevertReason(err, invoiceIdByRef) };
  }
}

// Re-export formatGwei from viem for use in the UI
export { formatGwei };
