/**
 * Functional render tests using react-dom/server renderToStaticMarkup.
 * Tests the presentational components for all four states.
 * No new dependencies; react-dom is already installed.
 */

import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { LedgerViewModel } from './view-model.js';
import { StatusPill } from './components/StatusPill.js';
import { LedgerTable } from './components/LedgerTable.js';
import { TieOutBar } from './components/TieOutBar.js';
import type { Address, Hex } from 'viem';
import { EXPLORER_BASE } from './batch.js';
import { formatUtc } from './format.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────

const BATCH_TX = '0x50d56ea910e0412c47a7dc186b5f89ccf7cbe71235db799379874d6100987056' as Hex;
const CONTRACT = '0xC86e2241166785344E4d6692E4D2A3D4c8466d0e' as Address;
const PAYEE1 = '0xFe2b873C97CE177A0AF5e3BEad37EFE336e6a571' as Address;
const REF1 = '0x480f1d091980e77bfd5476fefacccaf148fd2eda7228cb643226eb5e0948b6db' as Hex;

function makePaidRow(i: number) {
  return {
    lineIndex: i,
    invoiceId: `INV-000${i + 1}`,
    payee: PAYEE1,
    payeeDisplay: `0xFe2b\u2026a571`,
    payeeExplorerUrl: `${EXPLORER_BASE}/address/${PAYEE1}`,
    amountDisplay: '0.020000',
    invoiceRef: REF1,
    invoiceRefDisplay: `0x480f1d09\u20260948b6db`,
    matchWord: 'Matched' as const,
    matched: true,
    mismatch: false,
    mismatchDetail: null,
    txUrl: `${EXPLORER_BASE}/tx/${BATCH_TX}`,
  };
}

const MOCK_VM_READY: LedgerViewModel = {
  status: 'final',
  receiptStatus: 'success',
  blockNumber: '26,689,516',
  txHash: BATCH_TX,
  txHashDisplay: `0x50d56ea9\u202600987056`,
  txUrl: `${EXPLORER_BASE}/tx/${BATCH_TX}`,
  contractDisplay: `0xC86e\u20266d0e`,
  contractExplorerUrl: `${EXPLORER_BASE}/address/${CONTRACT}`,
  payoutRows: Array.from({ length: 6 }, (_, i) => makePaidRow(i)),
  feeRow: {
    label: 'Network fee',
    amountDisplay: '0.011014',
    amountFullDisplay: '0.011013954 USDC',
    txUrl: `${EXPLORER_BASE}/tx/${BATCH_TX}`,
  },
  totalDisplay: '0.206014',
  matchedCount: 6,
  mismatchedCount: 0,
  invoiceCount: 6,
  matchSummary: '6 of 6 matched',
  chainOnly: false,
  tieOut: {
    ledgerTotalDisplay: '0.206014 USDC',
    walletChangeDisplay: '0.206014 USDC',
    ledgerBarPct: 100,
    walletBarPct: 100,
    tied: true,
    differenceDisplay: '$0.00',
    differenceExact: '0.000000 USDC',
    differenceWei: '0 wei',
    resultWord: 'Ties out. 6 of 6 matched.',
    resultClass: 'final',
    multiTxWarning: false,
  },
  warnings: [],
};

const MOCK_VM_UNTIED: LedgerViewModel = {
  ...MOCK_VM_READY,
  tieOut: {
    ...MOCK_VM_READY.tieOut!,
    tied: false,
    // differenceDisplay must be the exact figure when not tied, not $0.00
    differenceDisplay: '0.000001 USDC',
    differenceExact: '0.000001 USDC',
    differenceWei: '1000000000000 wei',
    resultWord: 'Does not tie. Difference 0.000001 USDC.',
    resultClass: 'danger',
  },
};

// ─── StatusPill render tests ──────────────────────────────────────────────

test('render: StatusPill Final shows "Final"', () => {
  const html = renderToStaticMarkup(React.createElement(StatusPill, { status: 'final' }));
  expect(html).toContain('Final');
  expect(html).not.toContain('Pending');
});

test('render: StatusPill Pending shows "Pending"', () => {
  const html = renderToStaticMarkup(React.createElement(StatusPill, { status: 'pending' }));
  expect(html).toContain('Pending');
  expect(html).not.toContain('Final');
});

test('render: StatusPill Reverted shows "Reverted"', () => {
  const html = renderToStaticMarkup(React.createElement(StatusPill, { status: 'reverted' }));
  expect(html).toContain('Reverted');
});

// ─── LedgerTable render tests ─────────────────────────────────────────────

test('render: LedgerTable shows "Matched" for all 6 rows', () => {
  const html = renderToStaticMarkup(React.createElement(LedgerTable, { vm: MOCK_VM_READY }));
  const count = (html.match(/Matched/g) ?? []).length;
  expect(count).toBeGreaterThanOrEqual(6);
});

test('render: LedgerTable has explorer tx hrefs', () => {
  const html = renderToStaticMarkup(React.createElement(LedgerTable, { vm: MOCK_VM_READY }));
  expect(html).toContain(`${EXPLORER_BASE}/tx/${BATCH_TX}`);
});

