/**
 * Constants for the /metrics page. The contract, USDC, RPC, and explorer come from the
 * landing constants so there is one source; the deploy block is in
 * docs/deployments/mainnet.md.
 */

export { CONTRACT_ADDRESS, USDC_ADDRESS, EXPLORER_BASE, RPC_URL } from '../landing/batch.js';

/** Block of the PayoutBatch deploy transaction on Arc mainnet. Nothing earlier can hold its logs. */
export const DEPLOY_BLOCK = 26689148n;

/**
 * A full scan from DEPLOY_BLOCK through block 28,931,224 on 2026-11-01 found batches in exactly
 * these blocks. The page reads their logs directly, so it shows figures in seconds rather than
 * spending three minutes on 225 log pages, then scans everything from SCAN_FROM_BLOCK on.
 */
export const KNOWN_BATCH_BLOCKS = [26689516n, 28850288n];
export const SCAN_FROM_BLOCK = 28931225n;
