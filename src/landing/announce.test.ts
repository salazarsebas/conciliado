import { expect, test } from 'bun:test';
import { announceRebuild } from './announce.js';
import type { PageState } from './use-rebuild.js';
import type { LedgerViewModel } from './view-model.js';

const vm = {
  matchSummary: '6 of 6 matched',
  tieOut: { resultWord: 'Ties out. 6 of 6 matched.' },
} as unknown as LedgerViewModel;

test('announce: empty says nothing', () => {
  expect(announceRebuild({ kind: 'empty' }, 'Arc mainnet')).toEqual({ status: '', alert: '' });
});

test('announce: loading is announced politely with the network name', () => {
  const a = announceRebuild({ kind: 'loading', elapsedMs: 0 }, 'Arc mainnet');
  expect(a.status).toContain('Rebuilding the ledger from Arc mainnet');
  expect(a.alert).toBe('');
});

test('announce: elapsed time does not change the loading text', () => {
  const a = announceRebuild({ kind: 'loading', elapsedMs: 100 }, 'Arc mainnet');
  const b = announceRebuild({ kind: 'loading', elapsedMs: 5000 }, 'Arc mainnet');
  expect(a).toEqual(b);
});

test('announce: ready reports the match summary and the tie-out result', () => {
  const state: PageState = { kind: 'ready', vm, durationMs: 1 };
  expect(announceRebuild(state, 'Arc mainnet').status).toBe('Ledger rebuilt. 6 of 6 matched. Ties out. 6 of 6 matched.');
});

test('announce: cached reports the cached ledger', () => {
  const state: PageState = { kind: 'cached', vm, cachedAtUtc: '2026-01-01T00:00:00.000Z', durationMs: 1 };
  expect(announceRebuild(state, 'Arc mainnet').status).toBe('Showing cached ledger. 6 of 6 matched.');
});

test('announce: error goes to the assertive alert and says no USDC moved', () => {
  const a = announceRebuild({ kind: 'error', message: 'The Arc RPC could not be reached.', detail: '' }, 'Arc mainnet');
  expect(a.alert).toBe('The Arc RPC could not be reached. No USDC moved.');
  expect(a.status).toBe('');
});
