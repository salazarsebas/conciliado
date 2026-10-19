/**
 * Tests for makeInvoiceRef.
 *
 * The known vector is independently computed with viem's keccak256 + encodePacked.
 */

import { expect, test } from 'bun:test';
import { keccak256, encodePacked, type Hex } from 'viem';
import { makeInvoiceRef } from './ref.js';

test('makeInvoiceRef: known vector matches independent computation', () => {
  const invoiceId = 'INV-2026-001';
  // Known salt: all zeros bytes32
  const salt = ('0x' + '00'.repeat(32)) as Hex;

  const expected = keccak256(encodePacked(['string', 'bytes32'], [invoiceId, salt]));
  expect(makeInvoiceRef(invoiceId, salt)).toBe(expected);
});

test('makeInvoiceRef: different invoiceId produces different ref', () => {
  const salt = ('0x' + 'ab'.repeat(32)) as Hex;
  const ref1 = makeInvoiceRef('INV-2026-001', salt);
  const ref2 = makeInvoiceRef('INV-2026-002', salt);
  expect(ref1).not.toBe(ref2);
});

test('makeInvoiceRef: different salt produces different ref', () => {
  const invoiceId = 'INV-2026-001';
  const salt1 = ('0x' + '01'.repeat(32)) as Hex;
  const salt2 = ('0x' + '02'.repeat(32)) as Hex;
  expect(makeInvoiceRef(invoiceId, salt1)).not.toBe(makeInvoiceRef(invoiceId, salt2));
});

test('makeInvoiceRef: empty string produces a deterministic ref', () => {
  const salt = ('0x' + '00'.repeat(32)) as Hex;
  const ref = makeInvoiceRef('', salt);
  const expected = keccak256(encodePacked(['string', 'bytes32'], ['', salt]));
  expect(ref).toBe(expected);
});

test('makeInvoiceRef: returns 0x-prefixed 32-byte hex', () => {
  const salt = ('0x' + '01'.repeat(32)) as Hex;
  const ref = makeInvoiceRef('TEST', salt);
  expect(ref).toMatch(/^0x[0-9a-f]{64}$/i);
});
