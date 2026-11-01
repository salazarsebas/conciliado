/**
 * Display helpers for /metrics. Pure.
 */

const SCALE_18_TO_9 = 1_000_000_000n; // 10^9

/**
 * Format an 18-decimal native amount as USDC with exactly 9 decimals, rounded half-up
 * ("0.001835659"). Nine decimals keep the network fee of one line readable and still
 * resolve a tenth of a thousandth of a cent. Input must be non-negative.
 */
export function formatUsdc9(native18: bigint): string {
  if (native18 < 0n) throw new RangeError('formatUsdc9: negative input');
  const scaled = (native18 + SCALE_18_TO_9 / 2n) / SCALE_18_TO_9;
  const whole = scaled / SCALE_18_TO_9;
  const frac = scaled % SCALE_18_TO_9;
  return `${whole}.${frac.toString().padStart(9, '0')}`;
}
