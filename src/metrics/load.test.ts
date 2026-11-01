/**
 * Tests for the paged log read. Fake client only: no network, no waiting.
 */

import { expect, test } from 'bun:test';
import { encodeAbiParameters, encodeEventTopics, type Address, type Hex, type Log } from 'viem';
import { PAYOUT_BATCH_ABI } from '../ledger/index.js';
import type { LedgerClient } from '../ledger/rebuild.js';
import { fetchLogsPaged, loadMetrics, pacedClient, pageRanges } from './load.js';

const ADDR = '0xC86e2241166785344E4d6692E4D2A3D4c8466d0e' as Address;
const noSleep = async () => {};

test('pageRanges covers the range exactly with no overlap', () => {
  const r = pageRanges(26_689_148n, 26_709_147n, 10_000n);
  expect(r).toEqual([
    { from: 26_689_148n, to: 26_699_147n },
    { from: 26_699_148n, to: 26_709_147n },
  ]);
  expect(pageRanges(1n, 25_001n, 10_000n)[2]).toEqual({ from: 20_001n, to: 25_001n });
  expect(pageRanges(5n, 5n, 10_000n)).toEqual([{ from: 5n, to: 5n }]);
  expect(pageRanges(6n, 5n, 10_000n)).toEqual([]);
  expect(() => pageRanges(1n, 2n, 0n)).toThrow(RangeError);
});

test('no page spans more than the endpoint limit of 10,000 blocks', () => {
  for (const r of pageRanges(26_689_148n, 28_928_232n, 10_000n)) {
    expect(r.to - r.from + 1n).toBeLessThanOrEqual(10_000n);
  }
});

test('fetchLogsPaged joins the pages in order and reports progress', async () => {
  const calls: Array<[bigint, bigint]> = [];
  const client = {
    getLogs: async (a: { fromBlock: bigint; toBlock: bigint }) => {
      calls.push([a.fromBlock, a.toBlock]);
      return [{ blockNumber: a.fromBlock } as Log];
    },
  };
  const progress: Array<[number, number]> = [];
  const logs = await fetchLogsPaged(client, ADDR, 0n, 24_999n, {
    gapMs: 0,
    sleep: noSleep,
    onProgress: (d, t) => progress.push([d, t]),
  });
  expect(calls).toEqual([[0n, 9_999n], [10_000n, 19_999n], [20_000n, 24_999n]]);
  expect(logs.map((l) => l.blockNumber)).toEqual([0n, 10_000n, 20_000n]);
  expect(progress).toEqual([[0, 3], [1, 3], [2, 3], [3, 3]]);
});

test('a rate limited page is retried with a growing wait and then succeeds', async () => {
  let failures = 2;
  const waits: number[] = [];
  const client = {
    getLogs: async () => {
      if (failures-- > 0) throw new Error('rate limit exceeded');
      return [{ blockNumber: 1n } as Log];
    },
  };
  const logs = await fetchLogsPaged(client, ADDR, 0n, 5n, {
    gapMs: 0,
    retryBaseMs: 100,
    sleep: async (ms) => { waits.push(ms); },
  });
  expect(logs.length).toBe(1);
  expect(waits).toEqual([100, 200]);
});

test('the retry wait is capped', async () => {
  let failures = 5;
  const waits: number[] = [];
  const client = {
    getLogs: async () => {
      if (failures-- > 0) throw new Error('rate limit exceeded');
      return [];
    },
  };
  await fetchLogsPaged(client, ADDR, 0n, 5n, {
    gapMs: 0,
    retryBaseMs: 1_000,
    retryMaxMs: 3_000,
    sleep: async (ms) => { waits.push(ms); },
  });
  expect(waits).toEqual([1_000, 2_000, 3_000, 3_000, 3_000]);
});

