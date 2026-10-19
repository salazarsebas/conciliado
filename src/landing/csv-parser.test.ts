/**
 * Tests for parseCsv (src/landing/csv-parser.ts).
 */

import { expect, test } from 'bun:test';
import { parseCsv, CsvParseError } from './csv-parser.js';
import fs from 'node:fs';
import path from 'node:path';

const CSV_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), '../../fixtures/mainnet-batch-1.csv');
const RAW = fs.readFileSync(CSV_PATH, 'utf-8');

test('csv-parser: parses six rows from mainnet-batch-1.csv', () => {
  const rows = parseCsv(RAW);
  expect(rows).toHaveLength(6);
});

test('csv-parser: invoice IDs match fixture', () => {
  const rows = parseCsv(RAW);
  expect(rows[0].invoiceId).toBe('INV-0001');
  expect(rows[5].invoiceId).toBe('INV-0006');
});

test('csv-parser: amounts are correct bigints (micro-USDC)', () => {
  const rows = parseCsv(RAW);
  expect(rows[0].amount).toBe(20000n);
  expect(rows[1].amount).toBe(25000n);
  expect(rows[2].amount).toBe(30000n);
  expect(rows[3].amount).toBe(35000n);
  expect(rows[4].amount).toBe(40000n);
  expect(rows[5].amount).toBe(45000n);
});

test('csv-parser: invoice refs match fixture JSON', () => {
  const rows = parseCsv(RAW);
  expect(rows[0].invoiceRef).toBe('0x480f1d091980e77bfd5476fefacccaf148fd2eda7228cb643226eb5e0948b6db');
  expect(rows[5].invoiceRef).toBe('0xc0d92519e0006e0ed36a0f1270f24d2ac732a46f1edc7fd5a40365efe0bf03bb');
});

test('csv-parser: payees are present and non-empty', () => {
  const rows = parseCsv(RAW);
  for (const row of rows) {
    expect(row.payee.length).toBeGreaterThan(0);
    expect(row.payee.startsWith('0x')).toBe(true);
  }
});

test('csv-parser: cost_center column is parsed', () => {
  const rows = parseCsv(RAW);
  expect(rows[0].costCenter).toBe('CC-1001');
});

test('csv-parser: rejects a bad header', () => {
  const bad = 'wrong_header,payee,amount,invoice_ref,cost_center\nINV-001,0xabc,1000,0xdef,CC-1';
  let threw = false;
  try {
    parseCsv(bad);
  } catch (e) {
    expect(e).toBeInstanceOf(CsvParseError);
    threw = true;
  }
  expect(threw).toBe(true);
});

test('csv-parser: rejects empty string', () => {
  let threw = false;
  try {
    parseCsv('');
  } catch (e) {
    expect(e).toBeInstanceOf(CsvParseError);
    threw = true;
  }
  expect(threw).toBe(true);
});
