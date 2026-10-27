/**
 * useRebuild: the state machine for the landing page.
 *
 * Manages Empty, Loading, Ready/Error states, localStorage cache,
 * performance measurement, and run history.
 */

import { useCallback, useRef, useState } from 'react';
import type { Address, Hex } from 'viem';
import type { LocalInvoice } from '../ledger/index.js';
import { rebuildLedger } from '../ledger/index.js';
import type { LedgerClient } from '../ledger/rebuild.js';
import {
  BATCH_TX,
  CACHE_KEY,
  HISTORY_KEY,
  HISTORY_MAX,
  CONTRACT_ADDRESS,
  PAYER_ADDRESS,
  USDC_ADDRESS,
} from './batch.js';
import { buildViewModel, type LedgerViewModel, type CachedRebuild } from './view-model.js';

// ─── Types ─────────────────────────────────────────────────────────────────

export type PageState =
  | { kind: 'empty' }
  | { kind: 'loading'; elapsedMs: number }
  | { kind: 'ready'; vm: LedgerViewModel; durationMs: number }
  | { kind: 'error'; message: string; detail: string }
  | { kind: 'cached'; vm: LedgerViewModel; cachedAtUtc: string; durationMs: number };

export interface RunRecord {
  durationMs: number;
  ok: boolean;
  utc: string;
}

// ─── Bigint JSON serialization ──────────────────────────────────────────────

function serializeVm(vm: LedgerViewModel): string {
  return JSON.stringify(vm, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() + 'n' : v));
}

function deserializeVm(json: string): LedgerViewModel {
  return JSON.parse(json, (_k, v: unknown) => {
    if (typeof v === 'string' && v.endsWith('n') && /^-?\d+n$/.test(v)) {
      return BigInt(v.slice(0, -1));
    }
    return v;
  }) as LedgerViewModel;
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export interface RebuildOverrides {
  /** Override the batch tx hash (for ?tx= query param). */
  txHash?: Hex;
  /** Override the payer address. */
  payer?: Address;
  /** Override the PayoutBatch contract address. */
  contract?: Address;
  /** Override the USDC address. */
  usdc?: Address;
}

export function useRebuild(
  getClient: () => LedgerClient,
  invoiceList: LocalInvoice[],
  overrides?: RebuildOverrides,
) {
  const [state, setState] = useState<PageState>({ kind: 'empty' });
  const [history, setHistory] = useState<RunRecord[]>(() => {
    // Load run history from localStorage at mount time (lazy initializer, no effect needed)
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) return JSON.parse(raw) as RunRecord[];
    } catch { /* ignore */ }
    return [];
  });
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const clearElapsed = useCallback(() => {
    if (elapsedTimer.current) {
      clearInterval(elapsedTimer.current);
      elapsedTimer.current = null;
    }
  }, []);

  const rebuild = useCallback(async () => {
    clearElapsed();

    const startMark = 'conciliado:rebuild-6:start';
    const endMark = 'conciliado:rebuild-6:end';
    performance.mark(startMark);
    startTimeRef.current = performance.now();

    setState({ kind: 'loading', elapsedMs: 0 });

    // Tick the elapsed timer every 100 ms
    elapsedTimer.current = setInterval(() => {
      setState((prev) =>
        prev.kind === 'loading'
          ? { kind: 'loading', elapsedMs: Math.round(performance.now() - startTimeRef.current) }
          : prev,
      );
    }, 100);

    let durationMs = 0;

    try {
      const client = getClient();

      // When a txHash override is provided (tx query param), fetch the payer from chain
      let resolvedPayer = overrides?.payer ?? PAYER_ADDRESS;
      const resolvedTxHash = overrides?.txHash ?? BATCH_TX;
      if (overrides?.txHash && !overrides.payer) {
        // Fetch the transaction to get the from address (payer)
        try {
          const tx = await (client as unknown as {
            getTransaction: (args: { hash: Hex }) => Promise<{ from: Address } | null>;
          }).getTransaction({ hash: overrides.txHash });
          if (tx?.from) resolvedPayer = tx.from;
        } catch { /* fallback to default payer */ }
      }

      const result = await rebuildLedger({
        client,
        contract: overrides?.contract ?? CONTRACT_ADDRESS,
        payer: resolvedPayer,
        usdc: overrides?.usdc ?? USDC_ADDRESS,
        target: { txHash: resolvedTxHash },
        invoiceList,
      });

      performance.mark(endMark);
      performance.measure('conciliado:rebuild-6', startMark, endMark);
      durationMs = Math.round(performance.now() - startTimeRef.current);
      clearElapsed();

      const vm = buildViewModel(result, invoiceList);

      // Persist to cache (public chain data only)
      const cache: CachedRebuild = {
        viewModel: vm,
        cachedAtUtc: new Date().toISOString(),
        ledgerTotalMicro: result.ledgerTotalMicro?.toString() ?? null,
        nativeDelta18: result.nativeDelta18?.toString() ?? null,
        differenceNative18: result.differenceNative18?.toString() ?? null,
      };
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          ...cache,
          viewModel: serializeVm(vm),
        }));
      } catch { /* storage full, not fatal */ }

      // Record run
      const rec: RunRecord = { durationMs, ok: true, utc: new Date().toISOString() };
      setHistory((prev) => {
        const next = [rec, ...prev].slice(0, HISTORY_MAX);
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* */ }
        return next;
      });

      setState({ kind: 'ready', vm, durationMs });

      // conciliado:rebuild-visible: mark after first animation frame
      requestAnimationFrame(() => {
        performance.mark('conciliado:rebuild-visible:end');
        performance.measure(
          'conciliado:rebuild-visible',
          startMark,
          'conciliado:rebuild-visible:end',
        );
      });

    } catch (err: unknown) {
      performance.mark(endMark);
      durationMs = Math.round(performance.now() - startTimeRef.current);
      clearElapsed();

      const msg = err instanceof Error ? err.message : String(err);

      // Record failed run
      const rec: RunRecord = { durationMs, ok: false, utc: new Date().toISOString() };
      setHistory((prev) => {
        const next = [rec, ...prev].slice(0, HISTORY_MAX);
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* */ }
        return next;
      });

      // Try to serve from cache
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as { viewModel: string; cachedAtUtc: string };
          const vm = deserializeVm(parsed.viewModel);
          setState({ kind: 'cached', vm, cachedAtUtc: parsed.cachedAtUtc, durationMs });
          return;
        }
      } catch { /* fallthrough to error */ }

      setState({
        kind: 'error',
        message: 'The Arc RPC could not be reached.',
        detail: msg,
      });
    }
  }, [getClient, invoiceList, overrides, clearElapsed]);

  const reset = useCallback(() => {
    clearElapsed();
    setState({ kind: 'empty' });
  }, [clearElapsed]);

  return { state, history, rebuild, reset };
}
