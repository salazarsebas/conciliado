/**
 * Unit tests for src/run/csv-parse.ts
 * No DOM, no viem network calls.
 */

import { expect, test, describe } from 'bun:test';
import {
  parseRunCsv,
  decimalToMicro,
  buildPayerCsv,
  buildSaltFile,
  neutraliseFormulaInjection,
  deriveRefs,
} from './csv-parse.js';
import { makeInvoiceRef } from '../ledger/ref.js';

// ─── decimalToMicro ───────────────────────────────────────────────────────────

describe('decimalToMicro', () => {
  test('integer amount', () => {
    const r = decimalToMicro('20');
    expect('error' in r).toBe(false);
    if (!('error' in r)) expect(r.micro).toBe(20_000_000n);
  });

  test('decimal amount 20.5 → 20500000', () => {
    const r = decimalToMicro('20.5');
    expect('error' in r).toBe(false);
    if (!('error' in r)) expect(r.micro).toBe(20_500_000n);
  });

  test('exactly 6 decimals', () => {
    const r = decimalToMicro('1.000001');
    expect('error' in r).toBe(false);
    if (!('error' in r)) expect(r.micro).toBe(1_000_001n);
  });

  test('7 decimals rejected', () => {
    const r = decimalToMicro('1.0000001');
    expect('error' in r).toBe(true);
    if ('error' in r) expect(r.error).toContain('more than 6 decimal places');
  });

  test('zero rejected', () => {
    const r = decimalToMicro('0');
    expect('error' in r).toBe(true);
  });

  test('negative rejected', () => {
    const r = decimalToMicro('-1.5');
    expect('error' in r).toBe(true);
    if ('error' in r) expect(r.error).toContain('positive');
  });

  test('non-numeric rejected', () => {
    const r = decimalToMicro('abc');
    expect('error' in r).toBe(true);
  });

  test('empty string rejected', () => {
    const r = decimalToMicro('');
    expect('error' in r).toBe(true);
  });
});

// ─── parseRunCsv — valid cases ────────────────────────────────────────────────

const VALID_CSV = `invoiceId,payee,amount,costCenter
INV-001,0xFe2b873C97CE177A0AF5e3BEad37EFE336e6a571,20.5,CC-01
INV-002,0x5eb1f8E7b85938E2eB71a1a0A0c71c9155B79F07,100.000000,CC-02
`;

test('parseRunCsv: valid 2-row CSV', () => {
  const r = parseRunCsv(VALID_CSV);
  expect(r.errors).toHaveLength(0);
  expect(r.rows).toHaveLength(2);
  expect(r.rows[0].invoiceId).toBe('INV-001');
  expect(r.rows[0].amountMicro).toBe(20_500_000n);
  expect(r.rows[1].amountMicro).toBe(100_000_000n);
});

test('parseRunCsv: costCenter optional — header without costCenter accepted', () => {
  const csv = `invoiceId,payee,amount
INV-001,0xFe2b873C97CE177A0AF5e3BEad37EFE336e6a571,1.0
`;
  const r = parseRunCsv(csv);
  expect(r.errors).toHaveLength(0);
  expect(r.rows).toHaveLength(1);
  expect(r.rows[0].costCenter).toBe('');
});

test('parseRunCsv: snake_case header aliases (invoice_id, cost_center)', () => {
  const csv = `invoice_id,payee,amount,cost_center
INV-001,0xFe2b873C97CE177A0AF5e3BEad37EFE336e6a571,5.0,CC-X
`;
  const r = parseRunCsv(csv);
  expect(r.errors).toHaveLength(0);
  expect(r.rows[0].invoiceId).toBe('INV-001');
});

test('parseRunCsv: case-insensitive header (INVOICEID)', () => {
  const csv = `INVOICEID,PAYEE,AMOUNT
INV-001,0xFe2b873C97CE177A0AF5e3BEad37EFE336e6a571,1.0
`;
  const r = parseRunCsv(csv);
  expect(r.errors).toHaveLength(0);
});

test('parseRunCsv: BOM stripped', () => {
  const csv = '\uFEFF' + 'invoiceId,payee,amount\nINV-001,0xFe2b873C97CE177A0AF5e3BEad37EFE336e6a571,1.0\n';
  const r = parseRunCsv(csv);
  expect(r.errors).toHaveLength(0);
  expect(r.rows).toHaveLength(1);
});

test('parseRunCsv: CRLF line endings', () => {
  const csv = 'invoiceId,payee,amount\r\nINV-001,0xFe2b873C97CE177A0AF5e3BEad37EFE336e6a571,1.0\r\n';
  const r = parseRunCsv(csv);
  expect(r.errors).toHaveLength(0);
  expect(r.rows).toHaveLength(1);
});

test('parseRunCsv: blank lines skipped', () => {
  const csv = 'invoiceId,payee,amount\n\nINV-001,0xFe2b873C97CE177A0AF5e3BEad37EFE336e6a571,1.0\n\n';
  const r = parseRunCsv(csv);
  expect(r.errors).toHaveLength(0);
  expect(r.rows).toHaveLength(1);
});

