/**
 * Unit tests for the pure aggregation behind /metrics. No network.
 */

import { expect, test } from 'bun:test';
import { encodeAbiParameters, encodeEventTopics, type Address, type Hex, type Log } from 'viem';
import { PAYOUT_BATCH_ABI } from '../ledger/index.js';
import {
  decodeContractLogs,
  divideHalfUp,
  summarize,
  type BatchSettlement,
} from './aggregate.js';

const CONTRACT = '0xC86e2241166785344E4d6692E4D2A3D4c8466d0e' as Address;
const PAYER_A = '0x429Fd794Ed2166c0F6fFef39fA6A1F580Ba64364' as Address;
const PAYER_B = '0x1111111111111111111111111111111111111111' as Address;
const PAYEE_1 = '0xFe2b873C97CE177A0AF5e3BEad37EFE336e6a571' as Address;
const PAYEE_2 = '0x5eb1f8E7b85938E2eB71a1a0A0c71c9155B79F07' as Address;
const TX_1 = ('0x' + 'a1'.repeat(32)) as Hex;
const TX_2 = ('0x' + 'b2'.repeat(32)) as Hex;
const ref = (n: number) => ('0x' + n.toString(16).padStart(64, '0')) as Hex;

function lineLog(batchId: bigint, lineIndex: bigint, payee: Address, amount: bigint, n: number, tx: Hex, block: bigint): Log {
  return {
    address: CONTRACT,
    blockNumber: block,
    transactionHash: tx,
    removed: false,
    topics: encodeEventTopics({
      abi: PAYOUT_BATCH_ABI,
      eventName: 'InvoicePaid',
      args: { batchId, payee, invoiceRef: ref(n) },
    }),
    data: encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [lineIndex, amount]),
  } as Log;
}

function batchLog(batchId: bigint, payer: Address, lineCount: bigint, total: bigint, tx: Hex, block: bigint): Log {
  return {
    address: CONTRACT,
    blockNumber: block,
    transactionHash: tx,
    removed: false,
    topics: encodeEventTopics({ abi: PAYOUT_BATCH_ABI, eventName: 'BatchPaid', args: { batchId, payer } }),
    data: encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [lineCount, total]),
  } as Log;
}

// PayeeAdded(address indexed payer, address indexed payee): a contract event that is not a metric
const PAYEE_ADDED_TOPIC0 = '0xdc5ead19b6024fc846be8ef64aa124f9d38b64826b5d39d63010d18b34942cdb' as Hex;
const payeeAddedLog = {
  address: CONTRACT,
  blockNumber: 5n,
  transactionHash: TX_1,
  removed: false,
  topics: [PAYEE_ADDED_TOPIC0, ('0x' + '00'.repeat(12) + PAYER_A.slice(2)) as Hex, ('0x' + '00'.repeat(12) + PAYEE_1.slice(2)) as Hex],
  data: '0x',
} as unknown as Log;

// Two batches in the order the chain lists them: batch 1 pays 2 lines, batch 2 pays 1 line
function twoBatchLogs(): Log[] {
  return [
    payeeAddedLog,
    lineLog(1n, 0n, PAYEE_1, 20_000n, 1, TX_1, 100n),
    lineLog(1n, 1n, PAYEE_2, 25_000n, 2, TX_1, 100n),
    batchLog(1n, PAYER_A, 2n, 45_000n, TX_1, 100n),
    lineLog(2n, 0n, PAYEE_1, 30_000n, 3, TX_2, 200n),
    batchLog(2n, PAYER_B, 1n, 30_000n, TX_2, 200n),
  ];
}

const settle = (fee: bigint, diff = 0n, warnings: string[] = []): BatchSettlement => ({
  feeNative18: fee,
  differenceNative18: diff,
  warnings,
});

test('decodeContractLogs keeps BatchPaid and InvoicePaid and skips other events', () => {
  const d = decodeContractLogs(twoBatchLogs());
  expect(d.batches.length).toBe(2);
  expect(d.lines.length).toBe(3);
  expect(d.batches[0]).toMatchObject({ batchId: 1n, lineCount: 2n, totalMicro: 45_000n, blockNumber: 100n });
  expect(d.lines[2]).toMatchObject({ batchId: 2n, amountMicro: 30_000n });
});

test('decodeContractLogs orders batches by block and ignores removed logs', () => {
  const logs = twoBatchLogs().reverse();
  const reorged = { ...batchLog(9n, PAYER_A, 1n, 1n, TX_2, 300n), removed: true } as Log;
  const d = decodeContractLogs([...logs, reorged]);
  expect(d.batches.map((b) => b.batchId)).toEqual([1n, 2n]);
});

