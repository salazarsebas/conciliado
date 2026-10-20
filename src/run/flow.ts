/**
 * src/run/flow.ts
 *
 * Plain TypeScript state machine for the /run batch flow.
 * No React, no DOM — takes injected publicClient and wallet deps
 * so it can be fully tested without a browser.
 *
 * States (in order):
 *   idle             — nothing uploaded yet
 *   parsed           — CSV parsed, offline validation done (may have errors)
 *   checking         — on-chain checks running (refs used, payees allowed)
 *   checked          — on-chain checks done; unallowedPayees populated
 *   allowPending     — addPayees tx sent, waiting for receipt
 *   allowFinal       — addPayees confirmed; return to checked state
 *   simulating       — eth_call + estimateGas running
 *   simOk            — simulation passed; Pay enabled after salt gate
 *   simFail          — simulation failed; Pay disabled
 *   saltGate         — user must download files or tick checkbox
 *   paying           — aggregate3 tx submitted
 *   paid             — final receipt received
 *   reverted         — receipt status = reverted
 *   rejected         — user rejected the wallet tx
 *   contractError    — a contract address is not deployed on this network
 */

import type { Address, Hex, PublicClient, WalletClient } from 'viem';
import { parseAbi } from 'viem';
import type { ParseResult, ParsedRow } from './csv-parse.js';
import { deriveRefs, generateSalt, buildPayerCsv, buildSaltFile } from './csv-parse.js';
import {
  buildAddPayeesCall,
  buildAggregate3Calls,
  buildAggregate3Calldata,
  buildFeeSettings,
  PAYOUT_BATCH_ABI,
  MULTICALL3_FROM_ABI,
} from './calls.js';
import type { BatchLine } from './calls.js';
import { runSimulation, checkCodeDeployed } from './simulate.js';
import type { SimulateResult } from './simulate.js';
import type { RunNetwork } from './networks.js';
import { rebuildLedger } from '../ledger/rebuild.js';
import type { LedgerClient } from '../ledger/rebuild.js';
import type { LocalInvoice } from '../ledger/index.js';
import { buildViewModel, type LedgerViewModel } from '../landing/view-model.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type FlowStatus =
  | 'idle'
  | 'parsed'
  | 'checking'
  | 'checked'
  | 'allowPending'
  | 'allowFinal'
  | 'simulating'
  | 'simOk'
  | 'simFail'
  | 'saltGate'
  | 'paying'
  | 'paid'
  | 'reverted'
  | 'rejected'
  | 'contractError';

export interface FlowState {
  status: FlowStatus;

  /** The network selected when this state was entered. */
  network: RunNetwork;

  // ── Parsed data ──────────────────────────────────────────────────────────
  parseResult: ParseResult | null;
  /** Valid rows (no per-row errors). */
  rows: ParsedRow[];
  /** Batch salt (generated once per file upload). */
  salt: Hex | null;
  /** Derived invoiceRefs, parallel to rows[]. */
  refs: Hex[] | null;

  // ── On-chain check results ───────────────────────────────────────────────
  /** Payees that need to be added to the payer's allow-list. */
  unallowedPayees: Address[];
  /** Refs already used on chain (already-paid invoices). */
  usedRefs: Hex[];

  // ── Allow-payees step ────────────────────────────────────────────────────
  allowTxHash: Hex | null;
  allowTxUrl: string | null;
  allowError: string | null;

  // ── Simulation ───────────────────────────────────────────────────────────
  simResult: SimulateResult | null;
  /** Estimated fee string (e.g. "0.000123456 USDC") */
  feeEstimate: string | null;

  // ── Salt gate ────────────────────────────────────────────────────────────
  saltGateCleared: boolean;

  // ── Pay step ─────────────────────────────────────────────────────────────
  payTxHash: Hex | null;
  payTxUrl: string | null;
  payElapsedMs: number;
  payError: string | null;
  payDurationMs: number | null;
  payBlockNumber: string | null;

  // ── Post-pay rebuild ─────────────────────────────────────────────────────
  rebuildVm: LedgerViewModel | null;

  // ── Contract check ───────────────────────────────────────────────────────
  contractError: string | null;

  // ── Payer (connected wallet address) ────────────────────────────────────
  payer: Address | null;
}