test('a page that keeps failing fails the whole read, with no partial logs', async () => {
  let call = 0;
  const client = {
    getLogs: async () => {
      call++;
      if (call === 1) return [{ blockNumber: 1n } as Log];
      throw new Error('rate limit exceeded');
    },
  };
  await expect(
    fetchLogsPaged(client, ADDR, 0n, 19_999n, { gapMs: 0, attempts: 3, sleep: noSleep }),
  ).rejects.toThrow('eth_getLogs failed for blocks 10000-19999: rate limit exceeded');
  expect(call).toBe(4);
});

test('pages kept in the cache are not read again, and the last page is always read', async () => {
  const cache = new Map<string, readonly Log[]>();
  let calls = 0;
  const client = {
    getLogs: async (a: { fromBlock: bigint; toBlock: bigint }) => {
      calls++;
      return [{ blockNumber: a.fromBlock } as Log];
    },
  };
  const opts = { gapMs: 0, sleep: noSleep, cache };
  await fetchLogsPaged(client, ADDR, 0n, 24_999n, opts);
  expect(calls).toBe(3);
  // Same range again: the two full pages are cached, the page that ends at the head is not.
  const logs = await fetchLogsPaged(client, ADDR, 0n, 24_999n, opts);
  expect(calls).toBe(4);
  expect(logs.length).toBe(3);
  // A higher head: the old last page is now a full page range of its own key, so it is read once.
  await fetchLogsPaged(client, ADDR, 0n, 34_999n, opts);
  expect(calls).toBe(6);
});

test('a failed read keeps the pages it already got', async () => {
  const cache = new Map<string, readonly Log[]>();
  let call = 0;
  const client = {
    getLogs: async () => {
      call++;
      if (call === 1) return [{ blockNumber: 1n } as Log];
      throw new Error('rate limit exceeded');
    },
  };
  await expect(
    fetchLogsPaged(client, ADDR, 0n, 19_999n, { gapMs: 0, attempts: 2, sleep: noSleep, cache }),
  ).rejects.toThrow('rate limit exceeded');
  expect([...cache.keys()]).toEqual(['0-9999']);
});

test('pacedClient sends calls one at a time and retries a failing call', async () => {
  let active = 0;
  let maxActive = 0;
  let failures = 1;
  const waits: number[] = [];
  const inner = {
    getBlockNumber: async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active--;
      if (failures-- > 0) throw new Error('rate limit exceeded');
      return 7n;
    },
    getBalance: async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active--;
      return 9n;
    },
  } as unknown as LedgerClient;
  const paced = pacedClient(inner, { gapMs: 5, retryBaseMs: 10, sleep: async (ms) => { waits.push(ms); } });
  const [a, b] = await Promise.all([paced.getBlockNumber(), paced.getBalance({ address: ADDR })]);
  expect([a, b]).toEqual([7n, 9n]);
  expect(maxActive).toBe(1);
  expect(waits).toEqual([10, 5, 5]);
});

// ─── loadMetrics against a fake chain with one batch of two lines ──────────────

const PAYER = '0x429Fd794Ed2166c0F6fFef39fA6A1F580Ba64364' as Address;
const USDC = '0x3600000000000000000000000000000000000000' as Address;
const TX = ('0x' + 'c3'.repeat(32)) as Hex;
const PAYEE_A = '0xFe2b873C97CE177A0AF5e3BEad37EFE336e6a571' as Address;
const PAYEE_B = '0x5eb1f8E7b85938E2eB71a1a0A0c71c9155B79F07' as Address;
const BATCH_BLOCK = 25_000n;
const GAS_USED = 300_000n;
const GAS_PRICE = 21_000_000_000n;
const FEE = GAS_USED * GAS_PRICE;
const PAID_MICRO = 50_000n;
const PAYER_BEFORE = 5_000_000_000_000_000_000n;

