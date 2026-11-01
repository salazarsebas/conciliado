/**
 * LedgerTable: the main ledger table / card layout.
 * Desktop: real table. Mobile (below md): stacked cards.
 */

import type { LedgerViewModel, PayoutRowView, RowMismatchDetail } from '../view-model.js';
import { AddressDisplay } from './AddressDisplay.js';
import { truncateAddress, truncateHash } from '../format.js';

interface Props {
  vm: LedgerViewModel;
}

/** Visible detail lines shown beneath "Mismatch" for each differing field. */
function MismatchDetail({ detail }: { detail: RowMismatchDetail }) {
  return (
    <div className="mt-1 space-y-0.5">
      {detail.fields.includes('payee') && (
        <div className="text-xs text-danger break-all">
          Payee: expected {detail.expectedPayee ? truncateAddress(detail.expectedPayee) : '(unknown)'},
          {' '}on chain {detail.actualPayee ? truncateAddress(detail.actualPayee) : '(unknown)'}
        </div>
      )}
      {detail.fields.includes('amount') && (
        <div className="text-xs text-danger break-all">
          Amount: expected {detail.expectedAmount ?? '(unknown)'},
          {' '}on chain {detail.actualAmount ?? '(unknown)'}
        </div>
      )}
    </div>
  );
}

function MatchIcon({ row }: { row: PayoutRowView }) {
  if (row.matched) {
    return (
      <span className="inline-flex items-center gap-1 text-final text-sm">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="2,6 5,9 10,3" />
        </svg>
        Matched
      </span>
    );
  }
  if (row.mismatch) {
    return (
      <div title={row.mismatchDetail?.fields.join(', ')}>
        <span className="inline-flex items-center gap-1 text-danger text-sm">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 2L6 7" /><circle cx="6" cy="9.5" r="0.75" fill="currentColor" stroke="none" />
          </svg>
          Mismatch
        </span>
        {row.mismatchDetail && <MismatchDetail detail={row.mismatchDetail} />}
      </div>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-danger text-sm">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="3" y1="3" x2="9" y2="9" /><line x1="9" y1="3" x2="3" y2="9" />
      </svg>
      Not matched
    </span>
  );
}

export function LedgerTable({ vm }: Props) {
  return (
    <>
      {/* Desktop table, hidden below md */}
      <div className="hidden md:block overflow-x-auto rounded-md border border-line bg-surface shadow-raised">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-sunken text-ink-muted">
              <th scope="col" className="px-4 py-3 text-left font-medium">#</th>
              <th scope="col" className="px-4 py-3 text-left font-medium">Invoice</th>
              <th scope="col" className="px-4 py-3 text-left font-medium">Payee</th>
              <th scope="col" className="px-4 py-3 text-right font-medium tabular">Paid out (USDC)</th>
              <th scope="col" className="px-4 py-3 text-left font-medium">Invoice reference</th>
              <th scope="col" className="px-4 py-3 text-left font-medium">Match</th>
            </tr>
          </thead>
          <tbody>
            {vm.payoutRows.map((row) => (
              <tr
                key={row.lineIndex}
                className={[
                  'border-t border-line transition-colors duration-instant',
                  row.mismatch
                    ? 'bg-danger-wash hover:bg-danger-wash/80'
                    : 'hover:bg-sunken/50',
                ].join(' ')}
              >
                <td className="px-4 py-3 tabular text-ink-muted">{row.lineIndex + 1}</td>
                <td className="px-4 py-3 font-mono text-ink">{row.invoiceId ?? <span className="text-ink-subtle italic">On chain, not in your CSV</span>}</td>
                <td className="px-4 py-3">
                  <AddressDisplay
                    value={row.payee}
                    display={row.payeeDisplay}
                    explorerUrl={row.payeeExplorerUrl}
                    copyLabel="Copy payee address"
                  />
                </td>
                <td className="px-4 py-3 text-right tabular">{row.amountDisplay}</td>
                <td className="px-4 py-3 font-mono text-ink-subtle text-xs">{row.invoiceRefDisplay}</td>
                <td className="px-4 py-3"><MatchIcon row={row} /></td>
              </tr>
            ))}

            {/* Network fee row */}
            {vm.feeRow && (
              <tr className="border-t border-line bg-sunken/30">
                <td className="px-4 py-3 text-ink-muted"><span className="sr-only">No invoice</span></td>
                <td className="px-4 py-3 text-ink-muted italic">Network fee</td>
                <td className="px-4 py-3 text-ink-muted text-xs">
                  <a href={vm.feeRow.txUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center min-h-touch text-accent hover:text-accent-hover underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus rounded">
                    {truncateHash(vm.txHash ?? '')}
                  </a>
                </td>
                <td className="px-4 py-3 text-right tabular">
                  <span title={vm.feeRow.amountFullDisplay}>{vm.feeRow.amountDisplay}</span>
                </td>
                <td className="px-4 py-3 text-ink-subtle text-xs" colSpan={2}>
                  <span className="font-mono">{vm.feeRow.amountFullDisplay}</span>
                </td>
              </tr>
            )}

            {/* Ledger total row */}
            {vm.totalDisplay && (
              <tr className="border-t-2 border-line-strong font-semibold">
                <td className="px-4 py-3" />
                <td className="px-4 py-3" colSpan={2}>Ledger total</td>
                <td className="px-4 py-3 text-right tabular">{vm.totalDisplay}</td>
                <td className="px-4 py-3" colSpan={2} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards, shown below md */}
      <div className="md:hidden flex flex-col gap-2">
        {vm.payoutRows.map((row) => (
          <div key={row.lineIndex} className="bg-surface rounded-lg border border-line p-4 shadow-raised">
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="font-mono text-sm text-ink">{row.invoiceId ?? <span className="text-ink-subtle italic">On chain, not in CSV</span>}</span>
              <span className="tabular text-sm font-medium text-right">{row.amountDisplay} USDC</span>
            </div>
            <div className="text-xs text-ink-subtle mb-1">
              <AddressDisplay value={row.payee} display={row.payeeDisplay} explorerUrl={row.payeeExplorerUrl} copyLabel="Copy payee address" />
            </div>
            <div className="text-xs font-mono text-ink-subtle mb-2">{row.invoiceRefDisplay}</div>
            <div><MatchIcon row={row} /></div>
          </div>
        ))}

        {vm.feeRow && (
          <div className="bg-sunken rounded-lg border border-line p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm text-ink-muted italic">Network fee</span>
              <span className="tabular text-sm text-right">{vm.feeRow.amountDisplay} USDC</span>
            </div>
            <div className="text-xs font-mono text-ink-subtle mt-1">{vm.feeRow.amountFullDisplay}</div>
          </div>
        )}

        {vm.totalDisplay && (
          <div className="bg-surface rounded-lg border-2 border-line-strong p-4 font-semibold flex justify-between">
            <span>Ledger total</span>
            <span className="tabular">{vm.totalDisplay} USDC</span>
          </div>
        )}
      </div>
    </>
  );
}
