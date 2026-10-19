/**
 * Tests for rebuildLedger (unit — fake client only, no network calls).
 * Fixture tie-out lives in fixture.test.ts.
 */

import { expect, test } from 'bun:test';
import { type Address, type Hex, encodeAbiParameters, keccak256 } from 'viem';
import { makeInvoiceRef } from './ref.js';
import { LedgerInconsistencyError, rebuildLedger, type LedgerClient } from './rebuild.js';

// ─── Helpers ─────────────────────────────────────────────────────────────

const CONTRACT = '0x209dd04647d4c103081095176e5f58c5d91e1fb6' as Address;
const PAYER = '0x1111111111111111111111111111111111111111' as Address;
const PAYEE1 = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as Address;
const PAYEE2 = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' as Address;
const USDC = '0x3600000000000000000000000000000000000000' as Address;
const TX_HASH = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as Hex;

const SALT1 = ('0x' + '11'.repeat(32)) as Hex;
const SALT2 = ('0x' + '22'.repeat(32)) as Hex;

const REF1 = makeInvoiceRef('INV-001', SALT1);
const REF2 = makeInvoiceRef('INV-002', SALT2);

// ─── ABI encoding helpers ─────────────────────────────────────────────────

/** Encode InvoicePaid event log. */
function invoicePaidLog(batchId: bigint, lineIndex: bigint, payee: Address, amount: bigint, invoiceRef: Hex) {
  // event InvoicePaid(uint256 indexed batchId, uint256 lineIndex, address indexed payee, uint256 amount, bytes32 indexed invoiceRef)
  const eventSig = keccak256(Buffer.from('InvoicePaid(uint256,uint256,address,uint256,bytes32)') as unknown as Uint8Array);
  const batchIdTopic = ('0x' + batchId.toString(16).padStart(64, '0')) as Hex;
  const payeeTopic = ('0x' + payee.toLowerCase().slice(2).padStart(64, '0')) as Hex;
  const invoiceRefTopic = invoiceRef;
  const data = encodeAbiParameters(
    [{ type: 'uint256' }, { type: 'uint256' }],
    [lineIndex, amount],
  );
  return {
    address: CONTRACT,
    blockNumber: 1000n,
    transactionHash: TX_HASH,
    topics: [eventSig, batchIdTopic, payeeTopic, invoiceRefTopic] as [Hex, Hex, Hex, Hex],
    data,
    logIndex: lineIndex,
  };
}

/** Encode BatchPaid event log. */
function batchPaidLog(batchId: bigint, payer: Address, lineCount: bigint, total: bigint) {
  // event BatchPaid(uint256 indexed batchId, address indexed payer, uint256 lineCount, uint256 total)
  const eventSig = keccak256(Buffer.from('BatchPaid(uint256,address,uint256,uint256)') as unknown as Uint8Array);
  const batchIdTopic = ('0x' + batchId.toString(16).padStart(64, '0')) as Hex;
  const payerTopic = ('0x' + payer.toLowerCase().slice(2).padStart(64, '0')) as Hex;
  const data = encodeAbiParameters(
    [{ type: 'uint256' }, { type: 'uint256' }],
    [lineCount, total],
  );
  return {
    address: CONTRACT,
    blockNumber: 1000n,
    transactionHash: TX_HASH,
    topics: [eventSig, batchIdTopic, payerTopic] as [Hex, Hex, Hex],
    data,
    logIndex: 2n,
  };
}

/** Build a fake receipt. */
function fakeReceipt(overrides?: Partial<{
  status: 'success' | 'reverted';
  blockNumber: bigint;
  gasUsed: bigint;
  effectiveGasPrice: bigint;
}>) {
  return {
    status: overrides?.status ?? 'success',
    blockNumber: overrides?.blockNumber ?? 1000n,
    transactionHash: TX_HASH,
    gasUsed: overrides?.gasUsed ?? 50_000n,
    effectiveGasPrice: overrides?.effectiveGasPrice ?? 1_000_000n, // 0.001 gwei
  };
}

/** Build a fake block. */
function fakeBlock(txCount = 1) {
  return {
    number: 1000n,
    transactions: Array.from({ length: txCount }, (_, i) => ({
      hash: i === 0 ? TX_HASH : ('0x' + i.toString(16).padStart(64, '0')),
      from: i === 0 ? PAYER : '0x0000000000000000000000000000000000000002',
    })),
  };
}

