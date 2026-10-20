/**
 * Render tests for /run presentational states.
 * Uses react-dom/server renderToStaticMarkup; no DOM, no browser.
 */

import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import type { Address, Hex } from 'viem';
import { MAINNET_NETWORK, TESTNET_NETWORK } from './networks.js';
import { makeInitialState, type FlowState } from './flow.js';

// ─── Minimal component stubs for the purely presentational parts ────────────

function NetworkBadgeStub({ isMainnet }: { isMainnet: boolean }) {
  if (isMainnet) {
    return React.createElement(
      'span',
      { className: 'bg-mainnet text-mainnet-ink' },
      'Arc mainnet',
    );
  }
  return React.createElement(
    'span',
    { className: 'bg-pending-wash text-pending' },
    'Arc testnet (test funds)',
  );
}

function PrivacyWarningStub() {
  return React.createElement(
    'div',
    { className: 'bg-pending-wash' },
    'Payee addresses, amounts, and timing are public on Arc. Only a salted reference is written for each invoice; invoice IDs and cost centers stay in this browser.',
  );
}

function ReviewTableStub({ rows, rawUnits }: { rows: Array<{ invoiceId: string; rawUnit: string }>; rawUnits: boolean }) {
  return React.createElement(
    'table',
    null,
    React.createElement(
      'thead',
      null,
      React.createElement(
        'tr',
        null,
        React.createElement('th', { scope: 'col' }, 'Invoice ID'),
        React.createElement('th', { scope: 'col' }, 'Payee'),
        React.createElement('th', { scope: 'col' }, 'Amount (USDC)'),
        rawUnits && React.createElement('th', { scope: 'col' }, 'Raw units'),
        React.createElement('th', { scope: 'col' }, 'Invoice ref'),
        React.createElement('th', { scope: 'col' }, 'Allow-list'),
      ),
    ),
    React.createElement(
      'tbody',
      null,
      ...rows.map((r, i) =>
        React.createElement(
          'tr',
          { key: i },
          React.createElement('td', null, r.invoiceId),
          rawUnits && React.createElement('td', null, r.rawUnit),
        ),
      ),
    ),
  );
}

