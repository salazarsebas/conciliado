/**
 * rebuildLedger — reconstruct a payer's ledger for one PayoutBatch batch
 * from chain data only and tie it to the payer's balance change.
 *
 * BALANCE DELTA RATIONALE:
 *   We read balanceOf(payer) at block B-1 and block B (the batch block).
 *   B-1 is the state immediately before the batch block executed; B is the
 *   state after.  delta = before - after (positive = money left the payer).
 *   If the payer had other transactions in block B, payerTxCountInBlock will
 *   be > 1 and a warning is added — the delta would include those txs too.
 *
 * ROUNDING:
 *   Fee is gasUsed × effectiveGasPrice in native18 units, converted to micro
 *   with nativeToMicro (half-up).  ledgerTotalMicro = Σ payouts + feeMicro.
 *   ledgerTotalNative18 = Σ payouts × 10^12 + feeNative18 (exact).
 *
 * ARC FINALITY:
 *   Arc has deterministic finality; we use 'pending' | 'final' only.
 *   A reverted receipt is still 'final': only the fee row is booked.
 */

import {
  type Address,
  type Hex,
  type Log,
  type PublicClient,
  type TransactionReceipt,
  decodeEventLog,
  parseAbi,
} from 'viem';
import { formatMicro, formatUsd2, microToNative, nativeToMicro } from './money.js';
import { makeInvoiceRef } from './ref.js';

// ─── ABI fragments ─────────────────────────────────────────────────────────

const ERC20_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);

/** Event ABI of PayoutBatch that the ledger and the metrics page both decode. */
export const PAYOUT_BATCH_ABI = parseAbi([
  'event InvoicePaid(uint256 indexed batchId, uint256 lineIndex, address indexed payee, uint256 amount, bytes32 indexed invoiceRef)',
  'event BatchPaid(uint256 indexed batchId, address indexed payer, uint256 lineCount, uint256 total)',
]);

// ─── Public types ──────────────────────────────────────────────────────────

/** Subset of viem PublicClient needed by rebuildLedger. */
export type LedgerClient = Pick<
  PublicClient,
  'getLogs' | 'getTransactionReceipt' | 'getBlock' | 'getBlockNumber' | 'getBalance' | 'readContract'
>;

/**
 * A local invoice to join against on-chain data.
 *
 * Two forms are supported:
 *   1. `{ invoiceId, salt }` — the ref is derived with makeInvoiceRef(invoiceId, salt).
 *      This is the programmatic path (random salt chosen at invoice creation time).
 *   2. `{ invoiceId, invoiceRef }` — the ref is already known (e.g. read from a CSV
 *      that was generated when the invoice was first submitted to the contract).
 *      The salt field is not required and is not stored in the CSV.
 *
 * Exactly one of `salt` or `invoiceRef` must be present.
 *
 * Optional cross-checks (both are optional; omitting both keeps ref-only behavior):
 *   `payee`       — compared case-insensitively against the on-chain payee address.
 *   `amountMicro` — compared as exact bigint against the on-chain amount (6-decimal USDC).
 * When a cross-check field is present and the on-chain value differs, the row becomes
 * a MismatchedInvoice rather than a MatchedInvoice.
 */
export type LocalInvoice =
  | { invoiceId: string; salt: Hex; invoiceRef?: never; payee?: Address; amountMicro?: bigint }
  | { invoiceId: string; invoiceRef: Hex; salt?: never; payee?: Address; amountMicro?: bigint };

/** One InvoicePaid line in the reconstructed ledger. */
export interface PayoutRow {
  lineIndex: bigint;
  payee: Address;
  invoiceRef: Hex;
  amountMicro: bigint;
}

/** The single fee row: gas cost of the payBatch transaction. */
export interface FeeRow {
  txHash: Hex;
  gasUsed: bigint;
  effectiveGasPrice: bigint;
  feeNative18: bigint;
  feeMicro: bigint;
}