/** Build a minimal fake LedgerClient. */
function makeClient(overrides: {
  logs?: unknown[];
  receipt?: unknown;
  block?: unknown;
  usdcBefore?: bigint;
  usdcAfter?: bigint;
  nativeBefore?: bigint;
  nativeAfter?: bigint;
  getLogs?: (args: { address: Address; fromBlock: bigint; toBlock: bigint }) => Promise<unknown[]>;
}): LedgerClient {
  return {
    getLogs: overrides.getLogs
      ? (overrides.getLogs as LedgerClient['getLogs'])
      : (() => Promise.resolve(overrides.logs ?? [])) as unknown as LedgerClient['getLogs'],
    getTransactionReceipt: () => Promise.resolve((overrides.receipt ?? fakeReceipt()) as unknown as ReturnType<LedgerClient['getTransactionReceipt']>),
    getBlock: () => Promise.resolve((overrides.block ?? fakeBlock()) as unknown as ReturnType<LedgerClient['getBlock']>),
    getBlockNumber: () => Promise.resolve(1100n),
    getBalance: ({ blockNumber }: { address: Address; blockNumber: bigint }) => {
      if (blockNumber === 999n) return Promise.resolve(overrides.nativeBefore ?? 100_000_000_000_000_000n);
      return Promise.resolve(overrides.nativeAfter ?? 99_950_000_000_000_000n);
    },
    readContract: ({ blockNumber }: { blockNumber: bigint }) => {
      if (blockNumber === 999n) return Promise.resolve(overrides.usdcBefore ?? 10_000_000n);
      return Promise.resolve(overrides.usdcAfter ?? 9_944_300n);
    },
  } as unknown as LedgerClient;
}

// ─── Happy path (final, success) ─────────────────────────────────────────

test('rebuildLedger: final success — payoutRows, feeRow, totals, join', async () => {
  const AMOUNT1 = 1_250_000n;
  const AMOUNT2 = 750_000n;
  const TOTAL = AMOUNT1 + AMOUNT2;
  const GAS = 50_000n;
  const GAS_PRICE = 1_000_000_000_000n; // 1 micro per gas unit
  const FEE_NATIVE = GAS * GAS_PRICE; // 50_000 * 10^12 native
  const FEE_MICRO = 50_000n; // = nativeToMicro(FEE_NATIVE)

  const logs = [
    invoicePaidLog(1n, 0n, PAYEE1, AMOUNT1, REF1),
    invoicePaidLog(1n, 1n, PAYEE2, AMOUNT2, REF2),
    batchPaidLog(1n, PAYER, 2n, TOTAL),
  ];

  const USDC_BEFORE = 10_000_000n;
  const USDC_AFTER = USDC_BEFORE - TOTAL - FEE_MICRO;
  const NAT_BEFORE = 10_000_000n * 1_000_000_000_000n;
  const NAT_AFTER = NAT_BEFORE - FEE_NATIVE - TOTAL * 1_000_000_000_000n;

  const client = makeClient({
    logs,
    receipt: fakeReceipt({ gasUsed: GAS, effectiveGasPrice: GAS_PRICE }),
    usdcBefore: USDC_BEFORE,
    usdcAfter: USDC_AFTER,
    nativeBefore: NAT_BEFORE,
    nativeAfter: NAT_AFTER,
  });

  const result = await rebuildLedger({
    client,
    contract: CONTRACT,
    payer: PAYER,
    usdc: USDC,
    target: { txHash: TX_HASH },
    invoiceList: [
      { invoiceId: 'INV-001', salt: SALT1 },
      { invoiceId: 'INV-002', salt: SALT2 },
    ],
  });

  expect(result.status).toBe('final');
  expect(result.receiptStatus).toBe('success');
  expect(result.payoutRows).toHaveLength(2);
  expect(result.payoutRows[0].amountMicro).toBe(AMOUNT1);
  expect(result.payoutRows[1].amountMicro).toBe(AMOUNT2);
  expect(result.feeRow?.feeMicro).toBe(FEE_MICRO);
  expect(result.feeRow?.feeNative18).toBe(FEE_NATIVE);
  expect(result.ledgerTotalMicro).toBe(TOTAL + FEE_MICRO);
  expect(result.batchId).toBe(1n);
  expect(result.matchedCount).toBe(2);
  expect(result.unmatchedOnChainCount).toBe(0);
  expect(result.unmatchedLocalCount).toBe(0);
  expect(result.differenceMicro).toBe(0n);
  expect(result.differenceDisplay).toBe('$0.00');
});

