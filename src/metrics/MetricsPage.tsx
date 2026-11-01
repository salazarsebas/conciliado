/**
 * MetricsPage: the /metrics page. Read-only and wallet-free. Every figure is computed in
 * the browser from the logs of the PayoutBatch contract on Arc mainnet. Nothing here is
 * stored, cached, or hard-coded: if the RPC fails the page shows the error and no figures.
 */

import logoMark from '../../docs/brand/logo-mark.svg';
import logoMarkInverse from '../../docs/brand/logo-mark-inverse.svg';
import {
  formatBlockNumber,
  formatDuration,
  formatFeeFullUsdc,
  formatMicro6,
  formatNativeAsMicro,
  formatUtc,
  truncateAddress,
  truncateHash,
} from '../landing/format.js';
import type { BatchRow, MetricsSummary } from './aggregate.js';
import { CONTRACT_ADDRESS, DEPLOY_BLOCK, EXPLORER_BASE } from './config.js';
import type { LoadPhase } from './load.js';
import { useMetrics } from './use-metrics.js';

const LINK =
  'text-accent hover:text-accent-hover underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus rounded';

function phaseText(phase: LoadPhase | null): string {
  if (!phase) return 'Reading Arc mainnet: chain head';
  if (phase.kind === 'logs') return `Reading Arc mainnet: logs, page ${phase.done} of ${phase.total}`;
  return `Reading Arc mainnet: receipt and balances, batch ${phase.done} of ${phase.total}`;
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="bg-surface rounded-lg border border-line shadow-raised p-4">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="text-2xl font-semibold text-ink tabular mt-1 break-words">{value}</dd>
      {note && <dd className="text-xs text-ink-subtle mt-1">{note}</dd>}
    </div>
  );
}

