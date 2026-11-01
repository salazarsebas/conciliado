/**
 * useMetrics: loads the on-chain metrics once on mount and again on demand.
 * States: loading (with progress), ready, error. Ready can come early, with the figures of
 * the known batch blocks, while newer blocks are still being scanned; `checking` says so, and
 * `scanError` says the scan did not finish. There is no cached or fallback state: every
 * figure on screen was read from the RPC in this load.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPublicClient, http, type Log } from 'viem';
import { arcMainnet } from '../landing/chain.js';
import type { LedgerClient } from '../ledger/rebuild.js';
import {
  CONTRACT_ADDRESS,
  DEPLOY_BLOCK,
  KNOWN_BATCH_BLOCKS,
  RPC_URL,
  SCAN_FROM_BLOCK,
  USDC_ADDRESS,
} from './config.js';
import { loadMetrics, type LoadPhase, type MetricsSnapshot } from './load.js';

export type MetricsState =
  | { kind: 'loading'; phase: LoadPhase | null; elapsedMs: number }
  | {
      kind: 'ready';
      snapshot: MetricsSnapshot;
      durationMs: number;
      loadedAtUtc: string;
      checking: LoadPhase | null;
      scanError: string | null;
    }
  | { kind: 'error'; detail: string };

export function useMetrics() {
  const [state, setState] = useState<MetricsState>({ kind: 'loading', phase: null, elapsedMs: 0 });
  const run = useRef(0);
  // Pages of logs read so far in this session: a retry or a second read does not repeat them.
  const logCache = useRef(new Map<string, readonly Log[]>());

  const load = useCallback(async () => {
    const id = ++run.current;
    const started = performance.now();
    setState({ kind: 'loading', phase: null, elapsedMs: 0 });
    const tick = setInterval(() => {
      if (run.current !== id) return;
      setState((prev) =>
        prev.kind === 'loading'
          ? { ...prev, elapsedMs: Math.round(performance.now() - started) }
          : prev,
      );
    }, 500);

    try {
      // retryCount 0: load.ts owns the pacing and the retries.
      const client = createPublicClient({
        chain: arcMainnet,
        transport: http(RPC_URL, { retryCount: 0 }),
      }) as unknown as LedgerClient;
      const snapshot = await loadMetrics({
        client,
        contract: CONTRACT_ADDRESS,
        usdc: USDC_ADDRESS,
        deployBlock: DEPLOY_BLOCK,
        logCache: logCache.current,
        knownBatchBlocks: KNOWN_BATCH_BLOCKS,
        scanFromBlock: SCAN_FROM_BLOCK,
        onPartial: (partial) => {
          if (run.current !== id) return;
          setState({
            kind: 'ready',
            snapshot: partial,
            durationMs: Math.round(performance.now() - started),
            loadedAtUtc: new Date().toISOString(),
            checking: { kind: 'logs', done: 0, total: 0 },
            scanError: null,
          });
        },
        onPhase: (phase) => {
          if (run.current !== id) return;
          setState((prev) => {
            if (prev.kind === 'ready') return { ...prev, checking: phase };
            return { ...prev, phase, elapsedMs: Math.round(performance.now() - started) } as MetricsState;
          });
        },
      });
      if (run.current !== id) return;
      setState({
        kind: 'ready',
        snapshot,
        durationMs: Math.round(performance.now() - started),
        loadedAtUtc: new Date().toISOString(),
        checking: null,
        scanError: null,
      });
    } catch (err: unknown) {
      if (run.current !== id) return;
      const detail = err instanceof Error ? err.message : String(err);
      setState((prev) =>
        prev.kind === 'ready' ? { ...prev, checking: null, scanError: detail } : { kind: 'error', detail },
      );
    } finally {
      clearInterval(tick);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      run.current++;
    };
  }, [load]);

  return { state, reload: load };
}