export function makeInitialState(network: RunNetwork): FlowState {
  return {
    status: 'idle',
    network,
    parseResult: null,
    rows: [],
    salt: null,
    refs: null,
    unallowedPayees: [],
    usedRefs: [],
    allowTxHash: null,
    allowTxUrl: null,
    allowError: null,
    simResult: null,
    feeEstimate: null,
    saltGateCleared: false,
    payTxHash: null,
    payTxUrl: null,
    payElapsedMs: 0,
    payError: null,
    payDurationMs: null,
    payBlockNumber: null,
    rebuildVm: null,
    contractError: null,
    payer: null,
  };
}

// ─── Flow controller ─────────────────────────────────────────────────────────

export interface FlowDeps {
  /** A viem public client on the selected network. */
  publicClient: PublicClient;
  /** A viem wallet client (connected) — may be null before connect. */
  walletClient: WalletClient | null;
  /** Called whenever state changes. */
  onStateChange: (s: FlowState) => void;
}

export class FlowController {
  private state: FlowState;
  private deps: FlowDeps;

  constructor(network: RunNetwork, deps: FlowDeps) {
    this.state = makeInitialState(network);
    this.deps = deps;
  }

  getState(): FlowState {
    return this.state;
  }

  private set(patch: Partial<FlowState>) {
    this.state = { ...this.state, ...patch };
    this.deps.onStateChange(this.state);
  }

  /** Switch network — resets to idle. */
  switchNetwork(network: RunNetwork) {
    this.state = makeInitialState(network);
    this.deps.onStateChange(this.state);
  }

  /** Set payer address (after wallet connects). */
  setPayer(payer: Address | null) {
    this.set({ payer });
  }

  /** Handle a CSV file upload. Runs pure parsing, then on-chain checks if wallet is connected. */
  async uploadFile(rawCsv: string, parseRunCsv: (raw: string) => ParseResult): Promise<void> {
    // Reset to idle first
    this.set(makeInitialState(this.state.network));

    const parseResult = parseRunCsv(rawCsv);
    const rows = parseResult.rows;
    const salt = rows.length > 0 ? generateSalt() : null;
    const refs = rows.length > 0 && salt ? deriveRefs(rows, salt) : null;

    this.set({
      status: 'parsed',
      parseResult,
      rows,
      salt,
      refs,
    });

    if (rows.length === 0 || parseResult.errors.length > 0) {
      return;
    }

    // If wallet is connected, proceed to on-chain checks
    if (this.state.payer) {
      await this.runOnChainChecks();
    }
  }

  /** Run on-chain checks: refs used, payees allowed. */
  async runOnChainChecks(): Promise<void> {
    const { rows, refs, payer } = this.state;
    if (rows.length === 0 || !refs || !payer) return;

    this.set({ status: 'checking' });

    const { publicClient } = this.deps;
    const { payoutBatch } = this.state.network;

    // Check contracts are deployed
    const [batchOk, usdcOk, mc3Ok] = await Promise.all([
      checkCodeDeployed(publicClient as unknown as Parameters<typeof checkCodeDeployed>[0], payoutBatch),
      checkCodeDeployed(publicClient as unknown as Parameters<typeof checkCodeDeployed>[0], this.state.network.usdc),
      checkCodeDeployed(publicClient as unknown as Parameters<typeof checkCodeDeployed>[0], this.state.network.multicall3From),
    ]);

    if (!batchOk || !usdcOk || !mc3Ok) {
      const missing = [
        !batchOk && 'PayoutBatch',
        !usdcOk && 'USDC',
        !mc3Ok && 'Multicall3From',
      ].filter(Boolean).join(', ');
      this.set({
        status: 'contractError',
        contractError: `${missing} ${!batchOk || !usdcOk || !mc3Ok ? 'is' : 'are'} not deployed on ${this.state.network.name}. No USDC moved.`,
      });
      return;
    }

    // Check refs and payees in parallel
    const ABI = parseAbi([
      'function isInvoiceRefUsed(address payer, bytes32 ref) view returns (bool)',
      'function isPayeeAllowed(address payer, address payee) view returns (bool)',
    ]);

    const refResults = await Promise.all(
      refs.map((ref) =>
        (publicClient).readContract({
          address: payoutBatch,
          abi: ABI,
          functionName: 'isInvoiceRefUsed',
          args: [payer, ref],
        }).catch(() => false),
      ),
    );

    const uniquePayees = [...new Set(rows.map((r) => r.payee))];
    const payeeResults = await Promise.all(
      uniquePayees.map((payee) =>
        (publicClient).readContract({
          address: payoutBatch,
          abi: ABI,
          functionName: 'isPayeeAllowed',
          args: [payer, payee],
        }).catch(() => false),
      ),
    );

    const usedRefs = refs.filter((_, i) => refResults[i]);
    const unallowedPayees = uniquePayees.filter((_, i) => !payeeResults[i]);

    this.set({
      status: 'checked',
      usedRefs,
      unallowedPayees,
    });
  }

