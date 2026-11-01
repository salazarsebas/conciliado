/**
 * Live read of the PayoutBatch contract for the /metrics page.
 *
 * Read-only: getLogs, getBlockNumber, getBalance, and the existing ledger rebuild
 * (receipt, logs of one block, balances). No transaction, no key, no wallet.
 *
 * eth_getLogs on https://rpc.mainnet.arc.io answers "requested range too large" above
 * 10,000 blocks per call, so the scan from the deploy block is paged. The same endpoint
 * rate limits (-32005) when pages are sent faster than about two a second, in runs that
 * need up to 30 seconds of waiting to clear, and a
 * JSON-RPC batch does not help because every call in it counts. Pages are therefore
 * sent one at a time with a short gap, and a limited page is retried with a growing wait.
 * Any page that still fails ends the whole load: partial logs would give wrong totals.
 */

import type { Address, Log } from 'viem';
import { rebuildLedgerSettled } from '../ledger/rebuild-settled.js';
import type { LedgerClient } from '../ledger/rebuild.js';
import {
  decodeContractLogs,
  summarize,
  type BatchSettlement,
  type MetricsSummary,
} from './aggregate.js';

export interface PageRange {
  from: bigint;
  to: bigint;
}

/** Split [from, to] into inclusive ranges of at most `size` blocks. */
export function pageRanges(from: bigint, to: bigint, size: bigint): PageRange[] {
  if (size <= 0n) throw new RangeError('pageRanges: size must be positive');
  const ranges: PageRange[] = [];
  for (let cursor = from; cursor <= to; cursor += size) {
    const end = cursor + size - 1n;
    ranges.push({ from: cursor, to: end <= to ? end : to });
  }
  return ranges;
}

