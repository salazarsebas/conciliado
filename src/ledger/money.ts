/**
 * Bigint money helpers for Conciliado ledger.
 *
 * ROUNDING RULE (stated here per spec):
 *   nativeToMicro converts native18 (Arc gas units, 18 decimals) to micro-USDC
 *   (6 decimals) by dividing by 10^12.  Remainders are resolved HALF-UP toward
 *   positive infinity — i.e. if the sub-micro remainder ≥ 0.5 micro we round up
 *   by one.  This is the accounting convention used throughout: every truncation
 *   carries at most 0.5 micro = 0.0000005 USDC of rounding error.
 *
 *   Implementation: roundHalfUp(x, d) = (x + d/2) / d  (integer division)
 *   where d = 10^12.  Works for x ≥ 0; the callers in this module pass
 *   non-negative values only.
 *
 * All amounts are bigint. Never use `number` for money.
 */

/** 10^12 — the ratio between Arc's 18-decimal native gas and 6-decimal micro-USDC. */
const SCALE = 1_000_000_000_000n; // 10^12

/**
 * Convert a native-gas amount (18 decimals) to micro-USDC (6 decimals).
 * Rounds HALF-UP: any sub-micro remainder ≥ 0.5 rounds up by 1.
 * Input must be non-negative.
 */
export function nativeToMicro(native18: bigint): bigint {
  if (native18 < 0n) throw new RangeError('nativeToMicro: negative input');
  return (native18 + SCALE / 2n) / SCALE;
}

/**
 * Convert micro-USDC (6 decimals) to native-gas units (18 decimals).
 * Exact — no rounding (multiplication by 10^12 is lossless).
 */
export function microToNative(micro: bigint): bigint {
  return micro * SCALE;
}

/**
 * Format a micro-USDC amount as a decimal string with exactly 6 fraction digits.
 * Sign-aware: negative values are prefixed with '-'.
 *
 * Example: 1_250_000n → "1.250000", -750_000n → "-0.750000"
 */
export function formatMicro(micro: bigint): string {
  const sign = micro < 0n ? '-' : '';
  const abs = micro < 0n ? -micro : micro;
  const whole = abs / 1_000_000n;
  const frac = abs % 1_000_000n;
  return `${sign}${whole}.${frac.toString().padStart(6, '0')}`;
}

/**
 * Format a micro-USDC amount as a "$X.XX" display string with exactly 2 fraction
 * digits, rounding HALF AWAY FROM ZERO (standard financial rounding).
 *
 * Example: 1_251_000n → "$1.25", 1_255_000n → "$1.26", -750_000n → "-$0.75"
 */
export function formatUsd2(micro: bigint): string {
  const sign = micro < 0n ? '-' : '';
  const abs = micro < 0n ? -micro : micro;
  // Round to cents (2 decimal places from 6)
  const CENT = 10_000n; // 10^4 = micro per cent
  const cents = (abs + CENT / 2n) / CENT; // half-up rounding
  const dollars = cents / 100n;
  const remainCents = cents % 100n;
  return `${sign}$${dollars}.${remainCents.toString().padStart(2, '0')}`;
}
