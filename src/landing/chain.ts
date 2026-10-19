/**
 * Arc mainnet viem chain definition and public client.
 * Defined in src/landing/ only, not shared with src/onchain-facts.ts.
 */

import { createPublicClient, defineChain, http } from 'viem';
import { RPC_URL, EXPLORER_BASE } from './batch.js';

export const arcMainnet = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: {
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
  blockExplorers: {
    default: { name: 'Arc Explorer', url: EXPLORER_BASE },
  },
});

export function createLandingClient() {
  return createPublicClient({
    chain: arcMainnet,
    transport: http(RPC_URL, { batch: true }),
  });
}
