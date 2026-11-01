/**
 * LandingPage: the Conciliado landing at /.
 * All four states: empty, loading, ready (with delete), error, cached.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Hex } from 'viem';
import logoMark from '../../docs/brand/logo-mark.svg';
import logoMarkInverse from '../../docs/brand/logo-mark-inverse.svg';
import { createFallbackClients, createLandingClient } from './chain.js';
import {
  BATCH_TX,
  CONTRACT_ADDRESS,
  ARC_STUDIO_PROJECT,
  EXPLORER_BASE,
} from './batch.js';
import { NETWORKS } from '../run/networks.js';
import { parseCsv } from './csv-parser.js';
import { formatDuration, formatUtc, truncateHash, truncateAddress } from './format.js';
import { useRebuild } from './use-rebuild.js';
import type { LedgerClient } from '../ledger/rebuild.js';

import { AddressDisplay } from './components/AddressDisplay.js';
import { StatusPill } from './components/StatusPill.js';
import { LedgerTable } from './components/LedgerTable.js';
import { TieOutBar } from './components/TieOutBar.js';
import { InvoicePanel } from './components/InvoicePanel.js';

// Load CSV as raw text (bundled at build time)
import csvRaw from '../../fixtures/mainnet-batch-1.csv?raw';

// Parse the invoice list once (pure, no side effects)
const CSV_ROWS = parseCsv(csvRaw);
const INVOICE_LIST = CSV_ROWS.map((r) => ({
  invoiceId: r.invoiceId,
  invoiceRef: r.invoiceRef as `0x${string}`,
  payee: r.payee as `0x${string}`,
  amountMicro: BigInt(r.amount),
}));

// Confirm dialog

function DeleteConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Delete ledger" className="bg-surface border border-line-strong rounded-lg p-6 shadow-overlay max-w-sm mx-auto">
      <h3 className="text-base font-semibold text-ink mb-2">Delete ledger?</h3>
      <p className="text-sm text-ink-muted mb-4">
        This removes the ledger from this browser. The payments on Arc mainnet are not affected.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onConfirm}
          className="min-h-touch px-5 rounded-md text-base font-semibold bg-surface text-danger border border-danger hover:bg-danger-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus transition-colors duration-fast"
        >
          Delete ledger
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-touch px-5 rounded-md text-base font-semibold bg-surface text-ink border border-line-strong hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus transition-colors duration-fast"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// Skeleton rows

function SkeletonRows({ count }: { count: number }) {
  return (
    <div className="bg-surface rounded-md border border-line shadow-raised overflow-hidden">
      <div className="bg-sunken px-4 py-3 flex gap-4">
        {['w-8', 'w-20', 'w-32', 'w-24', 'w-32', 'w-16'].map((w, i) => (
          <div key={i} className={`h-4 ${w} rounded bg-line`} />
        ))}
      </div>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="border-t border-line px-4 py-3 flex gap-4 items-center">
          <div className="h-3 w-4 rounded bg-line" />
          <div className="h-3 w-20 rounded bg-line" />
          <div className="h-3 w-28 rounded bg-line" />
          <div className="h-3 w-20 rounded bg-line ml-auto" />
          <div className="h-3 w-28 rounded bg-line" />
          <div className="h-3 w-16 rounded bg-line" />
        </div>
      ))}
    </div>
  );
}

// ─── Query param helpers ──────────────────────────────────────────────────────

/** Parse ?tx and ?network from the current URL. Returns null for invalid values. */
function parseQueryParams(): { txHash: Hex | null; networkKey: 'mainnet' | 'testnet' } {
  const params = new URLSearchParams(window.location.search);
  const rawTx = params.get('tx') ?? '';
  const rawNetwork = params.get('network') ?? 'mainnet';
  const networkKey: 'mainnet' | 'testnet' = rawNetwork === 'testnet' ? 'testnet' : 'mainnet';
  // Validate: 0x + 64 hex chars
  const txHash = /^0x[0-9a-fA-F]{64}$/.test(rawTx) ? (rawTx as Hex) : null;
  return { txHash, networkKey };
}

// Parse once at module load (URL does not change while the page is open)
const QUERY_PARAMS = parseQueryParams();
const QUERY_TX = QUERY_PARAMS.txHash;
const QUERY_NETWORK = QUERY_PARAMS.networkKey;
const QUERY_NET = NETWORKS[QUERY_NETWORK];

// ─── Main component ───────────────────────────────────────────────────────────

