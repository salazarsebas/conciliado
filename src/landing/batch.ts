/**
 * Constants for Conciliado landing, all sourced from fixtures/mainnet-batch-1.json.
 * A test asserts these equal the fixture JSON so they cannot drift.
 */

import type { Address, Hex } from 'viem';

export const CHAIN_ID = 5042;
export const RPC_URL = 'https://rpc.mainnet.arc.io';
export const CONTRACT_ADDRESS = '0xC86e2241166785344E4d6692E4D2A3D4c8466d0e' as Address;
export const BATCH_TX = '0x50d56ea910e0412c47a7dc186b5f89ccf7cbe71235db799379874d6100987056' as Hex;
export const PAYER_ADDRESS = '0x429Fd794Ed2166c0F6fFef39fA6A1F580Ba64364' as Address;
export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as Address;
export const BLOCK_NUMBER = 26689516n;

export const EXPLORER_BASE = 'https://explorer.arc.io';
export const ARC_STUDIO_PROJECT = 'https://studio.arc.io/app/00732eb6-0372-4443-b5a3-2fa761fc0c3c';

export const CACHE_KEY = 'conciliado:rebuild:cache';
export const HISTORY_KEY = 'conciliado:rebuild:history';
export const HISTORY_MAX = 20;
