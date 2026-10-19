/**
 * Pure formatting helpers for the Conciliado landing.
 * No imports from viem or React; safe for bun test without DOM.
 *
 * Rules from brand-book.md:
 *   - USDC: 6 decimals always, no trimming. "0.020000 USDC"
 *   - $: 2 decimals, rounded half-up. "$0.21"
 *   - Minus: plain hyphen, not en-dash or minus sign.
 *   - Thousands: comma separator. "1,250.000000"
 *   - Duration: "320 ms" under 1 s, "1.4 s" above.
 *   - Addresses: 0x + 4 + … + 4. Hashes/refs: 0x + 8 + … + 8.
 *   - Ellipsis: the real character "…", not three periods.
 *   - Block numbers: thousands-separated for display, plain digits when copied.
 */

/** Format a bigint micro-USDC value as a 6-decimal string with thousands separator. */
export function formatMicro6(micro: bigint): string {
  const sign = micro < 0n ? '-' : '';
  const abs = micro < 0n ? -micro : micro;
  const whole = abs / 1_000_000n;
  const frac = abs % 1_000_000n;
  // Thousands-separate the integer part
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${wholeStr}.${frac.toString().padStart(6, '0')}`;
}

/** Format a bigint micro-USDC as "$X.XX" (half-up to cents). */
export function formatUsd2(micro: bigint): string {
  const sign = micro < 0n ? '-' : '';
  const abs = micro < 0n ? -micro : micro;
  const CENT = 10_000n;
  const cents = (abs + CENT / 2n) / CENT;
  const dollars = cents / 100n;
  const rem = cents % 100n;
  const dollarsStr = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${dollarsStr}.${rem.toString().padStart(2, '0')}`;
}

/** Format a 9-decimal full fee figure (e.g. "0.011013954 USDC"). */
export function formatFeeFullUsdc(feeNative18: bigint): string {
  // Show the full 18-decimal fee as a decimal string with enough decimals to be exact.
  // We show 9 decimal places minimum (18-decimal fee displayed as USDC).
  const fullScale = 1_000_000_000_000_000_000n; // 10^18
  const intPart = feeNative18 / fullScale;
  const fracPart = feeNative18 % fullScale;
  // Pad to 18 digits then trim trailing zeros but keep at least 9
  const fracStr = fracPart.toString().padStart(18, '0');
  // Trim trailing zeros but never below 9 decimal places
  let trimmed = fracStr.replace(/0+$/, '');
  if (trimmed.length < 9) trimmed = trimmed.padEnd(9, '0');
  const intStr = intPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${intStr}.${trimmed} USDC`;
}

/** Format a bigint native-18 delta as micro-USDC (6 decimals, half-up), with " USDC" suffix. */
export function formatNativeAsMicro(native18: bigint): string {
  const SCALE = 1_000_000_000_000n;
  const sign = native18 < 0n ? '-' : '';
  const abs = native18 < 0n ? -native18 : native18;
  const micro = (abs + SCALE / 2n) / SCALE; // half-up
  return `${sign}${formatMicro6(micro)} USDC`;
}

/** Format a duration in milliseconds per brand-book.md. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/**
 * Truncate an Ethereum address: 0x + 4 chars + … + 4 chars.
 * Uses the real ellipsis character (U+2026), not three periods.
 */
export function truncateAddress(addr: string): string {
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`;
}

/**
 * Truncate a transaction hash or invoice reference: 0x + 8 chars + … + 8 chars.
 */
export function truncateHash(hash: string): string {
  if (hash.length < 20) return hash;
  return `${hash.slice(0, 10)}\u2026${hash.slice(-8)}`;
}

/** Format a block number with thousands separators for display. */
export function formatBlockNumber(n: bigint): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format an ISO-8601 timestamp (or Date) as "YYYY-MM-DD HH:mm UTC".
 * UTC, minutes precision only, a space before "UTC". Never an ISO string.
 * Per brand-book.md: "2026-10-19 09:05 UTC".
 */
export function formatUtc(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min} UTC`;
}
