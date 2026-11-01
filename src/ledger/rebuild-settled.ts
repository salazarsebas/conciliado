/**
 * rebuildLedgerSettled: rebuildLedger, retried while the result is pending.
 *
 * The Arc RPC is load balanced and a node can answer null for a receipt that
 * another node already has, so one pending answer does not mean the tx is
 * unconfirmed. Retrying covers that lag and a just-mined tx. A stuck node can
 * keep answering null, so attempts rotate through any fallback clients, which
 * also take over when a client throws.
 */

import { rebuildLedger, type LedgerClient, type LedgerResult, type RebuildArgs } from './rebuild.js';

export interface SettleOptions {
  attempts?: number;
  delayMs?: number;
  fallbackClients?: LedgerClient[];
}

export async function rebuildLedgerSettled(
  args: RebuildArgs,
  { attempts = 5, delayMs = 800, fallbackClients = [] }: SettleOptions = {},
): Promise<LedgerResult> {
  const clients = [args.client, ...fallbackClients];
  let result: LedgerResult | undefined;
  let lastError: unknown;

  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    try {
      result = await rebuildLedger({ ...args, client: clients[i % clients.length] });
      if (result.status !== 'pending') return result;
    } catch (error) {
      if (clients.length === 1) throw error;
      lastError = error;
    }
  }

  if (result) return result;
  throw lastError;
}