/** A local invoice whose ref was found on-chain. */
export interface MatchedInvoice {
  invoiceId: string;
  /** Absent when the invoice was provided with a pre-computed invoiceRef (CSV path). */
  salt?: Hex;
  ref: Hex;
  lineIndex: bigint;
  payee: Address;
  amountMicro: bigint;
}

/**
 * A local invoice whose ref was found on-chain, but whose payee and/or amount
 * does not match the local invoice. It is NOT counted as matched.
 */
export interface MismatchedInvoice {
  invoiceId: string;
  ref: Hex;
  lineIndex: bigint;
  /** What the local invoice expected (only the fields that were provided). */
  expected: { payee?: Address; amountMicro?: bigint };
  /** What was actually found on chain. */
  actual: { payee: Address; amountMicro: bigint };
  /** Which fields differ. */
  fields: Array<'payee' | 'amount'>;
}

/** Full result returned by rebuildLedger. */
export interface LedgerResult {
  status: 'pending' | 'final';

  // Receipt status (only present when status === 'final')
  receiptStatus?: 'success' | 'reverted';

  // Ledger rows (empty when pending or reverted)
  payoutRows: PayoutRow[];
  feeRow: FeeRow | null;

  // Totals
  ledgerTotalMicro: bigint | null;
  ledgerTotalNative18: bigint | null;

  // Balance deltas (null when pending)
  usdcDeltaMicro: bigint | null;
  nativeDelta18: bigint | null;

  // Tie-out
  differenceMicro: bigint | null;     // ledgerTotalMicro - usdcDeltaMicro
  differenceNative18: bigint | null;  // ledgerTotalNative18 - nativeDelta18
  differenceDisplay: string | null;   // formatUsd2(differenceMicro)
  differenceExact: string | null;     // formatMicro(differenceMicro)

  // Block context
  blockNumber: bigint | null;
  txHash: Hex | null;
  batchId: bigint | null;
  payerTxCountInBlock: number | null;

  // Invoice join
  matched: MatchedInvoice[];
  mismatched: MismatchedInvoice[];   // ref found on-chain but payee or amount differs
  unmatchedOnChain: Hex[];           // refs on-chain with no local invoice hashing to them
  unmatchedLocal: LocalInvoice[];    // local invoices whose ref is not on-chain for this batch

  matchedCount: number;
  mismatchedCount: number;
  unmatchedOnChainCount: number;
  unmatchedLocalCount: number;

  warnings: string[];
}

/** Thrown when BatchPaid payer, lineCount, or total is inconsistent with InvoicePaid logs. */
export class LedgerInconsistencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerInconsistencyError';
  }
}

/** Thrown when BatchPaid.payer doesn't match the requested payer. */
export class PayerMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PayerMismatchError';
  }
}

// ─── Args ──────────────────────────────────────────────────────────────────

export interface RebuildArgs {
  client: LedgerClient;
  contract: Address;
  payer: Address;
  usdc?: Address;
  target: { txHash: Hex } | { batchId: bigint; fromBlock: bigint; toBlock?: bigint };
  invoiceList: LocalInvoice[];
  /** Max blocks per getLogs page (inclusive). Default 10_000n. */
  blockRangePerPage?: bigint;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const DEFAULT_USDC = '0x3600000000000000000000000000000000000000' as Address;
const DEFAULT_PAGE = 10_000n;

/** Fetch all logs for the contract in [fromBlock, toBlock] with paging. */
async function fetchAllLogs(
  client: LedgerClient,
  address: Address,
  fromBlock: bigint,
  toBlock: bigint,
  pageSize: bigint,
): Promise<Log[]> {
  const all: Log[] = [];
  let cursor = fromBlock;
  while (cursor <= toBlock) {
    const end = cursor + pageSize - 1n <= toBlock ? cursor + pageSize - 1n : toBlock;
    const page = await client.getLogs({
      address,
      fromBlock: cursor,
      toBlock: end,
    });
    all.push(...page);
    cursor = end + 1n;
  }
  return all;
}

// ─── Main ──────────────────────────────────────────────────────────────────

export async function rebuildLedger(args: RebuildArgs): Promise<LedgerResult> {
  const {
    client,
    contract,
    payer,
    usdc = DEFAULT_USDC,
    target,
    invoiceList,
    blockRangePerPage = DEFAULT_PAGE,
  } = args;

  const warnings: string[] = [];
  const emptyJoin = buildJoin([], invoiceList);

  // ── Pending check ─────────────────────────────────────────────────────

  // For txHash mode: get receipt first
  let receipt: TransactionReceipt | null = null;
  let resolvedTxHash: Hex | null = null;

  if ('txHash' in target) {
    try {
      receipt = await client.getTransactionReceipt({ hash: target.txHash });
      resolvedTxHash = target.txHash;
    } catch (e: unknown) {
      // TransactionReceiptNotFoundError → pending
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('TransactionReceiptNotFound') || msg.includes('not found') || msg.includes('could not be found')) {
        return {
          status: 'pending',
          receiptStatus: undefined,
          payoutRows: [],
          feeRow: null,
          ledgerTotalMicro: null,
          ledgerTotalNative18: null,
          usdcDeltaMicro: null,
          nativeDelta18: null,
          differenceMicro: null,
          differenceNative18: null,
          differenceDisplay: null,
          differenceExact: null,
          blockNumber: null,
          txHash: target.txHash,
          batchId: null,
          payerTxCountInBlock: null,
          ...emptyJoin,
          warnings,
        };
      }
      throw e;
    }
  }

