/**
 * view-model.ts: pure data model for the landing page.
 * No React, no DOM, no ?raw imports. Safe for bun test.
 *
 * Takes a LedgerResult and the local invoice list and returns
 * everything the UI needs to render, serialisable as JSON (bigints as strings).
 */

import type { Address, Hex } from 'viem';
import type { LedgerResult, LocalInvoice } from '../ledger/index.js';
import {
  BATCH_TX,
  EXPLORER_BASE,
  CONTRACT_ADDRESS,
} from './batch.js';
import {
  formatMicro6,
  formatUsd2,
  formatFeeFullUsdc,
  formatNativeAsMicro,
  formatBlockNumber,
  truncateAddress,
  truncateHash,
} from './format.js';
import { nativeToMicro } from '../ledger/money.js';

// ─── Types ─────────────────────────────────────────────────────────────────

export type ViewStatus = 'empty' | 'loading' | 'ready' | 'error' | 'cached';

export interface PayoutRowView {
  lineIndex: number;
  invoiceId: string | null;        // from join; null when unmatched on-chain
  payee: Address;
  payeeDisplay: string;            // truncated
  payeeExplorerUrl: string;
  amountDisplay: string;           // "0.020000"
  invoiceRef: Hex;
  invoiceRefDisplay: string;       // truncated
  matchWord: 'Matched' | 'Not matched' | 'Checking';
  matched: boolean;
  txUrl: string;
}

export interface FeeRowView {
  label: 'Network fee';
  amountDisplay: string;    // 6 decimals, half-up
  amountFullDisplay: string; // full 9+ decimals, e.g. "0.011013954 USDC"
  txUrl: string;
}

export interface TieOutView {
  ledgerTotalDisplay: string;        // 6 decimals + " USDC"
  walletChangeDisplay: string;       // 6 decimals + " USDC"
  ledgerBarPct: number;              // 0–100
  walletBarPct: number;              // 0–100
  tied: boolean;                     // differenceNative18 === 0n
  differenceDisplay: string;         // "$0.00" or exact
  differenceExact: string;           // "0.000000 USDC" or exact
  differenceWei: string;             // "0 wei" or exact
  resultWord: string;                // "Ties out. 6 of 6 matched." or "Does not tie. Difference X USDC."
  resultClass: 'final' | 'danger';
  multiTxWarning: boolean;
}

