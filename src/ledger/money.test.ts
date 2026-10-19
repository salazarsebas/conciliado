/**
 * Tests for nativeToMicro, microToNative, formatMicro, formatUsd2.
 */

import { expect, test } from 'bun:test';
import { formatMicro, formatUsd2, microToNative, nativeToMicro } from './money.js';

const SCALE = 1_000_000_000_000n; // 10^12

// ─── nativeToMicro ────────────────────────────────────────────────────────

test('nativeToMicro: zero', () => {
  expect(nativeToMicro(0n)).toBe(0n);
});

test('nativeToMicro: exactly 1 micro (no rounding)', () => {
  // 1 * 10^12 native → 1 micro exactly
  expect(nativeToMicro(SCALE)).toBe(1n);
});

test('nativeToMicro: 0.4999... micro rounds DOWN (below half)', () => {
  // 0.4999 micro = 499_900_000_000n native (< 500_000_000_000n = 0.5 micro)
  const native = 499_999_999_999n; // just below 0.5 micro
  expect(nativeToMicro(native)).toBe(0n); // rounds down
});

test('nativeToMicro: exactly 0.5 micro rounds UP (half-up)', () => {
  const native = 500_000_000_000n; // exactly 0.5 micro = SCALE/2
  expect(nativeToMicro(native)).toBe(1n); // rounds up
});

test('nativeToMicro: 0.500...1 micro rounds UP (above half)', () => {
  const native = 500_000_000_001n; // just above 0.5 micro
  expect(nativeToMicro(native)).toBe(1n); // rounds up
});

test('nativeToMicro: large value conserves magnitude', () => {
  // 1_000_000 micro = 1 USDC = 1_000_000 * 10^12 native
  const native = 1_000_000n * SCALE;
  expect(nativeToMicro(native)).toBe(1_000_000n);
});

test('nativeToMicro: large value with sub-micro remainder rounds correctly', () => {
  // 1_000_000 micro + 0.5 micro = 1_000_000.5 → rounds up to 1_000_001
  const native = 1_000_000n * SCALE + SCALE / 2n;
  expect(nativeToMicro(native)).toBe(1_000_001n);
});

test('nativeToMicro: throws on negative input', () => {
  expect(() => nativeToMicro(-1n)).toThrow();
});

// ─── microToNative ─────────────────────────────────────────────────────────

test('microToNative: zero', () => {
  expect(microToNative(0n)).toBe(0n);
});

test('microToNative: 1 micro → 10^12 native', () => {
  expect(microToNative(1n)).toBe(SCALE);
});

test('microToNative: round-trip with exact value', () => {
  const micro = 1_250_000n; // 1.25 USDC
  expect(nativeToMicro(microToNative(micro))).toBe(micro);
});

// ─── formatMicro ───────────────────────────────────────────────────────────

test('formatMicro: zero', () => {
  expect(formatMicro(0n)).toBe('0.000000');
});

test('formatMicro: 1 micro', () => {
  expect(formatMicro(1n)).toBe('0.000001');
});

test('formatMicro: 1.25 USDC', () => {
  expect(formatMicro(1_250_000n)).toBe('1.250000');
});

test('formatMicro: negative', () => {
  expect(formatMicro(-750_000n)).toBe('-0.750000');
});

test('formatMicro: 2_000_001 micro', () => {
  expect(formatMicro(2_000_001n)).toBe('2.000001');
});

// ─── formatUsd2 ────────────────────────────────────────────────────────────

test('formatUsd2: zero', () => {
  expect(formatUsd2(0n)).toBe('$0.00');
});

test('formatUsd2: 1.25 USDC', () => {
  expect(formatUsd2(1_250_000n)).toBe('$1.25');
});

test('formatUsd2: rounds half-up: 1.255 → $1.26', () => {
  // 1.255 USDC = 1_255_000 micro; rounded to 2 decimals with half-away-zero = $1.26
  // 1_255_000 micro / 10_000 = 125.5 cents → rounds to 126 cents = $1.26
  expect(formatUsd2(1_255_000n)).toBe('$1.26');
});

test('formatUsd2: negative', () => {
  expect(formatUsd2(-750_000n)).toBe('-$0.75');
});

test('formatUsd2: small amount below 1 cent', () => {
  // 4_999 micro < 0.005 USDC → rounds down to $0.00
  expect(formatUsd2(4_999n)).toBe('$0.00');
});

test('formatUsd2: exactly 0.5 cent', () => {
  // 5_000 micro = 0.005 USDC → rounds up to $0.01
  expect(formatUsd2(5_000n)).toBe('$0.01');
});