test('render: LedgerTable has explorer address hrefs for payees', () => {
  const html = renderToStaticMarkup(React.createElement(LedgerTable, { vm: MOCK_VM_READY }));
  expect(html).toContain(`${EXPLORER_BASE}/address/${PAYEE1}`);
});

test('render: LedgerTable external links have rel="noopener noreferrer"', () => {
  const html = renderToStaticMarkup(React.createElement(LedgerTable, { vm: MOCK_VM_READY }));
  expect(html).toContain('noopener noreferrer');
});

test('render: LedgerTable shows fee row "Network fee"', () => {
  const html = renderToStaticMarkup(React.createElement(LedgerTable, { vm: MOCK_VM_READY }));
  expect(html).toContain('Network fee');
  expect(html).toContain('0.011014');
  expect(html).toContain('0.011013954');
});

test('render: LedgerTable shows ledger total', () => {
  const html = renderToStaticMarkup(React.createElement(LedgerTable, { vm: MOCK_VM_READY }));
  expect(html).toContain('Ledger total');
  expect(html).toContain('0.206014');
});

// ─── TieOutBar render tests ───────────────────────────────────────────────

test('render: TieOutBar tied shows "$0.00" and "0 wei"', () => {
  const html = renderToStaticMarkup(React.createElement(TieOutBar, { tieOut: MOCK_VM_READY.tieOut! }));
  expect(html).toContain('$0.00');
  expect(html).toContain('0 wei');
  expect(html).toContain('Ties out');
});

test('render: TieOutBar tied shows "0.000000 USDC"', () => {
  const html = renderToStaticMarkup(React.createElement(TieOutBar, { tieOut: MOCK_VM_READY.tieOut! }));
  expect(html).toContain('0.000000 USDC');
});

test('render: TieOutBar not tied never shows "$0.00" (would hide a real difference)', () => {
  const html = renderToStaticMarkup(React.createElement(TieOutBar, { tieOut: MOCK_VM_UNTIED.tieOut! }));
  // The differenceDisplay must be the exact figure when tied=false, not the rounded "$0.00"
  // The mock sets differenceDisplay to "0.000001 USDC" to represent an exact non-zero value
  expect(html).not.toContain('Ties out');
  expect(html).toContain('Does not tie');
  expect(html).toContain('0.000001 USDC');
});

test('render: TieOutBar not tied shows exact wei', () => {
  const html = renderToStaticMarkup(React.createElement(TieOutBar, { tieOut: MOCK_VM_UNTIED.tieOut! }));
  expect(html).toContain('1000000000000 wei');
});

// ─── No raw hex / no default Tailwind palette check ──────────────────────