export function LandingPage() {
  // When a ?tx= query param is present, use it instead of the default batch.
  // The contract address and USDC come from the network table.
  const overrides = useMemo(() => {
    if (!QUERY_TX) return undefined;
    return {
      txHash: QUERY_TX,
      contract: QUERY_NET.payoutBatch,
      usdc: QUERY_NET.usdc,
      // payer is fetched from chain by use-rebuild when txHash is set and payer is not
    };
  }, []);

  const networkKey = QUERY_TX ? QUERY_NETWORK : 'mainnet';

  const getClient = useCallback(
    (): LedgerClient => createLandingClient(networkKey) as unknown as LedgerClient,
    [networkKey],
  );

  const invoiceList = QUERY_TX ? [] : INVOICE_LIST;
  const getFallbackClients = useCallback(
    (): LedgerClient[] => createFallbackClients(networkKey) as unknown as LedgerClient[],
    [networkKey],
  );

  const { state, history, rebuild, reset } = useRebuild(
    getClient,
    invoiceList,
    overrides,
    getFallbackClients,
  );
  const [showConfirm, setShowConfirm] = useState(false);

  // Auto-rebuild when ?tx= is present
  useEffect(() => {
    if (QUERY_TX) {
      void rebuild();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isLoading = state.kind === 'loading';

  const vm = useMemo(() => {
    if (state.kind === 'ready' || state.kind === 'cached') return state.vm;
    return null;
  }, [state]);

  // Last 20 run durations for display
  const lastRun = history[0];

  return (
    <div className="min-h-dvh bg-paper text-ink font-sans">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="border-b border-line bg-surface">
        <div className="max-w-content mx-auto px-4 lg:px-8 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Logo lockup */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Logo mark: switches with CSS media query via picture */}
            <picture className="shrink-0">
              <source srcSet={logoMarkInverse} media="(prefers-color-scheme: dark)" />
              <img src={logoMark} alt="" aria-hidden="true" width={28} height={28} />
            </picture>
            <span className="text-xl font-semibold tracking-tight text-ink">Conciliado</span>
          </div>

          {/* Tagline */}
          <p className="text-sm text-ink-subtle hidden md:block">Pay the batch. Rebuild the books.</p>

          {/* Contract address */}
          <div className="flex items-center gap-2 min-w-0">
            <AddressDisplay
              value={CONTRACT_ADDRESS}
              display={truncateAddress(CONTRACT_ADDRESS)}
              explorerUrl={`${EXPLORER_BASE}/address/${CONTRACT_ADDRESS}`}
              copyLabel="Copy contract address"
            />
          </div>

          {/* Network badge */}
          {QUERY_TX && networkKey === 'testnet' ? (
            <span className="inline-flex w-fit items-center gap-1 rounded-full px-3 py-0.5 text-xs font-medium bg-pending-wash text-pending whitespace-nowrap">
              Arc testnet
            </span>
          ) : (
            <span className="inline-flex w-fit items-center gap-1 rounded-full px-3 py-0.5 text-xs font-medium bg-mainnet text-mainnet-ink whitespace-nowrap">
              Arc mainnet
            </span>
          )}

          {/* Run a batch link */}
          <a
            href="/run"
            className="text-sm font-medium text-ink hover:text-ink-muted underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus rounded whitespace-nowrap"
          >
            Run a batch
          </a>

          {/* Arc Studio link */}
          <a
            href={ARC_STUDIO_PROJECT}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent hover:text-accent-hover underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus rounded whitespace-nowrap"
          >
            Built with Arc Studio
          </a>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="max-w-content mx-auto px-4 lg:px-8 py-12 md:py-16">
        <h1 className="text-3xl md:text-4xl font-bold text-ink tracking-tight mb-4">
          Delete the ledger.<br />Rebuild it from the chain.
        </h1>
        <p className="text-base text-ink-muted max-w-reading">
          Conciliado pays a batch of contractor invoices in USDC on Arc mainnet, one transaction,
          each line stamped with its invoice reference. Then it rebuilds the ledger from the chain
          and ties it to the wallet to the cent.
        </p>
      </section>

      {/* ── Two panels: invoice list + payments ledger ─────────────────── */}
      <main className="max-w-content mx-auto px-4 lg:px-8 pb-16">
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Panel 1: Invoice list (kept) */}
          <InvoicePanel rows={CSV_ROWS} />

          {/* Panel 2: Payments ledger */}
          <div className="bg-surface rounded-lg border border-line shadow-raised p-4">
            <h2 className="text-xl font-semibold text-ink mb-1">
              Payments ledger{' '}
              <span className="text-ink-subtle font-normal text-sm">
                {(state.kind === 'ready' || state.kind === 'cached')
                  ? '(rebuilt from chain)'
                  : '(deleted)'}
              </span>
            </h2>
            <p className="text-sm text-ink-subtle mb-4">
              Rebuild from the chain at any time using the transaction hash.
            </p>

            {/* Empty state */}
            {(state.kind === 'empty') && (
              <div className="flex flex-col items-start gap-4">
                <p className="text-sm text-ink-subtle">
                  No ledger yet. Pay a batch, or rebuild one from a transaction hash.
                </p>
                <button
                  type="button"
                  onClick={() => void rebuild()}
                  disabled={isLoading}
                  className="min-h-touch px-5 rounded-md text-base font-semibold bg-accent text-accent-ink hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus transition-colors duration-fast disabled:bg-sunken disabled:text-ink-subtle"
                >
                  Rebuild from chain
                </button>
              </div>
            )}

            {/* Loading state */}
            {state.kind === 'loading' && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-ink-subtle">Reading Arc mainnet: logs, receipt, balances</p>
                <p className="text-sm tabular text-ink-muted">{formatDuration(state.elapsedMs)}</p>
                <button
                  type="button"
                  disabled
                  className="min-h-touch px-5 rounded-md text-base font-semibold bg-sunken text-ink-subtle cursor-not-allowed self-start"
                >
                  Rebuilding
                </button>
              </div>
            )}

            {/* Error state */}
            {state.kind === 'error' && (
              <div className="flex flex-col gap-4">
                <div className="bg-danger-wash border border-danger/30 rounded-md p-4">
                  <p className="text-sm text-danger font-medium mb-1">{state.message}</p>
                  <p className="text-xs text-ink-subtle mb-1">No USDC moved.</p>
                  <p className="text-xs text-ink-subtle">Check the Arc RPC connection and retry.</p>
                </div>
                <button
                  type="button"
                  onClick={() => void rebuild()}
                  className="min-h-touch px-5 rounded-md text-base font-semibold bg-accent text-accent-ink hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus transition-colors duration-fast self-start"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Cached state notice */}
            {state.kind === 'cached' && (
              <div className="bg-pending-wash border border-pending/30 rounded-md px-3 py-2 mb-4 text-xs text-pending">
                Cached from {formatUtc(state.cachedAtUtc)}. Arc RPC could not be reached.
              </div>
            )}

            {/* Ready or cached: show status summary */}
            {(state.kind === 'ready' || state.kind === 'cached') && vm && (
              <div className="flex flex-wrap items-center gap-3">
                <StatusPill status={vm.status === 'pending' ? 'pending' : (vm.receiptStatus === 'reverted' ? 'reverted' : 'final')} />
                {vm.blockNumber && (
                  <span className="text-xs text-ink-subtle">Block {vm.blockNumber}</span>
                )}
                {vm.txHash && (
                  <a
                    href={vm.txUrl ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-accent hover:text-accent-hover underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus rounded"
                  >
                    {vm.txHashDisplay}
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Loading: skeleton + elapsed ──────────────────────────────── */}
        {state.kind === 'loading' && (
          <div className="mb-8">
            <SkeletonRows count={6} />
          </div>
        )}

        {/* ── Ready or Cached: full ledger ─────────────────────────────── */}
        {(state.kind === 'ready' || state.kind === 'cached') && vm && (
          <>
            {/* Ledger table */}
            <div className="mb-6">
              <LedgerTable vm={vm} />
            </div>

            {/* Counter + rebuild time */}
            <div className="flex flex-wrap items-center gap-4 mb-6 text-sm">
              <span className="font-medium text-ink">{vm.matchSummary}</span>
              {lastRun && lastRun.ok && (
                <span className="text-ink-subtle">
                  Rebuilt in {formatDuration(lastRun.durationMs)}
                </span>
              )}
            </div>

            {/* Tie-out bar */}
            {vm.tieOut && (
              <div className="mb-6">
                <TieOutBar tieOut={vm.tieOut} />
              </div>
            )}

            {/* Privacy notice */}
            <p className="text-sm text-ink-subtle mb-6 max-w-reading">
              Payee addresses, amounts, and timing are public on Arc mainnet. The chain holds only an opaque reference per line. Your invoice IDs stay in this browser.
            </p>

            {/* Delete ledger button + confirm */}
            {!showConfirm ? (
              <button
                type="button"
                onClick={() => setShowConfirm(true)}
                className="min-h-touch px-5 rounded-md text-base font-semibold bg-surface text-danger border border-danger hover:bg-danger-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus transition-colors duration-fast"
              >
                Delete ledger
              </button>
            ) : (
              <DeleteConfirm
                onConfirm={() => { setShowConfirm(false); reset(); }}
                onCancel={() => setShowConfirm(false)}
              />
            )}

            {/* Pending note */}
            {vm.status === 'pending' && (
              <div className="mt-4 flex items-center gap-3">
                <p className="text-sm text-pending">
                  Pending. Waiting for the receipt.
                </p>
                <button
                  onClick={() => void rebuild()}
                  className="min-h-touch rounded-md px-3 text-sm font-medium text-ink underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  Retry
                </button>
              </div>
            )}
          </>
        )}

        {/* Live region for screen reader announcements */}
        {vm && (
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
          >
            {state.kind === 'ready'
              ? `Ledger rebuilt. ${vm.matchSummary}. ${vm.tieOut?.resultWord ?? ''}`
              : state.kind === 'cached'
              ? `Showing cached ledger. ${vm.matchSummary}.`
              : ''}
          </div>
        )}
        {state.kind === 'error' && (
          <div role="status" aria-live="assertive" aria-atomic="true" className="sr-only">
            {state.message} No USDC moved.
          </div>
        )}

        {/* Batch tx reference */}
        <div className="mt-12 pt-8 border-t border-line">
          <p className="text-xs text-ink-subtle">
            Transaction:{' '}
            <a
              href={`${EXPLORER_BASE}/tx/${BATCH_TX}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-accent hover:text-accent-hover underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus rounded"
            >
              {truncateHash(BATCH_TX)}
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