// ─── Pending: receipt not found ───────────────────────────────────────────

test('rebuildLedger: pending when receipt not found', async () => {
  const client: LedgerClient = {
    getLogs: () => Promise.resolve([] as unknown as ReturnType<LedgerClient['getLogs']>),
    getTransactionReceipt: () => Promise.reject(new Error('TransactionReceiptNotFoundError: could not be found')),
    getBlock: () => Promise.resolve(fakeBlock() as unknown as ReturnType<LedgerClient['getBlock']>),
    getBlockNumber: () => Promise.resolve(1000n),
    getBalance: () => Promise.resolve(0n),
    readContract: () => Promise.resolve(0n as unknown as ReturnType<LedgerClient['readContract']>),
  } as unknown as LedgerClient;

  const result = await rebuildLedger({
    client,
    contract: CONTRACT,
    payer: PAYER,
    target: { txHash: TX_HASH },
    invoiceList: [],
  });

  expect(result.status).toBe('pending');
  expect(result.payoutRows).toHaveLength(0);
  expect(result.feeRow).toBeNull();
  expect(result.ledgerTotalMicro).toBeNull();
  expect(result.usdcDeltaMicro).toBeNull();
});

// ─── Pending: batchId mode, no logs yet ──────────────────────────────────

test('rebuildLedger: pending in batchId mode when no logs found', async () => {
  const client = makeClient({ logs: [] });
  const result = await rebuildLedger({
    client,
    contract: CONTRACT,
    payer: PAYER,
    target: { batchId: 99n, fromBlock: 1000n, toBlock: 1100n },
    invoiceList: [],
  });
  expect(result.status).toBe('pending');
  expect(result.batchId).toBe(99n);
});

// ─── Reverted receipt ─────────────────────────────────────────────────────

test('rebuildLedger: reverted receipt books only fee row', async () => {
  const GAS = 21_000n;
  const GAS_PRICE = 1_000_000_000_000n;
  const logs = [
    invoicePaidLog(1n, 0n, PAYEE1, 1_000_000n, REF1),
    batchPaidLog(1n, PAYER, 1n, 1_000_000n),
  ];

  const client = makeClient({
    logs,
    receipt: fakeReceipt({ status: 'reverted', gasUsed: GAS, effectiveGasPrice: GAS_PRICE }),
  });

  const result = await rebuildLedger({
    client,
    contract: CONTRACT,
    payer: PAYER,
    target: { txHash: TX_HASH },
    invoiceList: [{ invoiceId: 'INV-001', salt: SALT1 }],
  });

  expect(result.status).toBe('final');
  expect(result.receiptStatus).toBe('reverted');
  expect(result.payoutRows).toHaveLength(0);
  expect(result.feeRow).not.toBeNull();
  expect(result.feeRow?.gasUsed).toBe(GAS);
  // Totals reflect fee only
  expect(result.ledgerTotalMicro).toBe(21_000n); // fee only
});

// ─── Unmatched on-chain and local ─────────────────────────────────────────

test('rebuildLedger: unmatchedOnChain when on-chain ref has no local invoice', async () => {
  const logs = [
    invoicePaidLog(1n, 0n, PAYEE1, 1_000_000n, REF1),
    batchPaidLog(1n, PAYER, 1n, 1_000_000n),
  ];
  const client = makeClient({ logs });

  const result = await rebuildLedger({
    client,
    contract: CONTRACT,
    payer: PAYER,
    target: { txHash: TX_HASH },
    invoiceList: [], // no local invoices
  });

  expect(result.unmatchedOnChainCount).toBe(1);
  expect(result.unmatchedOnChain[0].toLowerCase()).toBe(REF1.toLowerCase());
  expect(result.matchedCount).toBe(0);
  expect(result.unmatchedLocalCount).toBe(0);
});

