/**
 * TieOutBar: the signature tie-out element.
 * Two bars on the same scale. Tied: final, not tied: danger.
 * Bars are decorative (aria-hidden). The page's always-mounted live regions
 * announce the result, so this block is not a live region itself.
 */

import type { TieOutView } from '../view-model.js';

interface Props {
  tieOut: TieOutView;
}

export function TieOutBar({ tieOut }: Props) {
  const isTied = tieOut.tied;
  const resultColor = isTied ? 'text-final' : 'text-danger';
  const resultBg = isTied ? 'bg-final-wash' : 'bg-danger-wash';

  return (
    <div className={`rounded-lg border border-line p-6 ${resultBg} transition-colors duration-fast`}>
      {tieOut.multiTxWarning && (
        <p className="text-xs text-pending mb-3 flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M6 1L11 11H1L6 1z" />
            <line x1="6" y1="5" x2="6" y2="7.5" />
            <circle cx="6" cy="9.5" r="0.5" fill="currentColor" />
          </svg>
          This wallet sent other transactions in the same block.
        </p>
      )}

      {/* Ledger total bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-ink-muted">Ledger total</span>
          <span className="text-lg tabular">{tieOut.ledgerTotalDisplay}</span>
        </div>
        <div className="h-3 rounded-full bg-sunken overflow-hidden" aria-hidden="true">
          <div
            className="h-full rounded-full bg-ink transition-all duration-slow ease-out"
            style={{ width: `${tieOut.ledgerBarPct}%` }}
          />
        </div>
      </div>

      {/* Wallet change bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-ink-muted">Wallet balance change</span>
          <span className="text-lg tabular">{tieOut.walletChangeDisplay}</span>
        </div>
        <div className="h-3 rounded-full bg-sunken overflow-hidden" aria-hidden="true">
          <div
            className="h-full rounded-full bg-accent transition-all duration-slow ease-out"
            style={{ width: `${tieOut.walletBarPct}%` }}
          >
            {/* Hatched gap for non-tied */}
            {!isTied && tieOut.walletBarPct < 100 && (
              <div
                className="h-full absolute right-0 top-0"
                style={{
                  width: `${100 - tieOut.walletBarPct}%`,
                  backgroundImage: 'repeating-linear-gradient(45deg, currentColor 0, currentColor 1px, transparent 0, transparent 50%)',
                  backgroundSize: '6px 6px',
                  opacity: 0.4,
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Result line */}
      <div className="flex flex-col items-center text-center gap-1">
        <div className={`text-4xl tabular font-bold ${resultColor}`}>
          {isTied ? (
            <span className="inline-flex items-center gap-2">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="14" cy="14" r="12" />
                <polyline points="8,14 12,18 20,10" />
              </svg>
              {tieOut.differenceDisplay}
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="14" cy="14" r="12" />
                <line x1="9" y1="9" x2="19" y2="19" /><line x1="19" y1="9" x2="9" y2="19" />
              </svg>
              {tieOut.differenceDisplay}
            </span>
          )}
        </div>
        <div className="text-sm text-ink-subtle">
          {tieOut.differenceExact}, {tieOut.differenceWei}
        </div>
        <div className={`text-base font-medium ${resultColor}`}>{tieOut.resultWord}</div>
      </div>
    </div>
  );
}