function fakeChain(opts: { balanceAfterOffset?: bigint } = {}) {
  const word = (n: bigint) => n;
  const logs: Log[] = [
    {
      address: ADDR, blockNumber: BATCH_BLOCK, transactionHash: TX, removed: false,
      topics: encodeEventTopics({ abi: PAYOUT_BATCH_ABI, eventName: 'InvoicePaid', args: { batchId: 1n, payee: PAYEE_A, invoiceRef: ('0x' + '01'.repeat(32)) as Hex } }),
      data: encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [0n, word(20_000n)]),
    } as Log,
    {
      address: ADDR, blockNumber: BATCH_BLOCK, transactionHash: TX, removed: false,
      topics: encodeEventTopics({ abi: PAYOUT_BATCH_ABI, eventName: 'InvoicePaid', args: { batchId: 1n, payee: PAYEE_B, invoiceRef: ('0x' + '02'.repeat(32)) as Hex } }),
      data: encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [1n, word(30_000n)]),
    } as Log,
    {
      address: ADDR, blockNumber: BATCH_BLOCK, transactionHash: TX, removed: false,
      topics: encodeEventTopics({ abi: PAYOUT_BATCH_ABI, eventName: 'BatchPaid', args: { batchId: 1n, payer: PAYER } }),
      data: encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [2n, PAID_MICRO]),
    } as Log,
  ];
  const nativeAt = (block: bigint) =>
    block < BATCH_BLOCK ? PAYER_BEFORE : PAYER_BEFORE - PAID_MICRO * 1_000_000_000_000n - FEE - (opts.balanceAfterOffset ?? 0n);
  return {
    getBlockNumber: async () => 25_050n,
    getLogs: async (a: { fromBlock: bigint; toBlock: bigint }) =>
      logs.filter((l) => l.blockNumber! >= a.fromBlock && l.blockNumber! <= a.toBlock),
    getTransactionReceipt: async () => ({
      blockNumber: BATCH_BLOCK, status: 'success', gasUsed: GAS_USED, effectiveGasPrice: GAS_PRICE, transactionHash: TX,
    }),
    getBlock: async () => ({ transactions: [{ from: PAYER, hash: TX }] }),
    readContract: async (a: { blockNumber: bigint }) => nativeAt(a.blockNumber) / 1_000_000_000_000n,
    getBalance: async (a: { address: Address; blockNumber?: bigint }) =>
      a.address === ADDR ? 0n : nativeAt(a.blockNumber ?? 0n),
  } as unknown as LedgerClient;
}

const fast = { gapMs: 0, retryBaseMs: 0, sleep: async () => {} };

test('loadMetrics reads logs, the ledger tie-out and the contract balance', async () => {
  const snap = await loadMetrics({
    client: fakeChain(), contract: ADDR, usdc: USDC, deployBlock: 24_000n, fetchOptions: fast,
  });
  expect(snap.headBlock).toBe(25_050n);
  expect(snap.pages).toBe(1);
  expect(snap.contractBalanceNative18).toBe(0n);
  const s = snap.summary;
  expect(s).toMatchObject({ batches: 1, lines: 2, paidMicro: 50_000n, distinctPayers: 1, distinctPayees: 2 });
  expect(s.feeNative18).toBe(FEE);
  expect(s.feePerLineNative18).toBe(FEE / 2n);
  expect(s.rows[0].differenceNative18).toBe(0n);
  expect(s.inconsistencies).toEqual([]);
});

test('loadMetrics reports a tie-out difference instead of hiding it', async () => {
  const snap = await loadMetrics({
    client: fakeChain({ balanceAfterOffset: 1_000n }), contract: ADDR, usdc: USDC, deployBlock: 24_000n, fetchOptions: fast,
  });
  expect(snap.summary.rows[0].differenceNative18).toBe(-1_000n);
});

test('loadMetrics fails with no snapshot when the RPC keeps failing', async () => {
  const broken = {
    ...fakeChain(),
    getLogs: async () => { throw new Error('rate limit exceeded'); },
  } as unknown as LedgerClient;
  await expect(
    loadMetrics({ client: broken, contract: ADDR, usdc: USDC, deployBlock: 24_000n, fetchOptions: { ...fast, attempts: 2 } }),
  ).rejects.toThrow('eth_getLogs failed for blocks 24000-25050: rate limit exceeded');
});