test('rebuildLedger: unmatchedLocal when local invoice not on chain', async () => {
  const logs = [
    invoicePaidLog(1n, 0n, PAYEE1, 1_000_000n, REF1),
    batchPaidLog(1n, PAYER, 1n, 1_000_000n),
  ];
  const client = makeClient({ logs });

  const result = await rebuildLedger({
    client,
    contract: CONTRACT,
    payer: PAYER,
    target: { txHash: TX_HASH },
    invoiceList: [
      { invoiceId: 'INV-001', salt: SALT1 }, // matches REF1
      { invoiceId: 'INV-999', salt: SALT2 }, // no match
    ],
  });

  expect(result.matchedCount).toBe(1);
  expect(result.unmatchedLocalCount).toBe(1);
  expect(result.unmatchedLocal[0].invoiceId).toBe('INV-999');
  expect(result.unmatchedOnChainCount).toBe(0);
});

// ─── BatchPaid total inconsistency ───────────────────────────────────────

test('rebuildLedger: throws LedgerInconsistencyError on lineCount mismatch', async () => {
  // BatchPaid says 3 lines but only 1 InvoicePaid log
  const logs = [
    invoicePaidLog(1n, 0n, PAYEE1, 1_000_000n, REF1),
    batchPaidLog(1n, PAYER, 3n, 1_000_000n), // wrong lineCount
  ];
  const client = makeClient({ logs });

  let threw = false;
  try {
    await rebuildLedger({ client, contract: CONTRACT, payer: PAYER, target: { txHash: TX_HASH }, invoiceList: [] });
  } catch (e) {
    expect(e).toBeInstanceOf(LedgerInconsistencyError);
    threw = true;
  }
  expect(threw).toBe(true);
});

test('rebuildLedger: throws LedgerInconsistencyError on total mismatch', async () => {
  // BatchPaid.total doesn't match sum of InvoicePaid amounts
  const logs = [
    invoicePaidLog(1n, 0n, PAYEE1, 1_000_000n, REF1),
    batchPaidLog(1n, PAYER, 1n, 9_999_999n), // wrong total
  ];
  const client = makeClient({ logs });

  let threw = false;
  try {
    await rebuildLedger({ client, contract: CONTRACT, payer: PAYER, target: { txHash: TX_HASH }, invoiceList: [] });
  } catch (e) {
    expect(e).toBeInstanceOf(LedgerInconsistencyError);
    threw = true;
  }
  expect(threw).toBe(true);
});

// ─── Paging ──────────────────────────────────────────────────────────────

test('rebuildLedger paging: exact [from, to] sequence and no gaps/overlaps', async () => {
  // Range 1000→1024 with page size 10 → pages [1000,1009], [1010,1019], [1020,1024]
  const pageSize = 10n;
  const FROM = 1000n;
  const TO = 1024n;
  const calls: Array<{ from: bigint; to: bigint }> = [];

  // Provide a receipt and a BatchPaid so the function doesn't throw on empty logs.
  // We set it up in batchId mode so we control fromBlock/toBlock.
  // The function fetches all logs from fromBlock to toBlock with paging.
  const logFromBlock1010 = {
    address: CONTRACT,
    blockNumber: 1010n,
    transactionHash: TX_HASH,
    topics: [
      keccak256(Buffer.from('BatchPaid(uint256,address,uint256,uint256)') as unknown as Uint8Array),
      ('0x' + (1n).toString(16).padStart(64, '0')) as Hex,
      ('0x' + PAYER.slice(2).toLowerCase().padStart(64, '0')) as Hex,
    ] as [Hex, Hex, Hex],
    data: encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [0n, 0n]),
    logIndex: 0n,
  };

  const getLogs = (args: { address: Address; fromBlock: bigint; toBlock: bigint }) => {
    const span = args.toBlock - args.fromBlock + 1n;
    if (span > pageSize) {
      return Promise.reject(new Error(`getLogs called with span ${span} > pageSize ${pageSize}`));
    }
    calls.push({ from: args.fromBlock, to: args.toBlock });
    // Return the BatchPaid log in its page
    if (args.fromBlock <= 1010n && args.toBlock >= 1010n) {
      return Promise.resolve([logFromBlock1010]);
    }
    return Promise.resolve([]);
  };

  const client = makeClient({ getLogs: getLogs });

  await rebuildLedger({
    client,
    contract: CONTRACT,
    payer: PAYER,
    target: { batchId: 1n, fromBlock: FROM, toBlock: TO },
    invoiceList: [],
    blockRangePerPage: pageSize,
  });

  expect(calls).toHaveLength(3);
  expect(calls[0]).toEqual({ from: 1000n, to: 1009n });
  expect(calls[1]).toEqual({ from: 1010n, to: 1019n });
  expect(calls[2]).toEqual({ from: 1020n, to: 1024n });
});