test('parseRunCsv: trailing newline OK', () => {
  const csv = 'invoiceId,payee,amount\nINV-001,0xFe2b873C97CE177A0AF5e3BEad37EFE336e6a571,1.0\n';
  const r = parseRunCsv(csv);
  expect(r.rows).toHaveLength(1);
});

test('parseRunCsv: quoted fields', () => {
  const csv = 'invoiceId,payee,amount,costCenter\n"INV,001",0xFe2b873C97CE177A0AF5e3BEad37EFE336e6a571,1.0,"CC, 01"\n';
  const r = parseRunCsv(csv);
  expect(r.errors).toHaveLength(0);
  expect(r.rows[0].invoiceId).toBe('INV,001');
  expect(r.rows[0].costCenter).toBe('CC, 01');
});

// ─── parseRunCsv — per-row errors ─────────────────────────────────────────────

test('parseRunCsv: empty invoiceId error', () => {
  const csv = 'invoiceId,payee,amount\n,0xFe2b873C97CE177A0AF5e3BEad37EFE336e6a571,1.0\n';
  const r = parseRunCsv(csv);
  expect(r.errors.some((e) => e.reason.includes('invoiceId is empty'))).toBe(true);
});

test('parseRunCsv: duplicate invoiceId error', () => {
  const csv = [
    'invoiceId,payee,amount',
    'INV-001,0xFe2b873C97CE177A0AF5e3BEad37EFE336e6a571,1.0',
    'INV-001,0x5eb1f8E7b85938E2eB71a1a0A0c71c9155B79F07,2.0',
  ].join('\n');
  const r = parseRunCsv(csv);
  expect(r.errors.some((e) => e.reason.includes('duplicate invoiceId'))).toBe(true);
});

test('parseRunCsv: invalid payee address', () => {
  const csv = 'invoiceId,payee,amount\nINV-001,0xBAD,1.0\n';
  const r = parseRunCsv(csv);
  expect(r.errors.some((e) => e.reason.includes('invalid payee address'))).toBe(true);
});

test('parseRunCsv: zero address rejected', () => {
  const csv = 'invoiceId,payee,amount\nINV-001,0x0000000000000000000000000000000000000000,1.0\n';
  const r = parseRunCsv(csv);
  expect(r.errors.some((e) => e.reason.includes('zero address'))).toBe(true);
});

test('parseRunCsv: zero amount rejected', () => {
  const csv = 'invoiceId,payee,amount\nINV-001,0xFe2b873C97CE177A0AF5e3BEad37EFE336e6a571,0\n';
  const r = parseRunCsv(csv);
  expect(r.errors.some((e) => e.reason.includes('zero') || e.reason.includes('positive'))).toBe(true);
});

test('parseRunCsv: more than 6 decimals rejected', () => {
  const csv = 'invoiceId,payee,amount\nINV-001,0xFe2b873C97CE177A0AF5e3BEad37EFE336e6a571,1.0000001\n';
  const r = parseRunCsv(csv);
  expect(r.errors.some((e) => e.reason.includes('decimal'))).toBe(true);
});

test('parseRunCsv: negative amount rejected', () => {
  const csv = 'invoiceId,payee,amount\nINV-001,0xFe2b873C97CE177A0AF5e3BEad37EFE336e6a571,-1.0\n';
  const r = parseRunCsv(csv);
  expect(r.errors.some((e) => e.reason.includes('positive') || e.reason.includes('negative'))).toBe(true);
});

test('parseRunCsv: all rows validated (no early exit)', () => {
  const csv = [
    'invoiceId,payee,amount',
    ',0xFe2b873C97CE177A0AF5e3BEad37EFE336e6a571,1.0',            // row 1: empty id
    'INV-002,0xBAD,1.0',                                            // row 2: bad address
    'INV-003,0x5eb1f8E7b85938E2eB71a1a0A0c71c9155B79F07,1.0000001',// row 3: too many decimals
  ].join('\n');
  const r = parseRunCsv(csv);
  expect(r.errors.length).toBe(3);
});

// ─── 200 vs 201 lines ────────────────────────────────────────────────────────

function makeRow(i: number, payee = '0xFe2b873C97CE177A0AF5e3BEad37EFE336e6a571') {
  return `INV-${String(i).padStart(4, '0')},${payee},1.0`;
}

test('parseRunCsv: 200 rows accepted', () => {
  const lines = ['invoiceId,payee,amount'];
  for (let i = 1; i <= 200; i++) lines.push(makeRow(i));
  const r = parseRunCsv(lines.join('\n'));
  expect(r.tooManyRows).toBe(false);
  expect(r.rows).toHaveLength(200);
  expect(r.errors).toHaveLength(0);
});