export interface FetchOptions {
  /** Blocks per eth_getLogs call. The measured limit of the endpoint is 10,000. */
  pageSize?: bigint;
  /** Pause after each successful page, in ms. */
  gapMs?: number;
  /** Tries per page, the first one included. */
  attempts?: number;
  /** First retry wait in ms; it doubles on each retry up to retryMaxMs. */
  retryBaseMs?: number;
  retryMaxMs?: number;
  /**
   * Pages already read, keyed "from-to". A page that ends before the head is final (Arc has
   * deterministic finality), so a retry or a second read in the same session skips it.
   * The map is filled as pages arrive, so a failed read keeps what it got.
   */
  cache?: Map<string, readonly Log[]>;
  onProgress?: (done: number, total: number) => void;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface RetryOptions {
  attempts: number;
  retryBaseMs: number;
  retryMaxMs: number;
  sleep: (ms: number) => Promise<void>;
}

/** Run `fn`, retrying after a growing wait. Throws the last error once the tries are used. */
async function withRetry<T>(fn: () => Promise<T>, o: RetryOptions): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < o.attempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      if (attempt < o.attempts - 1) await o.sleep(Math.min(o.retryBaseMs * 2 ** attempt, o.retryMaxMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

const LEDGER_METHODS = [
  'getLogs',
  'getTransactionReceipt',
  'getBlock',
  'getBlockNumber',
  'getBalance',
  'readContract',
] as const;

/**
 * Wrap a ledger client so every call goes one at a time, with `gapMs` between calls and a
 * retry on any error. The public RPC rate limits the whole endpoint, not only getLogs, and
 * rebuildLedger sends several reads at once, so the existing ledger code needs the same
 * pacing as the log scan. Used only for reads.
 */
export function pacedClient(
  client: LedgerClient,
  { gapMs = 400, attempts = 12, retryBaseMs = 1_000, retryMaxMs = 8_000, sleep = defaultSleep }: Partial<RetryOptions> & { gapMs?: number } = {},
): LedgerClient {
  let queue: Promise<unknown> = Promise.resolve();
  const wrapped: Record<string, unknown> = {};
  for (const method of LEDGER_METHODS) {
    wrapped[method] = (...args: unknown[]) => {
      const call = () => (client[method] as (...a: unknown[]) => Promise<unknown>)(...args);
      const result = queue.then(() => withRetry(call, { attempts, retryBaseMs, retryMaxMs, sleep }));
      queue = result.then(
        () => sleep(gapMs),
        () => sleep(gapMs),
      );
      return result;
    };
  }
  // The wrapper has the same six methods with the same signatures; only timing differs.
  return wrapped as unknown as LedgerClient;
}

/** The one client method the paging needs; viem's PublicClient satisfies it. */
export interface LogsClient {
  getLogs(args: { address: Address; fromBlock: bigint; toBlock: bigint }): Promise<readonly Log[]>;
}

/** Page eth_getLogs for one address. Throws if any page fails after its retries. */
export async function fetchLogsPaged(
  client: LogsClient,
  address: Address,
  fromBlock: bigint,
  toBlock: bigint,
  {
    pageSize = 10_000n,
    gapMs = 400,
    attempts = 12,
    retryBaseMs = 1_000,
    retryMaxMs = 8_000,
    cache,
    onProgress,
    sleep = defaultSleep,
  }: FetchOptions = {},
): Promise<Log[]> {
  const ranges = pageRanges(fromBlock, toBlock, pageSize);
  const all: Log[] = [];
  onProgress?.(0, ranges.length);

  for (const [i, range] of ranges.entries()) {
    const key = `${range.from}-${range.to}`;
    const cached = range.to < toBlock ? cache?.get(key) : undefined;
    if (cached) {
      all.push(...cached);
      onProgress?.(i + 1, ranges.length);
      continue;
    }
    let page: Log[];
    try {
      page = await withRetry(
        async () => [...(await client.getLogs({ address, fromBlock: range.from, toBlock: range.to }))],
        { attempts, retryBaseMs, retryMaxMs, sleep },
      );
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`eth_getLogs failed for blocks ${range.from}-${range.to}: ${reason}`);
    }
    all.push(...page);
    if (range.to < toBlock) cache?.set(key, page);
    onProgress?.(i + 1, ranges.length);
    if (i < ranges.length - 1 && gapMs > 0) await sleep(gapMs);
  }
  return all;
}

// ─── Whole load ──────────────────────────────────────────────────────────────

export interface MetricsSnapshot {
  summary: MetricsSummary;
  /** Native balance of the contract, 18 decimals. */
  contractBalanceNative18: bigint;
  /** Block the scan ended at. */
  headBlock: bigint;
  fromBlock: bigint;
  /** Pages of eth_getLogs the scan used. */
  pages: number;
}

export type LoadPhase =
  | { kind: 'logs'; done: number; total: number }
  | { kind: 'batches'; done: number; total: number };

export interface LoadArgs {
  client: LedgerClient;
  contract: Address;
  usdc: Address;
  deployBlock: bigint;
  onPhase?: (phase: LoadPhase) => void;
  fetchOptions?: FetchOptions;
  /** Pages kept between reads in one session; see FetchOptions.cache. */
  logCache?: Map<string, readonly Log[]>;
}

export async function loadMetrics({
  client,
  contract,
  usdc,
  deployBlock,
  onPhase,
  fetchOptions,
  logCache,
}: LoadArgs): Promise<MetricsSnapshot> {
  // One pacing and retry layer for every call, the log scan and the ledger rebuild alike.
  const paced = pacedClient(client, fetchOptions);
  const headBlock = await paced.getBlockNumber();
  let pages = 0;
  const logs = await fetchLogsPaged(paced, contract, deployBlock, headBlock, {
    ...fetchOptions,
    gapMs: 0,
    attempts: 1,
    cache: logCache,
    onProgress: (done, total) => {
      pages = total;
      onPhase?.({ kind: 'logs', done, total });
    },
  });

  const decoded = decodeContractLogs(logs);

  // Fee and tie-out per batch come from the existing ledger rebuild, which reads the
  // receipt, the logs of the batch block, and the payer balance before and after.
  const settlements = new Map<string, BatchSettlement>();
  onPhase?.({ kind: 'batches', done: 0, total: decoded.batches.length });
  for (const [i, batch] of decoded.batches.entries()) {
    const result = await rebuildLedgerSettled({
      client: paced,
      contract,
      payer: batch.payer,
      usdc,
      target: { txHash: batch.txHash },
      invoiceList: [],
    });
    if (
      result.status !== 'final' ||
      result.feeRow === null ||
      result.differenceNative18 === null
    ) {
      throw new Error(`No receipt yet for batch ${batch.batchId} (${batch.txHash})`);
    }
    settlements.set(batch.txHash.toLowerCase(), {
      feeNative18: result.feeRow.feeNative18,
      differenceNative18: result.differenceNative18,
      warnings: result.warnings,
    });
    onPhase?.({ kind: 'batches', done: i + 1, total: decoded.batches.length });
  }

  const contractBalanceNative18 = await paced.getBalance({ address: contract });

  return {
    summary: summarize(decoded, settlements),
    contractBalanceNative18,
    headBlock,
    fromBlock: deployBlock,
    pages,
  };
}
