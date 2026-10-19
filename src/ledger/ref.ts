/**
 * Invoice reference helpers.
 *
 * An invoiceRef is an opaque bytes32 the PayoutBatch contract uses for
 * per-payer idempotency. It is derived deterministically from the local
 * invoice ID and a random salt so the caller can always reconstruct it.
 *
 * The formula matches `keccak256(abi.encodePacked(invoiceId, salt))` from
 * the Solidity side, where `invoiceId` is UTF-8 encoded as bytes.
 */

import { type Hex, encodePacked, keccak256 } from 'viem';

/**
 * Derives the on-chain invoiceRef for a local invoice.
 *
 * @param invoiceId  Human-readable invoice identifier string (UTF-8).
 * @param salt       Random bytes32 chosen by the caller to namespace the ref.
 * @returns          The keccak256 hash of the ABI-packed (invoiceId, salt) as 0x-prefixed hex.
 */
export function makeInvoiceRef(invoiceId: string, salt: Hex): Hex {
  return keccak256(encodePacked(['string', 'bytes32'], [invoiceId, salt]));
}