  // ── Fetch logs ────────────────────────────────────────────────────────

  let rawLogs: Log[];
  let blockNum: bigint;
  let txHash: Hex;
  let batchId: bigint;

  if ('txHash' in target) {
    // Receipt already in hand; use its block as from=to
    blockNum = receipt!.blockNumber;
    txHash = target.txHash;
    const page = await fetchAllLogs(client, contract, blockNum, blockNum, blockRangePerPage);
    rawLogs = page.filter((l) => l.transactionHash?.toLowerCase() === target.txHash.toLowerCase());
  } else {
    // batchId mode: page fromBlock→toBlock, filter by indexed batchId
    const toBlock = target.toBlock ?? (await client.getBlockNumber());
    rawLogs = await fetchAllLogs(client, contract, target.fromBlock, toBlock, blockRangePerPage);
    // Filter to the requested batchId using topic matching
    const batchIdHex = target.batchId.toString(16).padStart(64, '0');
    rawLogs = rawLogs.filter(
      (l) => l.topics[1]?.toLowerCase() === ('0x' + batchIdHex).toLowerCase(),
    );

    if (rawLogs.length === 0) {
      // No logs yet → pending
      return {
        status: 'pending',
        receiptStatus: undefined,
        payoutRows: [],
        feeRow: null,
        ledgerTotalMicro: null,
        ledgerTotalNative18: null,
        usdcDeltaMicro: null,
        nativeDelta18: null,
        differenceMicro: null,
        differenceNative18: null,
        differenceDisplay: null,
        differenceExact: null,
        blockNumber: null,
        txHash: null,
        batchId: target.batchId,
        payerTxCountInBlock: null,
        ...emptyJoin,
        warnings,
      };
    }

    blockNum = rawLogs[0].blockNumber!;
    txHash = rawLogs[0].transactionHash as Hex;
    receipt = await client.getTransactionReceipt({ hash: txHash });
    resolvedTxHash = txHash;
  }

  // ── Decode logs ───────────────────────────────────────────────────────

  const invoicePaidLogs: Array<{
    lineIndex: bigint;
    payee: Address;
    amount: bigint;
    invoiceRef: Hex;
    logBatchId: bigint;
  }> = [];
  let batchPaid: { batchId: bigint; payer: Address; lineCount: bigint; total: bigint } | null = null;

