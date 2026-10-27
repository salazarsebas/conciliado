/**
 * Unit tests for src/run/calls.ts
 * Tests the ABI builders by decoding the output with viem decodeFunctionData.
 */

import { expect, test, describe } from 'bun:test';
import { decodeFunctionData } from 'viem';
import type { Address, Hex } from 'viem';
import {
  buildAddPayeesCall,
  buildAggregate3Calls,
  buildFeeSettings,
  FEE_FLOOR_GWEI,
  PAYOUT_BATCH_ABI,
  ERC20_ABI,
} from './calls.js';

const USDC = '0x3600000000000000000000000000000000000000' as Address;
const PAYOUT_BATCH = '0xC86e2241166785344E4d6692E4D2A3D4c8466d0e' as Address;
const PAYEE1 = '0xFe2b873C97CE177A0AF5e3BEad37EFE336e6a571' as Address;
const PAYEE2 = '0x5eb1f8E7b85938E2eB71a1a0A0c71c9155B79F07' as Address;
const REF1 = ('0x' + '01'.repeat(32)) as Hex;
const REF2 = ('0x' + '02'.repeat(32)) as Hex;

// ─── addPayees ────────────────────────────────────────────────────────────────

describe('buildAddPayeesCall', () => {
  test('encodes addPayees correctly', () => {
    const data = buildAddPayeesCall([PAYEE1, PAYEE2]);
    const decoded = decodeFunctionData({ abi: PAYOUT_BATCH_ABI, data });
    expect(decoded.functionName).toBe('addPayees');
    expect((decoded.args as [Address[]])[0]).toEqual([PAYEE1, PAYEE2]);
  });

  test('single payee', () => {
    const data = buildAddPayeesCall([PAYEE1]);
    const decoded = decodeFunctionData({ abi: PAYOUT_BATCH_ABI, data });
    expect((decoded.args as [Address[]])[0]).toHaveLength(1);
  });
});

// ─── aggregate3 ──────────────────────────────────────────────────────────────

