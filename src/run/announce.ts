/**
 * Screen reader text for the /run flow.
 *
 * Rendered into two always-mounted live regions (polite status, assertive
 * alert). Only the text changes between states, so every step is announced.
 */

import type { FlowState } from './flow.js';

export interface FlowAnnouncement {
  /** Polite text for the role="status" region. */
  status: string;
  /** Assertive text for the role="alert" region. Empty unless something failed. */
  alert: string;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function announceFlow(state: FlowState): FlowAnnouncement {
  const none = { status: '', alert: '' };
  switch (state.status) {
    case 'idle':
      return none;
    case 'parsed': {
      const errors = state.parseResult?.errors ?? [];
      if (state.parseResult?.tooManyRows) return { status: '', alert: 'File rejected: too many rows.' };
      if (errors.length > 0) return { status: '', alert: `${plural(errors.length, 'validation error', 'validation errors')} in the CSV.` };
      return { status: `${plural(state.rows.length, 'line', 'lines')} read from the CSV. Connect a wallet to check them on chain.`, alert: '' };
    }
    case 'checking':
      return { status: 'Checking the batch on chain.', alert: '' };
    case 'checked':
    case 'allowFinal': {
      const used = state.usedRefs.length;
      if (used > 0) return { status: '', alert: `${plural(used, 'invoice was', 'invoices were')} already paid.` };
      const n = state.unallowedPayees.length;
      if (n > 0) return { status: `${plural(n, 'payee needs', 'payees need')} to be added to your allow-list.`, alert: '' };
      return { status: 'On-chain checks passed. Run the simulation next.', alert: '' };
    }
    case 'allowPending':
      return { status: 'Adding payees to the allow-list. Waiting for the receipt.', alert: '' };
    case 'simulating':
      return { status: 'Simulating the batch.', alert: '' };
    case 'simOk':
    case 'saltGate':
      return { status: 'Simulation passed. Save the payer CSV and the salt file before paying.', alert: '' };
    case 'simFail':
      return { status: '', alert: `Simulation failed. ${state.simResult && !state.simResult.ok ? state.simResult.reason : ''}`.trim() };
    case 'paying':
      return { status: 'Paying. Waiting for the receipt.', alert: '' };
    case 'paid':
      return {
        status: state.rebuildVm
          ? `Batch paid. ${state.rebuildVm.matchSummary}. ${state.rebuildVm.tieOut?.resultWord ?? ''}`.trim()
          : 'Batch paid. Rebuilding the ledger from the chain.',
        alert: '',
      };
    case 'reverted':
      return { status: '', alert: 'Transaction reverted. Batch was not paid.' };
    case 'rejected':
      return { status: '', alert: 'Transaction rejected. No USDC moved.' };
    case 'contractError':
      return { status: '', alert: state.contractError ?? 'A contract is not available on this network. No USDC moved.' };
  }
}
