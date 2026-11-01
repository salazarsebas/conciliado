/**
 * Constants for the /metrics page. The contract, USDC, RPC, and explorer come from the
 * landing constants so there is one source; the deploy block is in
 * docs/deployments/mainnet.md.
 */

export { CONTRACT_ADDRESS, USDC_ADDRESS, EXPLORER_BASE, RPC_URL } from '../landing/batch.js';

/** Block of the PayoutBatch deploy transaction on Arc mainnet. Nothing earlier can hold its logs. */
export const DEPLOY_BLOCK = 26689148n;