  /** Send addPayees transaction. */
  async sendAddPayees(): Promise<void> {
    const { walletClient } = this.deps;
    const { payer, unallowedPayees } = this.state;
    if (!walletClient || !payer || unallowedPayees.length === 0) return;

    this.set({ status: 'allowPending', allowError: null, allowTxHash: null });

    try {
      const callData = buildAddPayeesCall(unallowedPayees);
      const hash = await walletClient.sendTransaction({
        account: payer,
        to: this.state.network.payoutBatch,
        data: callData,
        chain: null,
      });

      const txUrl = `${this.state.network.explorerBase}/tx/${hash}`;
      this.set({ allowTxHash: hash, allowTxUrl: txUrl });

      // Wait for receipt
      const receipt = await (this.deps.publicClient).waitForTransactionReceipt({ hash });

      if (receipt.status === 'reverted') {
        this.set({
          status: 'checked',
          allowError: 'The addPayees transaction reverted. No USDC moved.',
        });
        return;
      }

      this.set({ status: 'allowFinal' });
      // Re-check allow list
      await this.runOnChainChecks();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRejected = msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('rejected the request');
      this.set({
        status: 'checked',
        allowError: isRejected
          ? 'You rejected the addPayees transaction. No USDC moved.'
          : `addPayees failed: ${msg}. No USDC moved.`,
      });
    }
  }

  /** Run simulation (eth_call + estimateGas). */
  async simulate(): Promise<void> {
    const { rows, refs, payer } = this.state;
    if (rows.length === 0 || !refs || !payer) return;

    this.set({ status: 'simulating', simResult: null, feeEstimate: null });

    const { publicClient } = this.deps;

    // Get current gas price
    let baseFeeEstimate = 20_000_000_000n; // 20 gwei default
    try {
      const block = await (publicClient).getBlock({ blockTag: 'latest' });
      if (block.baseFeePerGas) {
        baseFeeEstimate = block.baseFeePerGas;
      }
    } catch { /* use default */ }

    const feeSettings = buildFeeSettings(baseFeeEstimate);

    const lines: BatchLine[] = rows.map((r, i) => ({
      payee: r.payee,
      amountMicro: r.amountMicro,
      invoiceRef: refs[i],
    }));
    const total = rows.reduce((s, r) => s + r.amountMicro, 0n);

    const calls = buildAggregate3Calls({
      usdc: this.state.network.usdc,
      payoutBatch: this.state.network.payoutBatch,
      lines,
      total,
    });

    // Build invoiceId-by-ref map for error decoding
    const invoiceIdByRef = new Map<Hex, string>();
    for (let i = 0; i < rows.length; i++) {
      invoiceIdByRef.set((refs[i] ?? '').toLowerCase() as Hex, rows[i].invoiceId);
    }

    const result = await runSimulation({
      client: publicClient,
      from: payer,
      to: this.state.network.multicall3From,
      calls,
      maxFeePerGas: feeSettings.maxFeePerGas,
      invoiceIdByRef,
    });

    let feeEstimate: string | null = null;
    if (result.ok) {
      const feeWei = result.gasEstimate * feeSettings.maxFeePerGas;
      const SCALE_TO_9 = 1_000_000_000n;
      const intPart = feeWei / (SCALE_TO_9 * SCALE_TO_9);
      const fracPart = feeWei % (SCALE_TO_9 * SCALE_TO_9);
      const fracStr = fracPart.toString().padStart(18, '0').slice(0, 9);
      feeEstimate = `${intPart}.${fracStr} USDC`;
    }

    this.set({
      status: result.ok ? 'simOk' : 'simFail',
      simResult: result,
      feeEstimate,
    });
  }