test('rebuildLedger paging: all logs returned when split across pages', async () => {
  // REF1 in page 1, REF2 in page 2
  const log1 = invoicePaidLog(1n, 0n, PAYEE1, 500_000n, REF1);
  const log2 = invoicePaidLog(1n, 1n, PAYEE2, 500_000n, REF2);
  const bpLog = batchPaidLog(1n, PAYER, 2n, 1_000_000n);

  log1.blockNumber = 1000n;
  log2.blockNumber = 1010n;
  bpLog.blockNumber = 1010n;

  const getLogs = (args: { address: Address; fromBlock: bigint; toBlock: bigint }) => {
    const result = [];
    if (args.fromBlock <= 1000n && args.toBlock >= 1000n) result.push(log1);
    if (args.fromBlock <= 1010n && args.toBlock >= 1010n) {
      result.push(log2);
      result.push(bpLog);
    }
    return Promise.resolve(result);
  };

  const client = makeClient({ getLogs: getLogs });

  const result = await rebuildLedger({
    client,
    contract: CONTRACT,
    payer: PAYER,
    target: { batchId: 1n, fromBlock: 1000n, toBlock: 1020n },
    invoiceList: [],
    blockRangePerPage: 5n,
  });

  // Both logs returned and decoded
  expect(result.payoutRows).toHaveLength(2);
  expect(result.payoutRows[0].invoiceRef.toLowerCase()).toBe(REF1.toLowerCase());
  expect(result.payoutRows[1].invoiceRef.toLowerCase()).toBe(REF2.toLowerCase());
});

// ─── Mismatch cases ───────────────────────────────────────────────────────

const AMOUNT1 = 1_000_000n; // 1.000000 USDC
const WRONG_PAYEE: Address = '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
const WRONG_AMOUNT = 999_000n;

function makeSimpleClient() {
  const logs = [
    invoicePaidLog(1n, 0n, PAYEE1, AMOUNT1, REF1),
    batchPaidLog(1n, PAYER, 1n, AMOUNT1),
  ];
  return makeClient({ logs });
}

test('rebuildLedger mismatch: payee differs, amount equal => mismatch', async () => {
  const client = makeSimpleClient();
  const result = await rebuildLedger({
    client,
    contract: CONTRACT,
    payer: PAYER,
    target: { txHash: TX_HASH },
    invoiceList: [{ invoiceId: 'INV-001', invoiceRef: REF1, payee: WRONG_PAYEE, amountMicro: AMOUNT1 }],
  });
  expect(result.matchedCount).toBe(0);
  expect(result.mismatchedCount).toBe(1);
  expect(result.unmatchedOnChainCount).toBe(0);
  expect(result.unmatchedLocalCount).toBe(0);
  expect(result.mismatched[0].fields).toEqual(['payee']);
  expect(result.mismatched[0].expected.payee?.toLowerCase()).toBe(WRONG_PAYEE.toLowerCase());
  expect(result.mismatched[0].actual.payee.toLowerCase()).toBe(PAYEE1.toLowerCase());
});

test('rebuildLedger mismatch: amount differs, payee equal => mismatch', async () => {
  const client = makeSimpleClient();
  const result = await rebuildLedger({
    client,
    contract: CONTRACT,
    payer: PAYER,
    target: { txHash: TX_HASH },
    invoiceList: [{ invoiceId: 'INV-001', invoiceRef: REF1, payee: PAYEE1, amountMicro: WRONG_AMOUNT }],
  });
  expect(result.matchedCount).toBe(0);
  expect(result.mismatchedCount).toBe(1);
  expect(result.unmatchedOnChainCount).toBe(0);
  expect(result.unmatchedLocalCount).toBe(0);
  expect(result.mismatched[0].fields).toEqual(['amount']);
  expect(result.mismatched[0].expected.amountMicro).toBe(WRONG_AMOUNT);
  expect(result.mismatched[0].actual.amountMicro).toBe(AMOUNT1);
});

