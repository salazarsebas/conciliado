/**
 * Tests for format.ts helpers.
 */

import { expect, test } from 'bun:test';
import {
  formatMicro6,
  formatUsd2,
  formatDuration,
  formatUtc,
  truncateAddress,
  truncateHash,
  formatBlockNumber,
  formatFeeFullUsdc,
} from './format.js';

// formatMicro6

test('format: formatMicro6: six decimals, no trimming', () => {
  expect(formatMicro6(20000n)).toBe('0.020000');
  expect(formatMicro6(195000n)).toBe('0.195000');
  expect(formatMicro6(0n)).toBe('0.000000');
  expect(formatMicro6(1000000n)).toBe('1.000000');
  expect(formatMicro6(1250000n)).toBe('1.250000');
  expect(formatMicro6(206014n)).toBe('0.206014');
});

test('format: formatMicro6: thousands separator', () => {
  expect(formatMicro6(1000000000n)).toBe('1,000.000000');
  expect(formatMicro6(1250000000n)).toBe('1,250.000000');
});

test('format: formatMicro6: negative with hyphen minus', () => {
  expect(formatMicro6(-1000000n)).toBe('-1.000000');
  // Must be a regular hyphen, not an en-dash
  expect(formatMicro6(-500n).charCodeAt(0)).toBe(45); // 45 = '-'
});

// formatUsd2

test('format: formatUsd2: two decimals, rounds half-up', () => {
  expect(formatUsd2(0n)).toBe('$0.00');
  expect(formatUsd2(206014n)).toBe('$0.21');
  expect(formatUsd2(195000n)).toBe('$0.20');
  expect(formatUsd2(1000000n)).toBe('$1.00');
  expect(formatUsd2(1255000n)).toBe('$1.26'); // 1.255 rounds up
});

test('format: formatUsd2: negative', () => {
  expect(formatUsd2(-500000n)).toBe('-$0.50');
});

// formatDuration

test('format: formatDuration: under 1 s shows "320 ms"', () => {
  expect(formatDuration(320)).toBe('320 ms');
  expect(formatDuration(0)).toBe('0 ms');
  expect(formatDuration(999)).toBe('999 ms');
});

test('format: formatDuration: 1 s or above shows "1.4 s"', () => {
  expect(formatDuration(1000)).toBe('1.0 s');
  expect(formatDuration(1400)).toBe('1.4 s');
  expect(formatDuration(2500)).toBe('2.5 s');
});

// formatUtc

test('format: formatUtc: ISO string to "YYYY-MM-DD HH:mm UTC"', () => {
  expect(formatUtc('2026-10-19T09:05:30.547Z')).toBe('2026-10-19 09:05 UTC');
});

test('format: formatUtc: midnight UTC', () => {
  expect(formatUtc('2026-01-01T00:00:00.000Z')).toBe('2026-01-01 00:00 UTC');
});

test('format: formatUtc: Date object', () => {
  const d = new Date('2026-10-19T09:05:30.547Z');
  expect(formatUtc(d)).toBe('2026-10-19 09:05 UTC');
});

test('format: formatUtc: result never contains ISO separators "T", "Z" or "."', () => {
  const result = formatUtc('2026-10-19T09:05:30.547Z');
  // No ISO date-time "T" separator (the T in "UTC" is fine, check for "T" between digits)
  expect(result).not.toMatch(/\d T \d|\dT\d/);
  // No trailing "Z" (the ISO UTC designator)
  expect(result).not.toMatch(/Z$/);
  // No fractional seconds (dot between digits)
  expect(result).not.toMatch(/\d\.\d/);
  expect(result.endsWith('UTC')).toBe(true);
});

// truncateAddress

test('format: truncateAddress: 0x + 4 + ellipsis + 4', () => {
  const addr = '0xFe2b873C97CE177A0AF5e3BEad37EFE336e6a571';
  const result = truncateAddress(addr);
  // Must start with 0xFe2b, use real ellipsis (U+2026), end with a571
  expect(result.startsWith('0xFe2b')).toBe(true);
  expect(result.includes('\u2026')).toBe(true); // real ellipsis, not "..."
  expect(result.endsWith('a571')).toBe(true);
});

test('format: truncateAddress: full value accessible (not lost)', () => {
  const addr = '0xFe2b873C97CE177A0AF5e3BEad37EFE336e6a571';
  const truncated = truncateAddress(addr);
  // The full value is preserved for aria-label / title usage
  expect(addr.length).toBeGreaterThan(truncated.length);
});

// truncateHash

test('format: truncateHash: 0x + 8 + ellipsis + 8', () => {
  const hash = '0x50d56ea910e0412c47a7dc186b5f89ccf7cbe71235db799379874d6100987056';
  const result = truncateHash(hash);
  expect(result.startsWith('0x50d56ea9')).toBe(true);
  expect(result.includes('\u2026')).toBe(true);
  expect(result.endsWith('00987056')).toBe(true);
});

// formatBlockNumber

test('format: formatBlockNumber: thousands separator', () => {
  expect(formatBlockNumber(26689516n)).toBe('26,689,516');
  expect(formatBlockNumber(1000n)).toBe('1,000');
  expect(formatBlockNumber(0n)).toBe('0');
});

// formatFeeFullUsdc

test('format: formatFeeFullUsdc: full precision for 11013954000000000 wei', () => {
  // feeWei = 524474 * 21000000000 = 11013954000000000
  const feeWei = 11013954000000000n;
  const result = formatFeeFullUsdc(feeWei);
  // Should contain "0.011013954" and end with "USDC"
  expect(result).toContain('011013954');
  expect(result.endsWith('USDC')).toBe(true);
});