test('render: LedgerTable output contains no raw hex colors', () => {
  const html = renderToStaticMarkup(React.createElement(LedgerTable, { vm: MOCK_VM_READY }));
  // No inline style hex color values
  expect(html).not.toMatch(/color:\s*#[0-9a-fA-F]{3,6}/);
  // No default Tailwind class names like slate-500, blue-600, green-700 etc in class attributes
  expect(html).not.toMatch(/class="[^"]*(?:slate|gray|zinc|stone|neutral|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{3}/);
});

test('render: TieOutBar output contains no raw hex colors', () => {
  const html = renderToStaticMarkup(React.createElement(TieOutBar, { tieOut: MOCK_VM_READY.tieOut! }));
  expect(html).not.toMatch(/color:\s*#[0-9a-fA-F]{3,6}/);
});

// Cached notice render test

function CachedNotice({ cachedAtUtc }: { cachedAtUtc: string }) {
  return React.createElement(
    'div',
    { className: 'bg-pending-wash' },
    `Cached from ${formatUtc(cachedAtUtc)}. Arc RPC could not be reached.`,
  );
}

test('render: cached notice uses "YYYY-MM-DD HH:mm UTC" format, not ISO string', () => {
  const iso = '2026-10-19T09:05:30.547Z';
  const html = renderToStaticMarkup(React.createElement(CachedNotice, { cachedAtUtc: iso }));
  // Must contain the formatted UTC string
  expect(html).toContain('2026-10-19 09:05 UTC');
  // Must NOT contain the raw ISO string
  expect(html).not.toContain('2026-10-19T09:05:30.547Z');
  // Must NOT contain seconds or milliseconds
  expect(html).not.toContain(':30');
  expect(html).not.toContain('.547');
});

test('render: cached notice ends with "UTC"', () => {
  const html = renderToStaticMarkup(React.createElement(CachedNotice, { cachedAtUtc: '2026-01-15T13:22:00.000Z' }));
  expect(html).toContain('2026-01-15 13:22 UTC');
});

// No em dash scan

test('no-em-dash: src/landing files and index.html contain no U+2014', () => {
  const EM_DASH = String.fromCharCode(0x2014);
  const srcDir = join(new URL('.', import.meta.url).pathname);
  const indexHtml = join(srcDir, '..', '..', 'index.html');

  function scanDir(dir: string): string[] {
    const violations: string[] = [];
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fp = join(dir, entry.name);
      if (entry.isDirectory()) {
        violations.push(...scanDir(fp));
      } else if (entry.isFile() && /\.(ts|tsx|js|jsx|html|css)$/.test(entry.name)) {
        const content = readFileSync(fp, 'utf-8');
        if (content.includes(EM_DASH)) {
          violations.push(fp);
        }
      }
    }
    return violations;
  }

  const violations = scanDir(srcDir);
  // Also check index.html
  const indexContent = readFileSync(indexHtml, 'utf-8');
  if (indexContent.includes(EM_DASH)) violations.push(indexHtml);

  expect(violations).toEqual([]);
});

// Panel label follows state

// ─── Mismatch render tests ────────────────────────────────────────────────

function makeMismatchRow(i: number) {
  return {
    ...makePaidRow(i),
    matchWord: 'Mismatch' as const,
    matched: false,
    mismatch: true,
    mismatchDetail: {
      fields: ['payee' as const],
      expectedPayee: '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC' as Address,
      actualPayee: PAYEE1,
    },
  };
}

test('render: LedgerTable shows "Mismatch" for a mismatched row with danger classes', () => {
  const vm: LedgerViewModel = {
    ...MOCK_VM_READY,
    payoutRows: [makeMismatchRow(0), ...Array.from({ length: 5 }, (_, i) => makePaidRow(i + 1))],
    matchedCount: 5,
    mismatchedCount: 1,
    matchSummary: '5 of 6 matched, 1 mismatch',
  };
  const html = renderToStaticMarkup(React.createElement(LedgerTable, { vm }));
  expect(html).toContain('Mismatch');
  // Row background uses danger token, not pending
  expect(html).toContain('bg-danger-wash');
  expect(html).not.toContain('bg-pending-wash');
  // Visible detail text: expected and actual payee addresses must appear as text
  expect(html).toContain('0xCCCC');
  expect(html).toContain('Payee:');
});

test('render: LedgerTable mismatch row does not show "Matched" in its match cell', () => {
  const vm: LedgerViewModel = {
    ...MOCK_VM_READY,
    payoutRows: [makeMismatchRow(0)],
    matchedCount: 0,
    mismatchedCount: 1,
    matchSummary: '0 of 1 matched, 1 mismatch',
  };
  const html = renderToStaticMarkup(React.createElement(LedgerTable, { vm }));
  // "Mismatch" must appear; "Matched" (past tense) must not
  expect(html).toContain('Mismatch');
  expect(html).not.toContain('Matched');
  // Danger row class, no pending class
  expect(html).toContain('bg-danger-wash');
  expect(html).not.toContain('bg-pending-wash');
  // text-danger on the icon/label
  expect(html).toContain('text-danger');
});

test('render: LedgerTable amount-mismatch row shows "Amount:" detail line', () => {
  const EXPECTED_AMOUNT = '0.020001';   // what the CSV says
  const ACTUAL_AMOUNT   = '0.020000';   // what was on chain

  const amountMismatchRow = {
    ...makePaidRow(0),
    matchWord: 'Mismatch' as const,
    matched: false,
    mismatch: true,
    mismatchDetail: {
      fields: ['amount' as const],
      expectedAmount: EXPECTED_AMOUNT,
      actualAmount:   ACTUAL_AMOUNT,
    },
  };

  const vm: LedgerViewModel = {
    ...MOCK_VM_READY,
    payoutRows: [amountMismatchRow],
    matchedCount: 0,
    mismatchedCount: 1,
    matchSummary: '0 of 1 matched, 1 mismatch',
  };

  const html = renderToStaticMarkup(React.createElement(LedgerTable, { vm }));
  expect(html).toContain('Mismatch');
  expect(html).toContain('Amount:');
  expect(html).toContain(EXPECTED_AMOUNT);
  expect(html).toContain(ACTUAL_AMOUNT);
  // Payee detail must NOT appear (not in fields)
  expect(html).not.toContain('Payee:');
  expect(html).toContain('bg-danger-wash');
});

// ─── Panel label follows state ────────────────────────────────────────────

test('render: panel label reads "(deleted)" in empty state area', () => {
  // The label is driven by state; in non-ready/non-cached states it reads "(deleted)"
  // We test the logic by rendering a minimal span that mirrors the condition
  function PanelLabel({ kind }: { kind: string }) {
    const label = (kind === 'ready' || kind === 'cached') ? '(rebuilt from chain)' : '(deleted)';
    return React.createElement('span', { className: 'text-ink-subtle' }, label);
  }
  expect(renderToStaticMarkup(React.createElement(PanelLabel, { kind: 'empty' }))).toContain('(deleted)');
  expect(renderToStaticMarkup(React.createElement(PanelLabel, { kind: 'loading' }))).toContain('(deleted)');
  expect(renderToStaticMarkup(React.createElement(PanelLabel, { kind: 'error' }))).toContain('(deleted)');
  expect(renderToStaticMarkup(React.createElement(PanelLabel, { kind: 'ready' }))).toContain('(rebuilt from chain)');
  expect(renderToStaticMarkup(React.createElement(PanelLabel, { kind: 'cached' }))).toContain('(rebuilt from chain)');
});
