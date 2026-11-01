/**
 * Tests for the paged log read. Fake client only: no network, no waiting.
 */

import { expect, test } from 'bun:test';
import type { Address, Log } from 'viem';
import { fetchLogsPaged, pageRanges } from './load.js';

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