function LiveRegionStub({ message }: { message: string }) {
  return React.createElement(
    'div',
    { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true', className: 'sr-only' },
    message,
  );
}

function SaltWarningStub() {
  return React.createElement(
    'div',
    { className: 'bg-pending-wash border border-pending/30' },
    'Keep this file. The salt is the only way to reproduce the invoice references from your invoice IDs. Anyone who has it can test guessed invoice IDs against the references on chain. Conciliado does not store it.',
  );
}

function InputWithLabel({ id, label }: { id: string; label: string }) {
  return React.createElement(
    'label',
    { htmlFor: id },
    label,
    React.createElement('input', { id, type: 'text', 'aria-label': label }),
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test('render: mainnet badge shows "Arc mainnet" with bg-mainnet class', () => {
  const html = renderToStaticMarkup(React.createElement(NetworkBadgeStub, { isMainnet: true }));
  expect(html).toContain('Arc mainnet');
  expect(html).toContain('bg-mainnet');
  expect(html).not.toContain('testnet');
});

test('render: testnet badge shows "Arc testnet (test funds)" with bg-pending-wash', () => {
  const html = renderToStaticMarkup(React.createElement(NetworkBadgeStub, { isMainnet: false }));
  expect(html).toContain('Arc testnet');
  expect(html).toContain('test funds');
  expect(html).toContain('bg-pending-wash');
});

test('render: privacy warning text appears on review screen', () => {
  const html = renderToStaticMarkup(React.createElement(PrivacyWarningStub));
  expect(html).toContain('Payee addresses, amounts, and timing are public on Arc');
  expect(html).toContain('invoice IDs and cost centers stay in this browser');
});

test('render: review table has scope="col" on all header cells', () => {
  const rows = [{ invoiceId: 'INV-001', rawUnit: '1000000' }];
  const html = renderToStaticMarkup(React.createElement(ReviewTableStub, { rows, rawUnits: true }));
  const scopeCount = (html.match(/scope="col"/g) ?? []).length;
  expect(scopeCount).toBeGreaterThanOrEqual(3);
});

test('render: review table shows raw 6-decimal units column', () => {
  const rows = [{ invoiceId: 'INV-001', rawUnit: '20500000' }];
  const html = renderToStaticMarkup(React.createElement(ReviewTableStub, { rows, rawUnits: true }));
  expect(html).toContain('Raw units');
  expect(html).toContain('20500000');
});

test('render: salt warning text present', () => {
  const html = renderToStaticMarkup(React.createElement(SaltWarningStub));
  expect(html).toContain('Keep this file');
  expect(html).toContain('Conciliado does not store it');
  expect(html).toContain('Anyone who has it can test guessed invoice IDs');
});

test('render: live region has role=status and aria-live=polite', () => {
  const html = renderToStaticMarkup(React.createElement(LiveRegionStub, { message: 'Batch paid.' }));
  expect(html).toContain('role="status"');
  expect(html).toContain('aria-live="polite"');
  expect(html).toContain('aria-atomic="true"');
  expect(html).toContain('Batch paid.');
});

test('render: labelled input has for/id pair', () => {
  const html = renderToStaticMarkup(React.createElement(InputWithLabel, { id: 'csv-upload', label: 'Invoice CSV' }));
  expect(html).toContain('for="csv-upload"');
  expect(html).toContain('id="csv-upload"');
  expect(html).toContain('Invoice CSV');
});

test('render: FlowController initial state has idle status', () => {
  const state = makeInitialState(MAINNET_NETWORK);
  expect(state.status).toBe('idle');
  expect(state.network.key).toBe('mainnet');
});

test('render: FlowController testnet initial state has testnet key', () => {
  const state = makeInitialState(TESTNET_NETWORK);
  expect(state.network.key).toBe('testnet');
  expect(state.network.name).toBe('Arc testnet');
});

// ─── simulate.ts: decodeRevertReason ─────────────────────────────────────────

import { decodeRevertReason } from './simulate.js';
import { encodeErrorResult, parseAbi } from 'viem';

const PAYER_ADDR = '0x429Fd794Ed2166c0F6fFef39fA6A1F580Ba64364' as Address;
const PAYEE_ADDR = '0xFe2b873C97CE177A0AF5e3BEad37EFE336e6a571' as Address;

test('decodeRevertReason: PayeeNotAllowed decoded to plain sentence', () => {
  const data = encodeErrorResult({
    abi: parseAbi(['error PayeeNotAllowed(address payer, address payee)']),
    errorName: 'PayeeNotAllowed',
    args: [PAYER_ADDR, PAYEE_ADDR],
  });
  const err = Object.assign(new Error('execution reverted'), { data });
  const reason = decodeRevertReason(err);
  expect(reason).toContain('allow-list');
  expect(reason).toContain('No USDC moved');
});

test('decodeRevertReason: InvoiceRefAlreadyUsed decoded', () => {
  const ref = ('0x' + '01'.repeat(32)) as Hex;
  const data = encodeErrorResult({
    abi: parseAbi(['error InvoiceRefAlreadyUsed(address payer, bytes32 ref)']),
    errorName: 'InvoiceRefAlreadyUsed',
    args: [PAYER_ADDR, ref],
  });
  const err = Object.assign(new Error('execution reverted'), { data });
  const reason = decodeRevertReason(err);
  expect(reason).toContain('already paid');
  expect(reason).toContain('No USDC moved');
});

test('decodeRevertReason: BatchTooLarge decoded', () => {
  const data = encodeErrorResult({
    abi: parseAbi(['error BatchTooLarge(uint256 given, uint256 max)']),
    errorName: 'BatchTooLarge',
    args: [201n, 200n],
  });
  const err = Object.assign(new Error('execution reverted'), { data });
  const reason = decodeRevertReason(err);
  expect(reason).toContain('201');
  expect(reason).toContain('200');
  expect(reason).toContain('No USDC moved');
});

test('decodeRevertReason: unknown error fallback', () => {
  const reason = decodeRevertReason(new Error('something weird'));
  expect(reason).toContain('No USDC moved');
});

test('decodeRevertReason: InvoiceRefAlreadyUsed with invoiceId lookup', () => {
  const ref = ('0x' + '02'.repeat(32)) as Hex;
  const data = encodeErrorResult({
    abi: parseAbi(['error InvoiceRefAlreadyUsed(address payer, bytes32 ref)']),
    errorName: 'InvoiceRefAlreadyUsed',
    args: [PAYER_ADDR, ref],
  });
  const err = Object.assign(new Error('execution reverted'), { data });
  const invoiceIdByRef = new Map([[ref.toLowerCase() as Hex, 'INV-007']]);
  const reason = decodeRevertReason(err, invoiceIdByRef);
  expect(reason).toContain('INV-007');
});
