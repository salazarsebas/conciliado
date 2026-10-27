/**
 * src/run/calls.ts
 *
 * Pure builders for the /run batch transactions.
 * No side effects; safe for unit tests without a browser.
 *
 * buildAddPayeesCall  — encodes PayoutBatch.addPayees(address[])
 * buildAggregate3Calls — encodes the Multicall3From aggregate3 argument:
 *   [{USDC.approve(payoutBatch, total)}, {PayoutBatch.payBatch(lines, total)}]
 *
 * Multicall3From preserves msg.sender through both sub-calls.
 * The payer is the caller of aggregate3, so approve and payBatch
 * happen in one transaction signed by the payer wallet.
 */

import { encodeFunctionData, parseAbi } from 'viem';
import type { Address, Hex } from 'viem';

// ─── ABIs ───────────────────────────────────────────────────────────────────

export const PAYOUT_BATCH_ABI = parseAbi([
  'function addPayees(address[] calldata payees)',
  'function payBatch((address payee, uint256 amount, bytes32 invoiceRef)[] lines, uint256 expectedTotal) returns (uint256 batchId)',
  'function isInvoiceRefUsed(address payer, bytes32 ref) view returns (bool)',
  'function isPayeeAllowed(address payer, address payee) view returns (bool)',
  'error BatchTooLarge(uint256 given, uint256 max)',
  'error EmptyBatch()',
  'error InvoiceRefAlreadyUsed(address payer, bytes32 ref)',
  'error PayeeNotAllowed(address payer, address payee)',
  'error TotalMismatch(uint256 computed, uint256 expected)',
  'error ZeroAmount()',
  'error ZeroPayee()',
]);

export const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)',
  'error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)',
]);

export const MULTICALL3_FROM_ABI = parseAbi([
  'function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[])',
]);

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BatchLine {
  payee: Address;
  amountMicro: bigint;
  invoiceRef: Hex;
}

export interface Aggregate3Call {
  target: Address;
  allowFailure: boolean;
  callData: Hex;
}

// ─── Builders ────────────────────────────────────────────────────────────────

/** Encode PayoutBatch.addPayees(payees) call data. */
export function buildAddPayeesCall(payees: Address[]): Hex {
  return encodeFunctionData({
    abi: PAYOUT_BATCH_ABI,
    functionName: 'addPayees',
    args: [payees],
  });
}

/**
 * Build the two-call aggregate3 argument:
 *   [0] USDC.approve(payoutBatch, total)
 *   [1] PayoutBatch.payBatch(lines, total)
 *
 * The lines array preserves the CSV order.
 * allowFailure is false for both calls: one failure reverts everything.
 */
export function buildAggregate3Calls(opts: {
  usdc: Address;
  payoutBatch: Address;
  lines: BatchLine[];
  total: bigint;
}): Aggregate3Call[] {
  const { usdc, payoutBatch, lines, total } = opts;

  const approveData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [payoutBatch, total],
  });

  const payBatchLines = lines.map((l) => ({
    payee: l.payee,
    amount: l.amountMicro,
    invoiceRef: l.invoiceRef,
  }));

  const payBatchData = encodeFunctionData({
    abi: PAYOUT_BATCH_ABI,
    functionName: 'payBatch',
    args: [payBatchLines, total],
  });

  return [
    { target: usdc, allowFailure: false, callData: approveData },
    { target: payoutBatch, allowFailure: false, callData: payBatchData },
  ];
}

/** Encode the full aggregate3 calldata for the Multicall3From contract. */
export function buildAggregate3Calldata(calls: Aggregate3Call[]): Hex {
  return encodeFunctionData({
    abi: MULTICALL3_FROM_ABI,
    functionName: 'aggregate3',
    args: [calls],
  });
}

// ─── Fee floor ────────────────────────────────────────────────────────────────

export const FEE_FLOOR_GWEI = 20n; // 20 gwei Arc minimum
export const FEE_PRIORITY_GWEI = 1n; // 1 gwei priority

export interface FeeSettings {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

/** Return fee settings that respect the 20 gwei floor on Arc. */
export function buildFeeSettings(estimatedMaxFeePerGas: bigint): FeeSettings {
  const GWEI = 1_000_000_000n;
  const floor = FEE_FLOOR_GWEI * GWEI;
  const priority = FEE_PRIORITY_GWEI * GWEI;
  return {
    maxFeePerGas: estimatedMaxFeePerGas < floor ? floor : estimatedMaxFeePerGas,
    maxPriorityFeePerGas: priority,
  };
}