test('summarize counts batches, lines, payers, payees and USDC paid', () => {
  const s = summarize(decodeContractLogs(twoBatchLogs()), new Map());
  expect(s.batches).toBe(2);
  expect(s.lines).toBe(3);
  expect(s.paidMicro).toBe(75_000n);
  expect(s.distinctPayers).toBe(2);
  // PAYEE_1 is paid in both batches: three lines, two distinct payees
  expect(s.distinctPayees).toBe(2);
  expect(s.inconsistencies).toEqual([]);
});

test('summarize compares addresses case-insensitively', () => {
  const lower = PAYEE_1.toLowerCase() as Address;
  const logs = [
    lineLog(1n, 0n, PAYEE_1, 1n, 1, TX_1, 100n),
    lineLog(1n, 1n, lower, 1n, 2, TX_1, 100n),
    batchLog(1n, PAYER_A, 2n, 2n, TX_1, 100n),
  ];
  expect(summarize(decodeContractLogs(logs), new Map()).distinctPayees).toBe(1);
});

test('fee per line is the total fee of all batches over all lines, half-up', () => {
  const settlements = new Map([
    [TX_1.toLowerCase(), settle(11_013_954_000_000_000n)],
    [TX_2.toLowerCase(), settle(8_637_975_000_000_000n)],
  ]);
  const s = summarize(decodeContractLogs(twoBatchLogs()), settlements);
  expect(s.feeNative18).toBe(19_651_929_000_000_000n);
  // 19651929000000000 / 3 = 6550643000000000 exactly
  expect(s.feePerLineNative18).toBe(6_550_643_000_000_000n);
  expect(s.rows[0].feePerLineNative18).toBe(5_506_977_000_000_000n);
  expect(s.rows[1].feePerLineNative18).toBe(8_637_975_000_000_000n);
});

test('fee figures stay null when a batch has no settlement', () => {
  const settlements = new Map([[TX_1.toLowerCase(), settle(10n)]]);
  const s = summarize(decodeContractLogs(twoBatchLogs()), settlements);
  expect(s.feeNative18).toBeNull();
  expect(s.feePerLineNative18).toBeNull();
  expect(s.rows[0].feeNative18).toBe(10n);
  expect(s.rows[1].feeNative18).toBeNull();
  expect(s.rows[1].differenceNative18).toBeNull();
});

test('a tie-out difference and warnings are carried to the batch row, not hidden', () => {
  const settlements = new Map([
    [TX_1.toLowerCase(), settle(1n, 0n)],
    [TX_2.toLowerCase(), settle(1n, 12_000_000_000_000n, ['payerTxCountInBlock=2'])],
  ]);
  const s = summarize(decodeContractLogs(twoBatchLogs()), settlements);
  expect(s.rows[0].differenceNative18).toBe(0n);
  expect(s.rows[1].differenceNative18).toBe(12_000_000_000_000n);
  expect(s.rows[1].warnings).toEqual(['payerTxCountInBlock=2']);
});

test('an empty contract gives zeros and no fee per line', () => {
  const s = summarize(decodeContractLogs([]), new Map());
  expect(s).toMatchObject({ batches: 0, lines: 0, paidMicro: 0n, distinctPayers: 0, distinctPayees: 0 });
  expect(s.feeNative18).toBeNull();
  expect(s.feePerLineNative18).toBeNull();
});

test('events that disagree are reported as inconsistencies', () => {
  const logs = [
    lineLog(1n, 0n, PAYEE_1, 20_000n, 1, TX_1, 100n),
    batchLog(1n, PAYER_A, 2n, 99n, TX_1, 100n),
    lineLog(7n, 0n, PAYEE_2, 1n, 2, TX_2, 200n),
  ];
  const s = summarize(decodeContractLogs(logs), new Map());
  expect(s.inconsistencies.length).toBe(3);
  expect(s.inconsistencies.join('\n')).toContain('BatchPaid says 2 lines, found 1');
  expect(s.inconsistencies.join('\n')).toContain('batch 7 have no BatchPaid');
});

test('divideHalfUp rounds half up and rejects bad input', () => {
  expect(divideHalfUp(5n, 2n)).toBe(3n);
  expect(divideHalfUp(4n, 3n)).toBe(1n);
  expect(divideHalfUp(0n, 7n)).toBe(0n);
  expect(() => divideHalfUp(1n, 0n)).toThrow(RangeError);
  expect(() => divideHalfUp(-1n, 2n)).toThrow(RangeError);
});
