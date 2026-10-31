/**
 * rebuildLedgerSettled: rebuildLedger, retried while the result is pending.
 *
 * The Arc RPC is load balanced and a node can answer null for a receipt that
 * another node already has, so one pending answer does not mean the tx is
 * unconfirmed. Retrying a few times covers that lag and a just-mined tx.
 */

import { rebuildLedger, type LedgerResult, type RebuildArgs } from './rebuild.js';

export interface SettleOptions {
  attempts?: number;
  delayMs?: number;
}

export async function rebuildLedgerSettled(
  args: RebuildArgs,
  { attempts = 5, delayMs = 800 }: SettleOptions = {},
): Promise<LedgerResult> {
  let result = await rebuildLedger(args);
  for (let i = 1; i < attempts && result.status === 'pending'; i++) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    result = await rebuildLedger(args);
  }
  return result;
}