  for (const log of rawLogs) {
    try {
      // Try InvoicePaid
      const decoded = decodeEventLog({
        abi: PAYOUT_BATCH_ABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === 'InvoicePaid') {
        const a = decoded.args;
        invoicePaidLogs.push({
          lineIndex: a.lineIndex,
          payee: a.payee,
          amount: a.amount,
          invoiceRef: a.invoiceRef,
          logBatchId: a.batchId,
        });
      } else if (decoded.eventName === 'BatchPaid') {
        const a = decoded.args;
        batchPaid = { batchId: a.batchId, payer: a.payer, lineCount: a.lineCount, total: a.total };
      }
    } catch {
      // Unrecognised log from other contracts or events — skip
    }
  }

  // Derive batchId from logs
  if (batchPaid) {
    batchId = batchPaid.batchId;
  } else if (invoicePaidLogs.length > 0) {
    batchId = invoicePaidLogs[0].logBatchId;
  } else {
    batchId = 'batchId' in target ? target.batchId : 0n;
  }

  // ── Validate BatchPaid ─────────────────────────────────────────────────

  if (batchPaid) {
    const payerLower = payer.toLowerCase();
    if (batchPaid.payer.toLowerCase() !== payerLower) {
      throw new PayerMismatchError(
        `BatchPaid.payer ${batchPaid.payer} does not match requested payer ${payer}`,
      );
    }
    if (batchPaid.lineCount !== BigInt(invoicePaidLogs.length)) {
      throw new LedgerInconsistencyError(
        `BatchPaid.lineCount=${batchPaid.lineCount} but found ${invoicePaidLogs.length} InvoicePaid logs`,
      );
    }
    const computedTotal = invoicePaidLogs.reduce((s, l) => s + l.amount, 0n);
    if (batchPaid.total !== computedTotal) {
      throw new LedgerInconsistencyError(
        `BatchPaid.total=${batchPaid.total} but sum of InvoicePaid.amount=${computedTotal}`,
      );
    }
  }

  // ── Receipt and fee ───────────────────────────────────────────────────

  txHash = resolvedTxHash ?? (receipt?.transactionHash as Hex);
  const finalReceipt = receipt!;
  const isReverted = finalReceipt.status === 'reverted';

  const feeNative18 = finalReceipt.gasUsed * finalReceipt.effectiveGasPrice;
  const feeMicro = nativeToMicro(feeNative18);
  const feeRow: FeeRow = {
    txHash,
    gasUsed: finalReceipt.gasUsed,
    effectiveGasPrice: finalReceipt.effectiveGasPrice,
    feeNative18,
    feeMicro,
  };

  // ── Payout rows (skipped if reverted) ─────────────────────────────────

  const payoutRows: PayoutRow[] = isReverted
    ? []
    : invoicePaidLogs.map((l) => ({
        lineIndex: l.lineIndex,
        payee: l.payee,
        invoiceRef: l.invoiceRef,
        amountMicro: l.amount,
      }));

  const payoutSumMicro = payoutRows.reduce((s, r) => s + r.amountMicro, 0n);
  const ledgerTotalMicro = payoutSumMicro + feeMicro;
  const ledgerTotalNative18 = microToNative(payoutSumMicro) + feeNative18;

  // ── Balance delta ─────────────────────────────────────────────────────

  const B = finalReceipt.blockNumber;
  const Bm1 = B - 1n;

  const [usdcBefore, usdcAfter, nativeBefore, nativeAfter] = await Promise.all([
    client.readContract({
      address: usdc,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [payer],
      blockNumber: Bm1,
    }),
    client.readContract({
      address: usdc,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [payer],
      blockNumber: B,
    }),
    client.getBalance({ address: payer, blockNumber: Bm1 }),
    client.getBalance({ address: payer, blockNumber: B }),
  ]);

  const usdcDeltaMicro = usdcBefore - usdcAfter;
  const nativeDelta18 = nativeBefore - nativeAfter;

  // ── Block context ─────────────────────────────────────────────────────

  const block = await client.getBlock({ blockNumber: B, includeTransactions: true });
  const txs = block.transactions as unknown as Array<{ from: string; hash: string }>;
  const payerTxCountInBlock = txs.filter((t) => t.from?.toLowerCase() === payer.toLowerCase()).length;
  if (payerTxCountInBlock !== 1) {
    warnings.push(
      `payerTxCountInBlock=${payerTxCountInBlock}: the payer sent more than one tx in block ${B}; balance delta may include other transactions`,
    );
  }

  // ── Tie-out ───────────────────────────────────────────────────────────

  const differenceMicro = ledgerTotalMicro - usdcDeltaMicro;
  const differenceNative18 = ledgerTotalNative18 - nativeDelta18;
  const differenceDisplay = formatUsd2(differenceMicro < 0n ? -differenceMicro : differenceMicro);
  const differenceExact = formatMicro(differenceMicro);

  // ── Invoice join ──────────────────────────────────────────────────────

  const join = buildJoin(payoutRows, invoiceList);

  return {
    status: 'final',
    receiptStatus: isReverted ? 'reverted' : 'success',
    payoutRows,
    feeRow,
    ledgerTotalMicro,
    ledgerTotalNative18,
    usdcDeltaMicro,
    nativeDelta18,
    differenceMicro,
    differenceNative18,
    differenceDisplay,
    differenceExact,
    blockNumber: B,
    txHash,
    batchId,
    payerTxCountInBlock,
    ...join,
    warnings,
  };
}

// ─── Join helper ───────────────────────────────────────────────────────────

function buildJoin(
  payoutRows: PayoutRow[],
  invoiceList: LocalInvoice[],
): Pick<LedgerResult, 'matched' | 'mismatched' | 'unmatchedOnChain' | 'unmatchedLocal' | 'matchedCount' | 'mismatchedCount' | 'unmatchedOnChainCount' | 'unmatchedLocalCount'> {
  const onChainRefSet = new Map<string, PayoutRow>();
  for (const row of payoutRows) {
    onChainRefSet.set(row.invoiceRef.toLowerCase(), row);
  }

  const matched: MatchedInvoice[] = [];
  const mismatched: MismatchedInvoice[] = [];
  const unmatchedLocal: LocalInvoice[] = [];
  // Tracks refs claimed by matched OR mismatched (so they are not also unmatchedOnChain)
  const claimedRefs = new Set<string>();

  for (const inv of invoiceList) {
    // Resolve the ref: use the pre-computed one (CSV path) or derive it (salt path).
    const ref: Hex = inv.invoiceRef ?? makeInvoiceRef(inv.invoiceId, inv.salt);
    const row = onChainRefSet.get(ref.toLowerCase());
    if (!row) {
      unmatchedLocal.push(inv);
      continue;
    }

    // Cross-check payee and amount when the local invoice provides them.
    const fields: Array<'payee' | 'amount'> = [];
    if (inv.payee !== undefined && inv.payee.toLowerCase() !== row.payee.toLowerCase()) {
      fields.push('payee');
    }
    if (inv.amountMicro !== undefined && inv.amountMicro !== row.amountMicro) {
      fields.push('amount');
    }

    if (fields.length > 0) {
      mismatched.push({
        invoiceId: inv.invoiceId,
        ref,
        lineIndex: row.lineIndex,
        expected: {
          ...(inv.payee !== undefined ? { payee: inv.payee } : {}),
          ...(inv.amountMicro !== undefined ? { amountMicro: inv.amountMicro } : {}),
        },
        actual: { payee: row.payee, amountMicro: row.amountMicro },
        fields,
      });
    } else {
      matched.push({
        invoiceId: inv.invoiceId,
        ...(inv.salt !== undefined ? { salt: inv.salt } : {}),
        ref,
        lineIndex: row.lineIndex,
        payee: row.payee,
        amountMicro: row.amountMicro,
      });
    }
    claimedRefs.add(ref.toLowerCase());
  }

  const unmatchedOnChain: Hex[] = [];
  for (const [refLower] of onChainRefSet) {
    if (!claimedRefs.has(refLower)) {
      unmatchedOnChain.push(refLower as Hex);
    }
  }

  return {
    matched,
    mismatched,
    unmatchedOnChain,
    unmatchedLocal,
    matchedCount: matched.length,
    mismatchedCount: mismatched.length,
    unmatchedOnChainCount: unmatchedOnChain.length,
    unmatchedLocalCount: unmatchedLocal.length,
  };
}
