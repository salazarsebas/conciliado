import { expect, test } from 'bun:test';
import { announceFlow } from './announce.js';
import { makeInitialState, type FlowState } from './flow.js';
import { MAINNET_NETWORK } from './networks.js';

const base = (): FlowState => makeInitialState(MAINNET_NETWORK);
const with_ = (patch: Partial<FlowState>): FlowState => ({ ...base(), ...patch });

test('announce flow: idle says nothing', () => {
  expect(announceFlow(base())).toEqual({ status: '', alert: '' });
});

test('announce flow: each progress step has polite text', () => {
  for (const status of ['checking', 'allowPending', 'simulating', 'simOk', 'saltGate', 'paying'] as const) {
    const a = announceFlow(with_({ status }));
    expect(a.status.length).toBeGreaterThan(0);
    expect(a.alert).toBe('');
  }
});

test('announce flow: failures go to the assertive alert', () => {
  expect(announceFlow(with_({ status: 'reverted' })).alert).toBe('Transaction reverted. Batch was not paid.');
  expect(announceFlow(with_({ status: 'rejected' })).alert).toBe('Transaction rejected. No USDC moved.');
  expect(announceFlow(with_({ status: 'contractError', contractError: 'PayoutBatch is not deployed.' })).alert).toBe('PayoutBatch is not deployed.');
  expect(announceFlow(with_({ status: 'simFail', simResult: { ok: false, reason: 'Insufficient USDC.' } })).alert).toBe('Simulation failed. Insufficient USDC.');
});

test('announce flow: validation errors are counted', () => {
  const parseResult = { rows: [], errors: [{ rowNum: 1, reason: 'bad' }, { rowNum: 2, reason: 'bad' }], tooManyRows: false };
  expect(announceFlow(with_({ status: 'parsed', parseResult })).alert).toBe('2 validation errors in the CSV.');
  expect(announceFlow(with_({ status: 'parsed', parseResult: { ...parseResult, tooManyRows: true } })).alert).toBe('File rejected: too many rows.');
});

test('announce flow: checked reports payees that need the allow-list', () => {
  const a = announceFlow(with_({ status: 'checked', unallowedPayees: ['0x1111111111111111111111111111111111111111'] }));
  expect(a.status).toBe('1 payee needs to be added to your allow-list.');
});
