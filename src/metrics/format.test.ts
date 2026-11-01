import { expect, test } from 'bun:test';
import { formatUsdc9 } from './format.js';

test('formatUsdc9 shows nine decimals', () => {
  expect(formatUsdc9(1_835_659_000_000_000n)).toBe('0.001835659');
  expect(formatUsdc9(0n)).toBe('0.000000000');
  expect(formatUsdc9(5_549_552_547_685_857_192n)).toBe('5.549552548');
});

test('formatUsdc9 rounds half-up at the ninth decimal', () => {
  expect(formatUsdc9(1_439_662_552_357_135n)).toBe('0.001439663');
  expect(formatUsdc9(1_499_999_999n)).toBe('0.000000001');
  expect(formatUsdc9(500_000_000n)).toBe('0.000000001');
  expect(formatUsdc9(499_999_999n)).toBe('0.000000000');
});

test('formatUsdc9 rejects a negative amount', () => {
  expect(() => formatUsdc9(-1n)).toThrow(RangeError);
});
