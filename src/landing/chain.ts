/**
 * Arc chain definitions and public client factories for the landing.
 */

import { createPublicClient, defineChain, http } from 'viem';
import { RPC_URL, EXPLORER_BASE } from './batch.js';

// Arc mainnet (chain 5042)
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

// Arc testnet (chain 5042002)
export const arcTestnetChain = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: {
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.io'] },
  },
  blockExplorers: {
    default: { name: 'Arc Testnet Explorer', url: 'https://explorer.testnet.arc.io' },
  },
});

/**
 * Create a public client for the given network key.
 * Defaults to mainnet.
 */
export function createLandingClient(networkKey?: 'mainnet' | 'testnet') {
  if (networkKey === 'testnet') {
    return createPublicClient({
      chain: arcTestnetChain,
      transport: http('https://rpc.testnet.arc.io', { batch: true }),
    });
  }
  return createPublicClient({
    chain: arcMainnet,
    transport: http(RPC_URL, { batch: true }),
  });
}