test('parseRunCsv: 201 rows rejected with whole-file error', () => {
  const lines = ['invoiceId,payee,amount'];
  for (let i = 1; i <= 201; i++) lines.push(makeRow(i));
  const r = parseRunCsv(lines.join('\n'));
  expect(r.tooManyRows).toBe(true);
  expect(r.rows).toHaveLength(0);
  expect(r.errors[0].reason).toContain('201');
  expect(r.errors[0].reason).toContain('200');
});

// ─── Formula injection neutralisation ────────────────────────────────────────

test('neutraliseFormulaInjection: = prefixed', () => {
  expect(neutraliseFormulaInjection('=SUM(A1)')).toBe("'=SUM(A1)");
});
test('neutraliseFormulaInjection: + prefixed', () => {
  expect(neutraliseFormulaInjection('+foo')).toBe("'+foo");
});
test('neutraliseFormulaInjection: - prefixed', () => {
  expect(neutraliseFormulaInjection('-foo')).toBe("'-foo");
});
test('neutraliseFormulaInjection: @ prefixed', () => {
  expect(neutraliseFormulaInjection('@foo')).toBe("'@foo");
});
test('neutraliseFormulaInjection: safe value unchanged', () => {
  expect(neutraliseFormulaInjection('INV-001')).toBe('INV-001');
});

// ─── buildPayerCsv — formula injection in download ───────────────────────────

test('buildPayerCsv: formula-injection values get neutralised', () => {
  const rows = [{
    rowNum: 1,
    invoiceId: '=SUM(A1)',
    payee: '0xFe2b873C97CE177A0AF5e3BEad37EFE336e6a571' as `0x${string}`,
    amountMicro: 1_000_000n,
    amountDisplay: '1.000000',
    costCenter: '@test',
  }];
  const refs = ['0xabc' as `0x${string}`];
  const csv = buildPayerCsv(rows, refs);
  expect(csv).toContain("'=SUM(A1)");
  expect(csv).toContain("'@test");
});

// ─── buildSaltFile ────────────────────────────────────────────────────────────

test('buildSaltFile: contains all required fields', () => {
  const salt = '0x' + 'ab'.repeat(32) as `0x${string}`;
  const content = buildSaltFile(salt, '0xC86e2241166785344E4d6692E4D2A3D4c8466d0e', 5042);
  expect(content).toContain(`salt=${salt}`);
  expect(content).toContain('payoutBatch=0xC86e2241166785344E4d6692E4D2A3D4c8466d0e');
  expect(content).toContain('chainId=5042');
  expect(content).toContain('Keep this file');
  expect(content).toContain('Conciliado does not store it');
});

// ─── Ref derivation matches src/ledger/ref.ts ────────────────────────────────

test('derived invoiceRef matches makeInvoiceRef from ledger/ref', () => {
  const invoiceId = 'INV-001';
  const salt = '0x' + '01'.repeat(32) as `0x${string}`;
  const expected = makeInvoiceRef(invoiceId, salt);

  // parseRunCsv + deriveRefs should produce the same value
  const csv = `invoiceId,payee,amount\nINV-001,0xFe2b873C97CE177A0AF5e3BEad37EFE336e6a571,1.0\n`;
  const r = parseRunCsv(csv);
  const [ref] = deriveRefs(r.rows, salt);
  expect(ref).toBe(expected);
});

// ─── Network table matches fixtures/mainnet-batch-1.json ─────────────────────

test('network table mainnet addresses match fixtures', async () => {
  const fs = await import('node:fs');
  const nodePath = await import('node:path');
  const fixtureRaw = fs.readFileSync(
    nodePath.join(new URL('../..', import.meta.url).pathname, 'fixtures/mainnet-batch-1.json'),
    'utf-8',
  );
  const fixture = JSON.parse(fixtureRaw) as {
    contract: string;
    usdc: string;
    payer: string;
  };

  const { MAINNET_NETWORK } = await import('./networks.js');
  expect(MAINNET_NETWORK.payoutBatch.toLowerCase()).toBe(fixture.contract.toLowerCase());
  expect(MAINNET_NETWORK.usdc.toLowerCase()).toBe(fixture.usdc.toLowerCase());
});

// ─── tx query param parsing ───────────────────────────────────────────────────

test('parseQueryParams: valid tx hash parsed', () => {
  const tx = '0x' + 'ab'.repeat(32);
  const params = new URLSearchParams(`tx=${tx}&network=mainnet`);
  const rawTx = params.get('tx') ?? '';
  const valid = /^0x[0-9a-fA-F]{64}$/.test(rawTx);
  expect(valid).toBe(true);
});

test('parseQueryParams: short hash rejected', () => {
  const params = new URLSearchParams('tx=0xabc');
  const rawTx = params.get('tx') ?? '';
  const valid = /^0x[0-9a-fA-F]{64}$/.test(rawTx);
  expect(valid).toBe(false);
});

test('parseQueryParams: network=testnet parsed', () => {
  const params = new URLSearchParams('network=testnet');
  const raw = params.get('network') ?? 'mainnet';
  expect(raw).toBe('testnet');
});
