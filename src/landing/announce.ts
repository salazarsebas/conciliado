/**
 * Screen reader text for the landing rebuild states.
 *
 * Two always-mounted live regions render these strings: a live region that
 * is inserted together with its text is not announced reliably, so the
 * regions stay in the page and only their text changes.
 */

import type { PageState } from './use-rebuild.js';

export interface Announcement {
  /** Polite text for the role="status" region. */
  status: string;
  /** Assertive text for the role="alert" region. Empty unless something failed. */
  alert: string;
}

export function announceRebuild(state: PageState, networkName: string): Announcement {
  switch (state.kind) {
    case 'loading':
      return { status: `Rebuilding the ledger from ${networkName}. Reading logs, receipt, and balances.`, alert: '' };
    case 'ready':
      return {
        status: `Ledger rebuilt. ${state.vm.matchSummary}. ${state.vm.tieOut?.resultWord ?? ''}`.trim(),
        alert: '',
      };
    case 'cached':
      return { status: `Showing cached ledger. ${state.vm.matchSummary}.`, alert: '' };
    case 'error':
      return { status: '', alert: `${state.message} No USDC moved.` };
    case 'empty':
      return { status: '', alert: '' };
  }
}