export interface LedgerViewModel {
  status: 'pending' | 'final';
  receiptStatus: 'success' | 'reverted' | undefined;
  blockNumber: string | null;        // formatted with thousands separator
  txHash: Hex | null;
  txHashDisplay: string | null;
  txUrl: string | null;
  contractDisplay: string;
  contractExplorerUrl: string;
  payoutRows: PayoutRowView[];
  feeRow: FeeRowView | null;
  totalDisplay: string | null;       // ledgerTotalMicro, 6 decimals
  matchedCount: number;
  invoiceCount: number;
  matchSummary: string;              // "6 of 6 matched"
  tieOut: TieOutView | null;
  warnings: string[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function explorerTx(hash: string): string {
  return `${EXPLORER_BASE}/tx/${hash}`;
}

function explorerAddress(addr: string): string {
  return `${EXPLORER_BASE}/address/${addr}`;
}

// ─── Main builder ──────────────────────────────────────────────────────────

export function buildViewModel(
  result: LedgerResult,
  invoiceList: LocalInvoice[],
): LedgerViewModel {
  const txHash = result.txHash ?? (BATCH_TX);
  const txUrl = explorerTx(txHash);

  // Build a map from invoiceRef → invoiceId for the join
  const refToId = new Map<string, string>();
  for (const inv of invoiceList) {
    const ref = 'invoiceRef' in inv && inv.invoiceRef ? inv.invoiceRef : null;
    if (ref) refToId.set(ref.toLowerCase(), inv.invoiceId);
  }
  // Also add matched results
  for (const m of result.matched) {
    refToId.set(m.ref.toLowerCase(), m.invoiceId);
  }

  const matchedRefSet = new Set(result.matched.map((m) => m.ref.toLowerCase()));

  const payoutRows: PayoutRowView[] = result.payoutRows.map((row) => {
    const matched = matchedRefSet.has(row.invoiceRef.toLowerCase());
    const invoiceId = refToId.get(row.invoiceRef.toLowerCase()) ?? null;
    return {
      lineIndex: Number(row.lineIndex),
      invoiceId,
      payee: row.payee,
      payeeDisplay: truncateAddress(row.payee),
      payeeExplorerUrl: explorerAddress(row.payee),
      amountDisplay: formatMicro6(row.amountMicro),
      invoiceRef: row.invoiceRef,
      invoiceRefDisplay: truncateHash(row.invoiceRef),
      matchWord: matched ? 'Matched' : 'Not matched',
      matched,
      txUrl,
    };
  });

  let feeRow: FeeRowView | null = null;
  if (result.feeRow) {
    const fr = result.feeRow;
    feeRow = {
      label: 'Network fee',
      amountDisplay: formatMicro6(fr.feeMicro),
      amountFullDisplay: formatFeeFullUsdc(fr.feeNative18),
      txUrl,
    };
  }

  let totalDisplay: string | null = null;
  if (result.ledgerTotalMicro !== null) {
    totalDisplay = formatMicro6(result.ledgerTotalMicro);
  }

  let tieOut: TieOutView | null = null;
  if (
    result.ledgerTotalNative18 !== null &&
    result.nativeDelta18 !== null &&
    result.differenceNative18 !== null
  ) {
    const ledgerN = result.ledgerTotalNative18;
    const walletN = result.nativeDelta18;
    const diff18 = result.differenceNative18;
    const tied = diff18 === 0n;

    // Bar percentages: larger is 100%
    const maxN = ledgerN > walletN ? ledgerN : walletN;
    const ledgerBarPct = maxN > 0n ? Number((ledgerN * 100n) / maxN) : 100;
    const walletBarPct = maxN > 0n ? Number((walletN * 100n) / maxN) : 100;

    const ledgerTotalDisplay = formatNativeAsMicro(ledgerN);
    const walletChangeDisplay = formatNativeAsMicro(walletN);

    // Difference display: exact 18-decimal rule
    const absDiff = diff18 < 0n ? -diff18 : diff18;
    const diffMicro = nativeToMicro(absDiff);
    const diffSign = diff18 < 0n ? '-' : '';

    let differenceDisplay: string;
    let differenceExact: string;
    let differenceWei: string;
    let resultWord: string;
    const resultClass: 'final' | 'danger' = tied ? 'final' : 'danger';

    if (tied) {
      differenceDisplay = '$0.00';
      differenceExact = '0.000000 USDC';
      differenceWei = '0 wei';
      resultWord = `Ties out. ${result.matchedCount} of ${invoiceList.length} matched.`;
    } else {
      differenceDisplay = `${diffSign}${formatUsd2(diffMicro)}`;
      differenceExact = `${diffSign}${formatMicro6(diffMicro)} USDC`;
      differenceWei = `${diff18.toString()} wei`;
      resultWord = `Does not tie. Difference ${diffSign}${formatMicro6(diffMicro)} USDC.`;
    }

    tieOut = {
      ledgerTotalDisplay,
      walletChangeDisplay,
      ledgerBarPct,
      walletBarPct,
      tied,
      differenceDisplay,
      differenceExact,
      differenceWei,
      resultWord,
      resultClass,
      multiTxWarning: (result.payerTxCountInBlock ?? 1) > 1,
    };
  }

  const blockNumber = result.blockNumber !== null
    ? formatBlockNumber(result.blockNumber)
    : null;

  return {
    status: result.status,
    receiptStatus: result.receiptStatus,
    blockNumber,
    txHash: txHash,
    txHashDisplay: truncateHash(txHash),
    txUrl,
    contractDisplay: truncateAddress(CONTRACT_ADDRESS),
    contractExplorerUrl: explorerAddress(CONTRACT_ADDRESS),
    payoutRows,
    feeRow,
    totalDisplay,
    matchedCount: result.matchedCount,
    invoiceCount: invoiceList.length,
    matchSummary: `${result.matchedCount} of ${invoiceList.length} matched`,
    tieOut,
    warnings: result.warnings,
  };
}

// ─── Cache helpers ─────────────────────────────────────────────────────────

export interface CachedRebuild {
  viewModel: LedgerViewModel;
  cachedAtUtc: string;           // ISO-8601 UTC timestamp
  /** Bigints serialized as decimal strings */
  ledgerTotalMicro: string | null;
  nativeDelta18: string | null;
  differenceNative18: string | null;
}
