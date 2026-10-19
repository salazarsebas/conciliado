/**
 * InvoicePanel: the left panel showing the local invoice list from the CSV.
 * Pure display, no network calls.
 */

import type { CsvInvoiceRow } from '../csv-parser.js';
import { formatMicro6, truncateAddress, truncateHash } from '../format.js';

interface Props {
  rows: CsvInvoiceRow[];
}

export function InvoicePanel({ rows }: Props) {
  return (
    <div className="bg-surface rounded-lg border border-line shadow-raised p-4">
      <h2 className="text-xl font-semibold text-ink mb-1">Invoice list <span className="text-ink-subtle font-normal text-sm">(kept)</span></h2>
      <p className="text-sm text-ink-subtle mb-4">Your local invoice records. These stay in this browser.</p>
      <ul className="divide-y divide-line" role="list">
        {rows.map((row, i) => (
          <li key={i} className="py-3 flex flex-col gap-1">
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-sm text-ink">{row.invoiceId}</span>
              <span className="tabular text-sm text-right shrink-0">{formatMicro6(row.amount)} USDC</span>
            </div>
            <div className="text-xs font-mono text-ink-subtle truncate" title={row.payee}>
              {truncateAddress(row.payee)}
            </div>
            <div className="text-xs font-mono text-ink-subtle" title={row.invoiceRef}>
              {truncateHash(row.invoiceRef)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