  /** Mark the salt gate as cleared (user has downloaded or ticked). */
  clearSaltGate() {
    this.set({ status: 'saltGate', saltGateCleared: true });
  }

  /** Send the aggregate3 pay transaction. */
  async sendPay(): Promise<void> {
    const { walletClient } = this.deps;
    const { rows, refs, payer, salt } = this.state;
    if (!walletClient || !payer || rows.length === 0 || !refs || !salt) return;

    this.set({
      status: 'paying',
      payTxHash: null,
      payTxUrl: null,
      payError: null,
      payElapsedMs: 0,
    });

    const lines: BatchLine[] = rows.map((r, i) => ({
      payee: r.payee,
      amountMicro: r.amountMicro,
      invoiceRef: refs[i],
    }));
    const total = rows.reduce((s, r) => s + r.amountMicro, 0n);

    const calls = buildAggregate3Calls({
      usdc: this.state.network.usdc,
      payoutBatch: this.state.network.payoutBatch,
      lines,
      total,
    });
    const calldata = buildAggregate3Calldata(calls);

    // Get fee settings
    let baseFeeEstimate = 20_000_000_000n;
    try {
      const block = await (this.deps.publicClient).getBlock({ blockTag: 'latest' });
      if (block.baseFeePerGas) baseFeeEstimate = block.baseFeePerGas;
    } catch { /* use default */ }

    const feeSettings = buildFeeSettings(baseFeeEstimate);
    const startMs = Date.now();

    try {
      const hash = await walletClient.sendTransaction({
        account: payer,
        to: this.state.network.multicall3From,
        data: calldata,
        maxFeePerGas: feeSettings.maxFeePerGas,
        maxPriorityFeePerGas: feeSettings.maxPriorityFeePerGas,
        chain: null,
      });

      const txUrl = `${this.state.network.explorerBase}/tx/${hash}`;
      this.set({ payTxHash: hash, payTxUrl: txUrl });

      // Poll elapsed
      const elapsedInterval = setInterval(() => {
        this.set({ payElapsedMs: Date.now() - startMs });
      }, 200);

      const receipt = await (this.deps.publicClient).waitForTransactionReceipt({ hash });
      clearInterval(elapsedInterval);

      const durationMs = Date.now() - startMs;
      const blockDisplay = receipt.blockNumber.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

      if (receipt.status === 'reverted') {
        this.set({
          status: 'reverted',
          payDurationMs: durationMs,
          payBlockNumber: blockDisplay,
        });
        return;
      }

      this.set({
        status: 'paid',
        payDurationMs: durationMs,
        payBlockNumber: blockDisplay,
      });

      // Post-pay rebuild
      await this.runRebuild(hash, payer, salt, rows, refs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRejected = msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('rejected the request');
      this.set({
        status: isRejected ? 'rejected' : 'paid',
        payError: isRejected
          ? 'You rejected the transaction. No USDC moved.'
          : `Transaction error: ${msg}`,
      });
    }
  }

  /** Run rebuildLedger after a successful pay, populate rebuildVm. */
  private async runRebuild(
    txHash: Hex,
    payer: Address,
    salt: Hex,
    rows: ParsedRow[],
    refs: Hex[],
  ): Promise<void> {
    try {
      const invoiceList: LocalInvoice[] = rows.map((r, i) => ({
        invoiceId: r.invoiceId,
        invoiceRef: refs[i],
        payee: r.payee,
        amountMicro: r.amountMicro,
      }));

      const result = await rebuildLedger({
        client: this.deps.publicClient,
        contract: this.state.network.payoutBatch,
        payer,
        usdc: this.state.network.usdc,
        target: { txHash },
        invoiceList,
      });

      const vm = buildViewModel(result, invoiceList);
      this.set({ rebuildVm: vm });
    } catch {
      // Rebuild failure is not fatal — the pay is already confirmed
    }
  }
}
