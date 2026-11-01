/**
 * Pure aggregation for the /metrics page.
 *
 * Takes the raw logs of the PayoutBatch contract and the per-batch ledger results
 * (from the existing rebuildLedger) and computes the figures the page shows.
 * No network, no React, no clock: every function here is a function of its inputs.
 */

import { decodeEventLog, type Address, type Hex, type Log } from 'viem';
import { PAYOUT_BATCH_ABI } from '../ledger/index.js';

// ─── Decoded events ──────────────────────────────────────────────────────────

/** One BatchPaid event, with where it was mined. */
export interface BatchEvent {
  batchId: bigint;
  payer: Address;
  lineCount: bigint;
  totalMicro: bigint;
  txHash: Hex;
  blockNumber: bigint;
}

/** One InvoicePaid event. */
export interface LineEvent {
  batchId: bigint;
  lineIndex: bigint;
  payee: Address;
  amountMicro: bigint;
  invoiceRef: Hex;
}

export interface DecodedLogs {
  batches: BatchEvent[];
  lines: LineEvent[];
}

/**
 * Decode the BatchPaid and InvoicePaid events out of raw contract logs.
 * Other events (PayeeAdded, PayeeRemoved) and removed (reorged) logs are skipped.
 * Batches come back ordered by block, then batch id.
 */
export function decodeContractLogs(logs: readonly Log[]): DecodedLogs {
  const batches: BatchEvent[] = [];
  const lines: LineEvent[] = [];

  for (const log of logs) {
    if (log.removed) continue;
    let decoded: ReturnType<typeof decodeEventLog<typeof PAYOUT_BATCH_ABI>>;
    try {
      decoded = decodeEventLog({ abi: PAYOUT_BATCH_ABI, data: log.data, topics: log.topics });
    } catch {
      // Not BatchPaid or InvoicePaid (for example PayeeAdded): not part of these figures.
      continue;
    }

    if (decoded.eventName === 'BatchPaid') {
      if (log.blockNumber === null || log.transactionHash === null) {
        throw new Error('BatchPaid log without a block number or transaction hash');
      }
      const a = decoded.args;
      batches.push({
        batchId: a.batchId,
        payer: a.payer,
        lineCount: a.lineCount,
        totalMicro: a.total,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
      });
    } else {
      const a = decoded.args;
      lines.push({
        batchId: a.batchId,
        lineIndex: a.lineIndex,
        payee: a.payee,
        amountMicro: a.amount,
        invoiceRef: a.invoiceRef,
      });
    }
  }

  batches.sort((x, y) =>
    x.blockNumber === y.blockNumber
      ? compareBig(x.batchId, y.batchId)
      : compareBig(x.blockNumber, y.blockNumber),
  );
  return { batches, lines };
}

function compareBig(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ─── Summary ─────────────────────────────────────────────────────────────────

/** What the ledger rebuild says about one batch transaction. */
export interface BatchSettlement {
  /** gasUsed x effectiveGasPrice of the batch transaction, in 18-decimal units. */
  feeNative18: bigint;
  /** ledgerTotalNative18 - nativeDelta18 for the payer. 0n means the books tie out. */
  differenceNative18: bigint;
  /** Warnings from the rebuild (for example the payer sent other transactions in the block). */
  warnings: readonly string[];
}

export interface BatchRow {
  batchId: bigint;
  txHash: Hex;
  blockNumber: bigint;
  payer: Address;
  lineCount: number;
  totalMicro: bigint;
  /** Null when no settlement was supplied for this batch. */
  feeNative18: bigint | null;
  feePerLineNative18: bigint | null;
  differenceNative18: bigint | null;
  warnings: readonly string[];
}

export interface MetricsSummary {
  batches: number;
  lines: number;
  paidMicro: bigint;
  distinctPayers: number;
  distinctPayees: number;
  /** Sum of the batch transaction fees. Null unless every batch has a settlement. */
  feeNative18: bigint | null;
  /** Fee of all batch transactions divided by all lines, half-up. Null with no lines or no fees. */
  feePerLineNative18: bigint | null;
  rows: BatchRow[];
  /** Places where the events disagree with each other. Empty when they agree. */
  inconsistencies: string[];
}

/** Integer division rounded half-up. Both inputs are non-negative and the divisor is positive. */
export function divideHalfUp(numerator: bigint, divisor: bigint): bigint {
  if (divisor <= 0n) throw new RangeError('divideHalfUp: divisor must be positive');
  if (numerator < 0n) throw new RangeError('divideHalfUp: negative numerator');
  return (numerator + divisor / 2n) / divisor;
}

/**
 * Compute the page figures from decoded events.
 *
 * `settlements` is keyed by lowercase batch transaction hash. A batch without a
 * settlement keeps its event figures and shows no fee and no tie-out.
 */
export function summarize(
  decoded: DecodedLogs,
  settlements: ReadonlyMap<string, BatchSettlement>,
): MetricsSummary {
  const { batches, lines } = decoded;
  const inconsistencies: string[] = [];

  const linesByBatch = new Map<bigint, LineEvent[]>();
  for (const line of lines) {
    const list = linesByBatch.get(line.batchId);
    if (list) list.push(line);
    else linesByBatch.set(line.batchId, [line]);
  }

  const knownBatchIds = new Set(batches.map((b) => b.batchId));
  for (const id of linesByBatch.keys()) {
    if (!knownBatchIds.has(id)) {
      inconsistencies.push(`InvoicePaid events for batch ${id} have no BatchPaid event`);
    }
  }

  const rows: BatchRow[] = batches.map((b) => {
    const own = linesByBatch.get(b.batchId) ?? [];
    const ownTotal = own.reduce((sum, l) => sum + l.amountMicro, 0n);
    if (BigInt(own.length) !== b.lineCount) {
      inconsistencies.push(
        `Batch ${b.batchId}: BatchPaid says ${b.lineCount} lines, found ${own.length} InvoicePaid events`,
      );
    }
    if (ownTotal !== b.totalMicro) {
      inconsistencies.push(
        `Batch ${b.batchId}: BatchPaid total is ${b.totalMicro} units, InvoicePaid amounts add up to ${ownTotal}`,
      );
    }

    const settlement = settlements.get(b.txHash.toLowerCase());
    const fee = settlement ? settlement.feeNative18 : null;
    return {
      batchId: b.batchId,
      txHash: b.txHash,
      blockNumber: b.blockNumber,
      payer: b.payer,
      lineCount: own.length,
      totalMicro: ownTotal,
      feeNative18: fee,
      feePerLineNative18: fee !== null && own.length > 0 ? divideHalfUp(fee, BigInt(own.length)) : null,
      differenceNative18: settlement ? settlement.differenceNative18 : null,
      warnings: settlement ? settlement.warnings : [],
    };
  });

  const fees = rows.map((r) => r.feeNative18);
  const allFees = fees.length > 0 && fees.every((f): f is bigint => f !== null);
  const feeNative18 = allFees ? fees.reduce<bigint>((s, f) => s + (f ?? 0n), 0n) : null;

  return {
    batches: batches.length,
    lines: lines.length,
    paidMicro: lines.reduce((s, l) => s + l.amountMicro, 0n),
    distinctPayers: new Set(batches.map((b) => b.payer.toLowerCase())).size,
    distinctPayees: new Set(lines.map((l) => l.payee.toLowerCase())).size,
    feeNative18,
    feePerLineNative18:
      feeNative18 !== null && lines.length > 0 ? divideHalfUp(feeNative18, BigInt(lines.length)) : null,
    rows,
    inconsistencies,
  };
}