function TieOut({ row }: { row: BatchRow }) {
  if (row.differenceNative18 === null) {
    return <span className="text-ink-muted text-sm">Not read</span>;
  }
  if (row.differenceNative18 === 0n) {
    return (
      <span className="inline-flex items-center gap-1 text-final text-sm">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="2,6 5,9 10,3" />
        </svg>
        Ties out, 0 wei
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-danger text-sm">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
        <line x1="3" y1="3" x2="9" y2="9" />
        <line x1="9" y1="3" x2="3" y2="9" />
      </svg>
      Does not tie, {row.differenceNative18.toString()} wei
    </span>
  );
}

function feeText(fee: bigint | null): string {
  return fee === null ? 'Not read' : formatFeeFullUsdc(fee);
}

function BatchTable({ rows }: { rows: BatchRow[] }) {
  return (
    <>
      <div className="hidden md:block overflow-x-auto rounded-md border border-line bg-surface shadow-raised">
        <table className="w-full text-sm">
          <caption className="sr-only">Batches paid through the PayoutBatch contract</caption>
          <thead>
            <tr className="bg-sunken text-ink-muted">
              <th scope="col" className="px-4 py-3 text-left font-medium">Batch</th>
              <th scope="col" className="px-4 py-3 text-left font-medium">Block</th>
              <th scope="col" className="px-4 py-3 text-left font-medium">Payer</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Lines</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Paid out (USDC)</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Fee per line (USDC)</th>
              <th scope="col" className="px-4 py-3 text-left font-medium">Tie-out</th>
              <th scope="col" className="px-4 py-3 text-left font-medium">Transaction</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.txHash} className="border-t border-line">
                <td className="px-4 py-3 tabular">{r.batchId.toString()}</td>
                <td className="px-4 py-3 tabular">{formatBlockNumber(r.blockNumber)}</td>
                <td className="px-4 py-3 font-mono">
                  <a href={`${EXPLORER_BASE}/address/${r.payer}`} target="_blank" rel="noopener noreferrer" title={r.payer} className={LINK}>
                    {truncateAddress(r.payer)}
                  </a>
                </td>
                <td className="px-4 py-3 text-right tabular">{r.lineCount}</td>
                <td className="px-4 py-3 text-right tabular">{formatMicro6(r.totalMicro)}</td>
                <td className="px-4 py-3 text-right tabular">
                  {r.feePerLineNative18 === null ? 'Not read' : formatFeeFullUsdc(r.feePerLineNative18).replace(' USDC', '')}
                </td>
                <td className="px-4 py-3"><TieOut row={r} /></td>
                <td className="px-4 py-3 font-mono">
                  <a href={`${EXPLORER_BASE}/tx/${r.txHash}`} target="_blank" rel="noopener noreferrer" title={r.txHash} className={LINK}>
                    {truncateHash(r.txHash)}
                    <span className="sr-only"> Open in explorer</span>
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="md:hidden space-y-3">
        {rows.map((r) => (
          <li key={r.txHash} className="bg-surface rounded-lg border border-line shadow-raised p-4 text-sm">
            <p className="font-semibold text-ink">Batch {r.batchId.toString()}, block {formatBlockNumber(r.blockNumber)}</p>
            <p className="text-ink-muted tabular mt-1">
              {r.lineCount} lines, {formatMicro6(r.totalMicro)} USDC
            </p>
            <p className="text-ink-muted tabular">
              Fee per line {r.feePerLineNative18 === null ? 'not read' : formatFeeFullUsdc(r.feePerLineNative18)}
            </p>
            <p className="mt-1"><TieOut row={r} /></p>
            <p className="font-mono mt-1">
              <a href={`${EXPLORER_BASE}/tx/${r.txHash}`} target="_blank" rel="noopener noreferrer" title={r.txHash} className={LINK}>
                {truncateHash(r.txHash)}
                <span className="sr-only"> Open in explorer</span>
              </a>
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}

function Figures({ summary, balance }: { summary: MetricsSummary; balance: bigint }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
      <Stat label="Batches" value={String(summary.batches)} note="BatchPaid events" />
      <Stat label="Invoice lines paid" value={String(summary.lines)} note="InvoicePaid events" />
      <Stat label="USDC paid" value={`${formatMicro6(summary.paidMicro)} USDC`} />
      <Stat label="Distinct payers" value={String(summary.distinctPayers)} />
      <Stat label="Distinct payees" value={String(summary.distinctPayees)} />
      <Stat
        label="Fee per line"
        value={summary.feePerLineNative18 === null ? 'Not read' : formatFeeFullUsdc(summary.feePerLineNative18)}
        note="Network fee of every batch transaction, divided by every line"
      />
      <Stat
        label="Contract balance"
        value={`${formatNativeAsMicro(balance)}`}
        note="The contract is designed to hold nothing"
      />
    </dl>
  );
}

export default function MetricsPage() {
  const { state, reload } = useMetrics();

  return (
    <div className="min-h-dvh bg-paper text-ink font-sans">
      <header className="border-b border-line bg-surface">
        <div className="max-w-content mx-auto px-4 lg:px-8 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <picture className="shrink-0">
              <source srcSet={logoMarkInverse} media="(prefers-color-scheme: dark)" />
              <img src={logoMark} alt="" aria-hidden="true" width={28} height={28} />
            </picture>
            <span className="text-xl font-semibold tracking-tight text-ink">Conciliado</span>
          </div>
          <span className="inline-flex w-fit items-center gap-1 rounded-full px-3 py-0.5 text-xs font-medium bg-mainnet text-mainnet-ink whitespace-nowrap">
            Arc mainnet
          </span>
          <a href="/" className={`text-sm whitespace-nowrap ${LINK}`}>Back to ledger</a>
        </div>
      </header>

      <main className="max-w-content mx-auto px-4 lg:px-8 py-8 pb-16">
        <h1 className="text-2xl md:text-3xl font-bold text-ink tracking-tight mb-2">Metrics</h1>
        <p className="text-sm text-ink-muted mb-8 max-w-reading">
          Read from the chain in your browser: the logs of{' '}
          <a href={`${EXPLORER_BASE}/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noopener noreferrer" title={CONTRACT_ADDRESS} className={`font-mono ${LINK}`}>
            {truncateAddress(CONTRACT_ADDRESS)}
          </a>{' '}
          from block {formatBlockNumber(DEPLOY_BLOCK)}. No wallet, no server, no stored numbers.
        </p>

        {state.kind === 'loading' && (
          <div role="status" aria-live="polite" className="bg-surface rounded-lg border border-line shadow-raised p-6">
            <p className="text-sm text-ink">{phaseText(state.phase)}</p>
            {state.phase && (
              <progress
                className="w-full mt-3 h-3"
                max={state.phase.total}
                value={state.phase.done}
                aria-label="Chain read progress"
              />
            )}
            <p className="text-sm tabular text-ink-subtle mt-2">{formatDuration(state.elapsedMs)}</p>
            <p className="text-xs text-ink-subtle mt-2 max-w-reading">
              The public RPC limits log reads to 10,000 blocks and a few calls a second, so a full
              read takes about three minutes.
            </p>
          </div>
        )}

        {state.kind === 'error' && (
          <div role="alert" className="flex flex-col gap-4">
            <div className="bg-danger-wash border border-danger/30 rounded-md p-4">
              <p className="text-sm text-danger font-medium mb-1">The Arc RPC could not be read, so there are no figures to show.</p>
              <p className="text-xs text-ink-subtle mb-1">No USDC moved. Nothing on this page is stored or estimated.</p>
              <p className="text-xs text-ink-subtle mb-1">Wait a moment and retry.</p>
              <p className="text-xs font-mono text-ink-subtle break-all">{state.detail}</p>
            </div>
            <button
              type="button"
              onClick={() => void reload()}
              className="min-h-touch px-5 rounded-md text-base font-semibold bg-accent text-accent-ink hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus transition-colors duration-fast self-start"
            >
              Retry
            </button>
          </div>
        )}

        {state.kind === 'ready' && (
          <>
            <Figures summary={state.snapshot.summary} balance={state.snapshot.contractBalanceNative18} />

            {state.snapshot.summary.inconsistencies.length > 0 && (
              <div role="alert" className="bg-danger-wash border border-danger/30 rounded-md p-4 mb-8">
                <p className="text-sm text-danger font-medium mb-1">The contract events disagree with each other.</p>
                <ul className="text-xs text-ink-subtle list-disc pl-4">
                  {state.snapshot.summary.inconsistencies.map((m) => <li key={m}>{m}</li>)}
                </ul>
              </div>
            )}

            <h2 className="text-xl font-semibold text-ink mb-3">Batches</h2>
            <div className="mb-6">
              <BatchTable rows={state.snapshot.summary.rows} />
            </div>

            <p className="text-xs text-ink-subtle max-w-reading mb-4">
              Read at block {formatBlockNumber(state.snapshot.headBlock)} on {formatUtc(state.loadedAtUtc)}:{' '}
              {state.snapshot.pages} log pages and the receipt of each batch, in {formatDuration(state.durationMs)}.
              Fee is gas used times gas price from the batch receipt, so it includes any approval sent in the same
              transaction. The tie-out compares each ledger rebuilt from the chain with the payer wallet balance change.
              Payee addresses and amounts are public on Arc mainnet.
            </p>
            <button
              type="button"
              onClick={() => void reload()}
              className="min-h-touch px-5 rounded-md text-base font-semibold bg-surface text-ink border border-line-strong hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus transition-colors duration-fast"
            >
              Read again
            </button>
          </>
        )}
      </main>
    </div>
  );
}
