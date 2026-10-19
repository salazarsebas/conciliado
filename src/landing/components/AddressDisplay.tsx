/** Address or hash display: truncated with copy button and explorer link. */

import { CopyButton } from './CopyButton.js';

interface Props {
  value: string;
  display: string;
  explorerUrl: string;
  copyLabel?: string;
  /** Show full value (md+ detail view) */
  full?: boolean;
}

export function AddressDisplay({ value, display, explorerUrl, copyLabel, full }: Props) {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-sm">
      <span
        title={value}
        className={full ? 'break-all' : 'whitespace-nowrap'}
        aria-label={value}
      >
        {full ? value : display}
      </span>
      <CopyButton value={value} label={copyLabel ?? `Copy ${display}`} />
      <a
        href={explorerUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open in explorer: ${value}`}
        title="Open in explorer"
        className="inline-flex items-center justify-center min-h-touch min-w-touch text-accent hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus rounded-md transition-colors duration-fast"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7 1h4v4M11 1L5 7M3 3H1a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V9" />
        </svg>
        <span className="sr-only">Open in explorer</span>
      </a>
    </span>
  );
}
