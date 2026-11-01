/**
 * Conciliado ledger-rebuild library.
 *
 * Rebuilds a payer's ledger for one PayoutBatch batch from chain data only,
 * and ties it to the payer's balance change to the micro-USDC, including
 * the network fee paid in USDC.
 *
 * Usage:
 *   import { rebuildLedger, makeInvoiceRef, nativeToMicro } from '@/ledger';
 */

export { makeInvoiceRef } from './ref.js';
export { formatMicro, formatUsd2, microToNative, nativeToMicro } from './money.js';
export {
  LedgerInconsistencyError,
  PAYOUT_BATCH_ABI,
  PayerMismatchError,
  rebuildLedger,
  type FeeRow,
  type LedgerClient,
  type LedgerResult,
  type LocalInvoice,
  type MatchedInvoice,
  type MismatchedInvoice,
  type PayoutRow,
  type RebuildArgs,
} from './rebuild.js';