test('rebuildLedger mismatch: both payee and amount differ => both fields reported', async () => {
  const client = makeSimpleClient();
  const result = await rebuildLedger({
    client,
    contract: CONTRACT,
    payer: PAYER,
    target: { txHash: TX_HASH },
    invoiceList: [{ invoiceId: 'INV-001', invoiceRef: REF1, payee: WRONG_PAYEE, amountMicro: WRONG_AMOUNT }],
  });
  expect(result.matchedCount).toBe(0);
  expect(result.mismatchedCount).toBe(1);
  expect(result.unmatchedOnChainCount).toBe(0);
  expect(result.unmatchedLocalCount).toBe(0);
  expect(result.mismatched[0].fields).toContain('payee');
  expect(result.mismatched[0].fields).toContain('amount');
  expect(result.mismatched[0].fields).toHaveLength(2);
});

test('rebuildLedger mismatch: payee differs only by letter case => match (not mismatch)', async () => {
  const client = makeSimpleClient();
  // PAYEE1 in lowercase vs. the mixed-case version emitted on-chain
  const sameLowerPayee = PAYEE1.toLowerCase() as Address;
  const result = await rebuildLedger({
    client,
    contract: CONTRACT,
    payer: PAYER,
    target: { txHash: TX_HASH },
    invoiceList: [{ invoiceId: 'INV-001', invoiceRef: REF1, payee: sameLowerPayee, amountMicro: AMOUNT1 }],
  });
  expect(result.matchedCount).toBe(1);
  expect(result.mismatchedCount).toBe(0);
  expect(result.unmatchedOnChainCount).toBe(0);
  expect(result.unmatchedLocalCount).toBe(0);
});

test('rebuildLedger mismatch: matching payee and amount => match', async () => {
  const client = makeSimpleClient();
  const result = await rebuildLedger({
    client,
    contract: CONTRACT,
    payer: PAYER,
    target: { txHash: TX_HASH },
    invoiceList: [{ invoiceId: 'INV-001', invoiceRef: REF1, payee: PAYEE1, amountMicro: AMOUNT1 }],
  });
  expect(result.matchedCount).toBe(1);
  expect(result.mismatchedCount).toBe(0);
  expect(result.unmatchedOnChainCount).toBe(0);
  expect(result.unmatchedLocalCount).toBe(0);
});

test('rebuildLedger mismatch: invoice without payee or amount (ref only) => still matched', async () => {
  const client = makeSimpleClient();
  const result = await rebuildLedger({
    client,
    contract: CONTRACT,
    payer: PAYER,
    target: { txHash: TX_HASH },
    invoiceList: [{ invoiceId: 'INV-001', invoiceRef: REF1 }],
  });
  expect(result.matchedCount).toBe(1);
  expect(result.mismatchedCount).toBe(0);
  expect(result.unmatchedOnChainCount).toBe(0);
  expect(result.unmatchedLocalCount).toBe(0);
});

// ─── Warning when multiple payer txs in block ────────────────────────────

test('rebuildLedger: warning when payerTxCountInBlock > 1', async () => {
  const logs = [
    invoicePaidLog(1n, 0n, PAYEE1, 1_000_000n, REF1),
    batchPaidLog(1n, PAYER, 1n, 1_000_000n),
  ];
  const client = makeClient({
    logs,
    block: {
      number: 1000n,
      transactions: [
        { hash: TX_HASH, from: PAYER },
        { hash: '0x' + '99'.padStart(64, '0') as Hex, from: PAYER }, // second payer tx
      ],
    },
  });

  const result = await rebuildLedger({
    client,
    contract: CONTRACT,
    payer: PAYER,
    target: { txHash: TX_HASH },
    invoiceList: [],
  });

  expect(result.payerTxCountInBlock).toBe(2);
  expect(result.warnings.length).toBeGreaterThan(0);
  expect(result.warnings[0]).toContain('payerTxCountInBlock=2');
});