describe('buildAggregate3Calls', () => {
  const LINES = [
    { payee: PAYEE1, amountMicro: 20_000_000n, invoiceRef: REF1 },
    { payee: PAYEE2, amountMicro: 30_000_000n, invoiceRef: REF2 },
  ];
  const TOTAL = LINES.reduce((s, l) => s + l.amountMicro, 0n);

  test('returns exactly 2 calls', () => {
    const calls = buildAggregate3Calls({ usdc: USDC, payoutBatch: PAYOUT_BATCH, lines: LINES, total: TOTAL });
    expect(calls).toHaveLength(2);
  });

  test('first call is USDC approve with allowFailure=false', () => {
    const calls = buildAggregate3Calls({ usdc: USDC, payoutBatch: PAYOUT_BATCH, lines: LINES, total: TOTAL });
    expect(calls[0].target).toBe(USDC);
    expect(calls[0].allowFailure).toBe(false);
    const decoded = decodeFunctionData({ abi: ERC20_ABI, data: calls[0].callData });
    expect(decoded.functionName).toBe('approve');
    const [spender, amount] = decoded.args as [Address, bigint];
    expect(spender.toLowerCase()).toBe(PAYOUT_BATCH.toLowerCase());
    expect(amount).toBe(TOTAL);
  });

  test('second call is payBatch with allowFailure=false', () => {
    const calls = buildAggregate3Calls({ usdc: USDC, payoutBatch: PAYOUT_BATCH, lines: LINES, total: TOTAL });
    expect(calls[1].target).toBe(PAYOUT_BATCH);
    expect(calls[1].allowFailure).toBe(false);
    const decoded = decodeFunctionData({ abi: PAYOUT_BATCH_ABI, data: calls[1].callData });
    expect(decoded.functionName).toBe('payBatch');
    const [encodedLines, expectedTotal] = decoded.args as [Array<{ payee: Address; amount: bigint; invoiceRef: Hex }>, bigint];
    expect(expectedTotal).toBe(TOTAL);
    expect(encodedLines).toHaveLength(2);
    expect(encodedLines[0].payee.toLowerCase()).toBe(PAYEE1.toLowerCase());
    expect(encodedLines[0].amount).toBe(20_000_000n);
    expect(encodedLines[0].invoiceRef.toLowerCase()).toBe(REF1.toLowerCase());
    expect(encodedLines[1].payee.toLowerCase()).toBe(PAYEE2.toLowerCase());
    expect(encodedLines[1].amount).toBe(30_000_000n);
  });

  test('approve amount equals payBatch expectedTotal equals total', () => {
    const calls = buildAggregate3Calls({ usdc: USDC, payoutBatch: PAYOUT_BATCH, lines: LINES, total: TOTAL });
    const approveDec = decodeFunctionData({ abi: ERC20_ABI, data: calls[0].callData });
    const payBatchDec = decodeFunctionData({ abi: PAYOUT_BATCH_ABI, data: calls[1].callData });
    const approveAmount = (approveDec.args as [Address, bigint])[1];
    const payBatchTotal = (payBatchDec.args as [unknown, bigint])[1];
    expect(approveAmount).toBe(TOTAL);
    expect(payBatchTotal).toBe(TOTAL);
  });

  test('CSV order preserved in payBatch lines', () => {
    const lines = [
      { payee: PAYEE2, amountMicro: 10n, invoiceRef: REF2 },
      { payee: PAYEE1, amountMicro: 5n, invoiceRef: REF1 },
    ];
    const total = 15n;
    const calls = buildAggregate3Calls({ usdc: USDC, payoutBatch: PAYOUT_BATCH, lines, total });
    const decoded = decodeFunctionData({ abi: PAYOUT_BATCH_ABI, data: calls[1].callData });
    const encodedLines = (decoded.args as unknown as [Array<{ payee: Address }>])[0];
    expect(encodedLines[0].payee.toLowerCase()).toBe(PAYEE2.toLowerCase());
    expect(encodedLines[1].payee.toLowerCase()).toBe(PAYEE1.toLowerCase());
  });

  test('Multicall3From target addresses are sender-preserving (USDC and PayoutBatch)', () => {
    const calls = buildAggregate3Calls({ usdc: USDC, payoutBatch: PAYOUT_BATCH, lines: LINES, total: TOTAL });
    // The Multicall3From contract forwards msg.sender to these subcall targets
    expect(calls[0].target.toLowerCase()).toBe(USDC.toLowerCase());
    expect(calls[1].target.toLowerCase()).toBe(PAYOUT_BATCH.toLowerCase());
  });
});

// ─── Fee floor ────────────────────────────────────────────────────────────────

describe('buildFeeSettings', () => {
  const GWEI = 1_000_000_000n;

  test('estimate above floor: uses estimate', () => {
    const s = buildFeeSettings(30n * GWEI);
    expect(s.maxFeePerGas).toBe(30n * GWEI);
  });

  test('estimate at floor: uses floor', () => {
    const s = buildFeeSettings(FEE_FLOOR_GWEI * GWEI);
    expect(s.maxFeePerGas).toBe(FEE_FLOOR_GWEI * GWEI);
  });

  test('estimate below floor: uses floor (never below 20 gwei)', () => {
    const s = buildFeeSettings(1n * GWEI);
    expect(s.maxFeePerGas).toBe(FEE_FLOOR_GWEI * GWEI);
  });

  test('estimate zero: still uses 20 gwei floor', () => {
    const s = buildFeeSettings(0n);
    expect(s.maxFeePerGas).toBe(FEE_FLOOR_GWEI * GWEI);
  });

  test('maxPriorityFeePerGas is always 1 gwei', () => {
    const s = buildFeeSettings(100n * GWEI);
    expect(s.maxPriorityFeePerGas).toBe(1n * GWEI);
  });
});
