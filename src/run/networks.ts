/**
 * src/run/networks.ts
 *
 * Network configuration for the /run batch flow.
 * Two networks: Arc mainnet (default) and Arc testnet.
 */

import type { Address } from 'viem';

export type NetworkKey = 'mainnet' | 'testnet';

export interface RunNetwork {
  key: NetworkKey;
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerBase: string;
  payoutBatch: Address;
  usdc: Address;
  multicall3From: Address;
}

// Mainnet is the default, badged with the Arc mainnet chip
export const MAINNET_NETWORK: RunNetwork = {
  key: 'mainnet',
  chainId: 5042,
  name: 'Arc mainnet',
  rpcUrl: 'https://rpc.mainnet.arc.io',
  explorerBase: 'https://explorer.arc.io',
  payoutBatch: '0xC86e2241166785344E4d6692E4D2A3D4c8466d0e',
  usdc: '0x3600000000000000000000000000000000000000',
  multicall3From: '0x522fAf9A91c41c443c66765030741e4AaCe147D0',
};

export const TESTNET_NETWORK: RunNetwork = {
  key: 'testnet',
  chainId: 5042002,
  name: 'Arc testnet',
  rpcUrl: 'https://rpc.testnet.arc.io',
  explorerBase: 'https://explorer.testnet.arc.io',
  payoutBatch: '0x209dd04647d4c103081095176e5f58c5d91e1fb6',
  usdc: '0x3600000000000000000000000000000000000000',
  multicall3From: '0x522fAf9A91c41c443c66765030741e4AaCe147D0',
};

export const NETWORKS: Record<NetworkKey, RunNetwork> = {
  mainnet: MAINNET_NETWORK,
  testnet: TESTNET_NETWORK,
};

export const DEFAULT_NETWORK: NetworkKey = 'mainnet';
