/**
 * Status pill per design-system.md. Variants: Pending, Final, Reverted.
 * Not a live region: the page announces state changes through its own
 * always-mounted live regions.
 */

interface Props {
  status: 'pending' | 'final' | 'reverted';
}

export function StatusPill({ status }: Props) {
  if (status === 'final') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs bg-final-wash text-final"
      >
        {/* Filled dot */}
        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true" fill="currentColor">
          <circle cx="4" cy="4" r="4" />
          <path d="M2.5 4l1 1 2-2" className="stroke-final-wash" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Final
      </span>
    );
  }
  if (status === 'reverted') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs bg-danger-wash text-danger"
      >
        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <line x1="2" y1="2" x2="6" y2="6" />
          <line x1="6" y1="2" x2="2" y2="6" />
        </svg>
        Reverted
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs bg-pending-wash text-pending"
    >
      {/* Hollow dot */}
      <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="4" cy="4" r="3" />
      </svg>
      Pending
    </span>
  );
}
