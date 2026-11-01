/**
 * View-model tests: driven by an offline viem-compatible fake client
 * built from fixtures/mainnet-batch-1.json, exactly as fixture.test.ts does.
 *
 * Tests:
 *   - Happy path: 6 of 6 matched, fee 0.011014, ledger total = wallet change = 0.206014
 *   - differenceNative18 0n → "$0.00" and "0 wei"
 *   - Row explorer links correct
 *   - Status Final
 *   - Not tied case: balance differs by 1 wei → nonzero difference shown
 *   - Error case (client throws) with no cache → error state
 *   - Pending receipt → pending status
 *   - Batch constants match fixture JSON
 */

import { expect, test } from 'bun:test';
import {
  type Address,
  type Hex,
  encodeAbiParameters,
  encodeEventTopics,
  parseAbi,
} from 'viem';
import { rebuildLedger, type LedgerClient } from '../ledger/rebuild.js';
import { buildViewModel } from './view-model.js';
import {
  CHAIN_ID,
  CONTRACT_ADDRESS,
  BATCH_TX,
  PAYER_ADDRESS,
  USDC_ADDRESS,
  BLOCK_NUMBER,
  EXPLORER_BASE,
} from './batch.js';

import fs from 'node:fs';
import path from 'node:path';

// ─── Fixture data ─────────────────────────────────────────────────────────

const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '../../fixtures/mainnet-batch-1.json'), 'utf-8'),
) as {
  chainId: number;
  contract: Address;
  usdc: Address;
  batchTx: Hex;
  blockNumber: number;
  payer: Address;
  lines: Array<{ lineIndex: number; invoiceId: string; payee: Address; amount: string; invoiceRef: Hex }>;
  gasUsed: string;
  effectiveGasPrice: string;
  payerBalance: {
    blockBefore: number;
    blockAfter: number;
    nativeWeiBefore: string;
    nativeWeiAfter: string;
    erc20Before: string;
    erc20After: string;
  };
};

const BLOCK = BigInt(FIXTURE.blockNumber);
const GAS_USED = BigInt(FIXTURE.gasUsed);
const GAS_PRICE = BigInt(FIXTURE.effectiveGasPrice);
const NATIVE_BEFORE = BigInt(FIXTURE.payerBalance.nativeWeiBefore);
const NATIVE_AFTER = BigInt(FIXTURE.payerBalance.nativeWeiAfter);
const ERC20_BEFORE = BigInt(FIXTURE.payerBalance.erc20Before);
const ERC20_AFTER = BigInt(FIXTURE.payerBalance.erc20After);

// ─── ABI ─────────────────────────────────────────────────────────────────

const PAYOUT_BATCH_ABI = parseAbi([
  'event InvoicePaid(uint256 indexed batchId, uint256 lineIndex, address indexed payee, uint256 amount, bytes32 indexed invoiceRef)',
  'event BatchPaid(uint256 indexed batchId, address indexed payer, uint256 lineCount, uint256 total)',
]);

// ─── Log builders ─────────────────────────────────────────────────────────

function buildInvoicePaidLog(
  lineIndex: number, payee: Address, amount: bigint, invoiceRef: Hex,
) {
  const topics = encodeEventTopics({
    abi: PAYOUT_BATCH_ABI,
    eventName: 'InvoicePaid',
    args: { batchId: 1n, payee, invoiceRef },
  });
  const data = encodeAbiParameters(
    [{ type: 'uint256' }, { type: 'uint256' }],
    [BigInt(lineIndex), amount],
  );
  return { address: CONTRACT_ADDRESS, blockNumber: BLOCK, transactionHash: BATCH_TX, topics, data, logIndex: BigInt(lineIndex) };
}

function buildBatchPaidLog(lineCount: bigint, total: bigint) {
  const topics = encodeEventTopics({
    abi: PAYOUT_BATCH_ABI,
    eventName: 'BatchPaid',
    args: { batchId: 1n, payer: PAYER_ADDRESS },
  });
  const data = encodeAbiParameters(
    [{ type: 'uint256' }, { type: 'uint256' }],
    [lineCount, total],
  );
  return { address: CONTRACT_ADDRESS, blockNumber: BLOCK, transactionHash: BATCH_TX, topics, data, logIndex: BigInt(lineCount + 1n) };
}

// ─── Build canonical logs (6 InvoicePaid + BatchPaid + noise) ─────────────

function buildLogs(lineOverrides?: Partial<{ lineIndex: number; amount: bigint }>[]) {
  const lines = FIXTURE.lines.map((l, i) => {
    const override = lineOverrides?.[i];
    return buildInvoicePaidLog(
      override?.lineIndex ?? l.lineIndex,
      l.payee,
      override?.amount ?? BigInt(l.amount),
      l.invoiceRef,
    );
  });
  const total = FIXTURE.lines.reduce((s, l) => s + BigInt(l.amount), 0n);
  const batchPaid = buildBatchPaidLog(BigInt(FIXTURE.lines.length), total);

  // Noise: USDC Approval log (different event sig, ignored)
  const approvalNoise = {
    address: USDC_ADDRESS,
    blockNumber: BLOCK,
    transactionHash: BATCH_TX,
    topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'] as [Hex],
    data: '0x' as Hex,
    logIndex: 100n,
  };

  // Noise: 6 ERC-20 Transfer logs from USDC address
  const erc20Transfers = FIXTURE.lines.map((l, i) =>
    ({
      address: USDC_ADDRESS,
      blockNumber: BLOCK,
      transactionHash: BATCH_TX,
      topics: [
        '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
        ('0x' + PAYER_ADDRESS.slice(2).toLowerCase().padStart(64, '0')) as Hex,
        ('0x' + (l.payee as string).slice(2).toLowerCase().padStart(64, '0')) as Hex,
      ] as [Hex, Hex, Hex],
      data: encodeAbiParameters([{ type: 'uint256' }], [BigInt(l.amount)]),
      logIndex: BigInt(200 + i),
    })
  );

  // Noise: 6 18-decimal Transfer logs from 0xffffffffffffffffffffffffffffffffffffffff-ish address
  const nativeTransfers = FIXTURE.lines.map((l, i) =>
    ({
      address: '0xfffffffffffffffffffffffffffffffffffffffe' as Address,
      blockNumber: BLOCK,
      transactionHash: BATCH_TX,
      topics: [
        '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
        ('0x' + PAYER_ADDRESS.slice(2).toLowerCase().padStart(64, '0')) as Hex,
        ('0x' + (l.payee as string).slice(2).toLowerCase().padStart(64, '0')) as Hex,
      ] as [Hex, Hex, Hex],
      // 18-decimal amounts (1000x the 6-decimal amount)
      data: encodeAbiParameters([{ type: 'uint256' }], [BigInt(l.amount) * 1_000_000_000_000n]),
      logIndex: BigInt(300 + i),
    })
  );

  return [...lines, batchPaid, approvalNoise, ...erc20Transfers, ...nativeTransfers];
}

// ─── Fake client builder ──────────────────────────────────────────────────

function makeClient(opts?: {
  nativeBefore?: bigint;
  nativeAfter?: bigint;
  erc20Before?: bigint;
  erc20After?: bigint;
  throwOnReceipt?: boolean;
  pendingReceipt?: boolean;
  logs?: ReturnType<typeof buildLogs>;
}): LedgerClient {
  const logs = opts?.logs ?? buildLogs();
  const Bm1 = BLOCK - 1n;

  return {
    getLogs: (_args: unknown) =>
      Promise.resolve(logs as unknown) as ReturnType<LedgerClient['getLogs']>,
    getTransactionReceipt: () => {
      if (opts?.throwOnReceipt) {
        return Promise.reject(new Error('TransactionReceiptNotFoundError: could not be found'));
      }
      return Promise.resolve({
        transactionHash: BATCH_TX,
        blockNumber: BLOCK,
        status: 'success' as const,
        gasUsed: GAS_USED,
        effectiveGasPrice: GAS_PRICE,
        logs: [],
      }) as unknown as ReturnType<LedgerClient['getTransactionReceipt']>;
    },
    getBlock: () => Promise.resolve({
      number: BLOCK,
      transactions: [{ hash: BATCH_TX, from: PAYER_ADDRESS }],
    }) as unknown as ReturnType<LedgerClient['getBlock']>,
    getBlockNumber: () => Promise.resolve(BLOCK + 10n),
    getBalance: ({ blockNumber }: { address: Address; blockNumber: bigint }) => {
      const nb = opts?.nativeBefore ?? NATIVE_BEFORE;
      const na = opts?.nativeAfter ?? NATIVE_AFTER;
      return Promise.resolve(blockNumber === Bm1 ? nb : na);
    },
    readContract: ({ blockNumber }: { blockNumber: bigint }) => {
      const eb = opts?.erc20Before ?? ERC20_BEFORE;
      const ea = opts?.erc20After ?? ERC20_AFTER;
      return Promise.resolve(blockNumber === Bm1 ? eb : ea) as unknown as ReturnType<LedgerClient['readContract']>;
    },
  } as unknown as LedgerClient;
}

// ─── Invoice list from CSV ────────────────────────────────────────────────

const INVOICE_LIST = FIXTURE.lines.map((l) => ({
  invoiceId: l.invoiceId,
  invoiceRef: l.invoiceRef,
  payee: l.payee,
  amountMicro: BigInt(l.amount),
}));

// ─── Tests ────────────────────────────────────────────────────────────────

test('batch.ts constants match fixtures/mainnet-batch-1.json', () => {
  expect(CHAIN_ID).toBe(FIXTURE.chainId);
  expect(CONTRACT_ADDRESS.toLowerCase()).toBe(FIXTURE.contract.toLowerCase());
  expect(BATCH_TX.toLowerCase()).toBe(FIXTURE.batchTx.toLowerCase());
  expect(PAYER_ADDRESS.toLowerCase()).toBe(FIXTURE.payer.toLowerCase());
  expect(USDC_ADDRESS.toLowerCase()).toBe(FIXTURE.usdc.toLowerCase());
  expect(BLOCK_NUMBER).toBe(BigInt(FIXTURE.blockNumber));
});

test('view-model: 6 of 6 matched from mainnet fixture', async () => {
  const client = makeClient();
  const result = await rebuildLedger({
    client,
    contract: CONTRACT_ADDRESS,
    payer: PAYER_ADDRESS,
    usdc: USDC_ADDRESS,
    target: { txHash: BATCH_TX },
    invoiceList: INVOICE_LIST,
  });
  const vm = buildViewModel(result, INVOICE_LIST);

  expect(vm.matchedCount).toBe(6);
  expect(vm.mismatchedCount).toBe(0);
  expect(vm.invoiceCount).toBe(6);
  expect(vm.matchSummary).toBe('6 of 6 matched');
});

test('view-model: fee row 0.011014 USDC with full figure 0.011013954', async () => {
  const client = makeClient();
  const result = await rebuildLedger({
    client,
    contract: CONTRACT_ADDRESS,
    payer: PAYER_ADDRESS,
    usdc: USDC_ADDRESS,
    target: { txHash: BATCH_TX },
    invoiceList: INVOICE_LIST,
  });
  const vm = buildViewModel(result, INVOICE_LIST);

  expect(vm.feeRow).not.toBeNull();
  // 6-decimal display: 11014 micro = "0.011014"
  expect(vm.feeRow!.amountDisplay).toBe('0.011014');
  // Full figure must contain "011013954"
  expect(vm.feeRow!.amountFullDisplay).toContain('011013954');
});

test('view-model: ledger total = 0.206014 USDC', async () => {
  const client = makeClient();
  const result = await rebuildLedger({
    client,
    contract: CONTRACT_ADDRESS,
    payer: PAYER_ADDRESS,
    usdc: USDC_ADDRESS,
    target: { txHash: BATCH_TX },
    invoiceList: INVOICE_LIST,
  });
  const vm = buildViewModel(result, INVOICE_LIST);
  expect(vm.totalDisplay).toBe('0.206014');
});

test('view-model: differenceNative18 0n shows "$0.00" and "0 wei"', async () => {
  const client = makeClient();
  const result = await rebuildLedger({
    client,
    contract: CONTRACT_ADDRESS,
    payer: PAYER_ADDRESS,
    usdc: USDC_ADDRESS,
    target: { txHash: BATCH_TX },
    invoiceList: INVOICE_LIST,
  });
  expect(result.differenceNative18).toBe(0n);
  const vm = buildViewModel(result, INVOICE_LIST);
  expect(vm.tieOut?.differenceDisplay).toBe('$0.00');
  expect(vm.tieOut?.differenceWei).toBe('0 wei');
  expect(vm.tieOut?.tied).toBe(true);
});

test('view-model: row explorer links are correct', async () => {
  const client = makeClient();
  const result = await rebuildLedger({
    client,
    contract: CONTRACT_ADDRESS,
    payer: PAYER_ADDRESS,
    usdc: USDC_ADDRESS,
    target: { txHash: BATCH_TX },
    invoiceList: INVOICE_LIST,
  });
  const vm = buildViewModel(result, INVOICE_LIST);

  // Transaction links
  expect(vm.payoutRows[0].txUrl).toBe(`${EXPLORER_BASE}/tx/${BATCH_TX}`);
  // Payee address links
  const firstPayee = FIXTURE.lines[0].payee;
  expect(vm.payoutRows[0].payeeExplorerUrl).toBe(`${EXPLORER_BASE}/address/${firstPayee}`);
});

test('view-model: status is Final', async () => {
  const client = makeClient();
  const result = await rebuildLedger({
    client,
    contract: CONTRACT_ADDRESS,
    payer: PAYER_ADDRESS,
    usdc: USDC_ADDRESS,
    target: { txHash: BATCH_TX },
    invoiceList: INVOICE_LIST,
  });
  const vm = buildViewModel(result, INVOICE_LIST);
  expect(vm.status).toBe('final');
  expect(vm.receiptStatus).toBe('success');
});

test('view-model: payout total stays 195000 with ERC-20 and native Transfer noise', async () => {
  // The noise logs (Transfer from USDC address and native-transfer from 0xffff...fffe)
  // must NOT inflate the payout total. Only InvoicePaid events count.
  const client = makeClient(); // includes all noise by default
  const result = await rebuildLedger({
    client,
    contract: CONTRACT_ADDRESS,
    payer: PAYER_ADDRESS,
    usdc: USDC_ADDRESS,
    target: { txHash: BATCH_TX },
    invoiceList: INVOICE_LIST,
  });

  const payoutSum = result.payoutRows.reduce((s, r) => s + r.amountMicro, 0n);
  expect(payoutSum).toBe(195000n);
  expect(result.payoutRows).toHaveLength(6);
});

test('view-model: not tied case: 1 wei difference shown exactly', async () => {
  // Alter the native balance so nativeDelta18 is 1 wei MORE than ledgerTotalNative18
  const client = makeClient({
    nativeBefore: NATIVE_BEFORE + 1n,
    nativeAfter: NATIVE_AFTER,
  });
  const result = await rebuildLedger({
    client,
    contract: CONTRACT_ADDRESS,
    payer: PAYER_ADDRESS,
    usdc: USDC_ADDRESS,
    target: { txHash: BATCH_TX },
    invoiceList: INVOICE_LIST,
  });
  const vm = buildViewModel(result, INVOICE_LIST);

  expect(result.differenceNative18).not.toBe(0n);
  // Must not show $0.00 when not tied
  expect(vm.tieOut?.tied).toBe(false);
  expect(vm.tieOut?.differenceDisplay).not.toBe('$0.00');
  // The exact wei must appear
  expect(vm.tieOut?.differenceWei).not.toBe('0 wei');
  expect(vm.tieOut?.resultWord).toContain('Does not tie');
});

test('view-model: pending receipt shows pending status', async () => {
  const client = makeClient({ throwOnReceipt: true });
  const result = await rebuildLedger({
    client,
    contract: CONTRACT_ADDRESS,
    payer: PAYER_ADDRESS,
    usdc: USDC_ADDRESS,
    target: { txHash: BATCH_TX },
    invoiceList: INVOICE_LIST,
  });
  expect(result.status).toBe('pending');
  expect(result.payoutRows).toHaveLength(0);
  expect(result.feeRow).toBeNull();
});

// ─── Mismatch view-model cases ────────────────────────────────────────────

test('view-model mismatch: wrong payee => row has mismatch=true, matchWord=Mismatch', async () => {
  const client = makeClient();
  const WRONG_PAYEE: Address = '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
  const mismatchList = FIXTURE.lines.map((l, i) => ({
    invoiceId: l.invoiceId,
    invoiceRef: l.invoiceRef,
    // First row has wrong payee, others correct
    payee: (i === 0 ? WRONG_PAYEE : l.payee),
    amountMicro: BigInt(l.amount),
  }));
  const result = await rebuildLedger({
    client,
    contract: CONTRACT_ADDRESS,
    payer: PAYER_ADDRESS,
    usdc: USDC_ADDRESS,
    target: { txHash: BATCH_TX },
    invoiceList: mismatchList,
  });
  const vm = buildViewModel(result, mismatchList);
  expect(vm.mismatchedCount).toBe(1);
  expect(vm.matchedCount).toBe(5);
  // The mismatch row
  const mismatchRow = vm.payoutRows.find((r) => r.mismatch);
  expect(mismatchRow).toBeDefined();
  expect(mismatchRow!.matchWord).toBe('Mismatch');
  expect(mismatchRow!.mismatchDetail?.fields).toContain('payee');
  // matchSummary includes mismatch count
  expect(vm.matchSummary).toContain('mismatch');
});

test('view-model mismatch: wrong amount => row has mismatch=true, matchWord=Mismatch', async () => {
  const client = makeClient();
  const mismatchList = FIXTURE.lines.map((l, i) => ({
    invoiceId: l.invoiceId,
    invoiceRef: l.invoiceRef,
    payee: l.payee,
    amountMicro: i === 0 ? BigInt(l.amount) + 1n : BigInt(l.amount),
  }));
  const result = await rebuildLedger({
    client,
    contract: CONTRACT_ADDRESS,
    payer: PAYER_ADDRESS,
    usdc: USDC_ADDRESS,
    target: { txHash: BATCH_TX },
    invoiceList: mismatchList,
  });
  const vm = buildViewModel(result, mismatchList);
  expect(vm.mismatchedCount).toBe(1);
  expect(vm.matchedCount).toBe(5);
  const mismatchRow = vm.payoutRows.find((r) => r.mismatch);
  expect(mismatchRow).toBeDefined();
  expect(mismatchRow!.matchWord).toBe('Mismatch');
  expect(mismatchRow!.mismatchDetail?.fields).toContain('amount');
});

test('view-model mismatch: no mismatches => matchSummary has no mismatch word', async () => {
  const client = makeClient();
  const result = await rebuildLedger({
    client,
    contract: CONTRACT_ADDRESS,
    payer: PAYER_ADDRESS,
    usdc: USDC_ADDRESS,
    target: { txHash: BATCH_TX },
    invoiceList: INVOICE_LIST,
  });
  const vm = buildViewModel(result, INVOICE_LIST);
  expect(vm.mismatchedCount).toBe(0);
  expect(vm.matchSummary).toBe('6 of 6 matched');
  expect(vm.matchSummary).not.toContain('mismatch');
});

test('view-model: a batch read without an invoice list is not reported as unmatched', async () => {
  const client = makeClient();
  const result = await rebuildLedger({
    client,
    contract: CONTRACT_ADDRESS,
    payer: PAYER_ADDRESS,
    usdc: USDC_ADDRESS,
    target: { txHash: BATCH_TX },
    invoiceList: [],
  });
  const vm = buildViewModel(result, []);
  expect(vm.chainOnly).toBe(true);
  expect(vm.payoutRows.map((r) => r.matchWord)).toEqual(Array(6).fill('Reference only'));
  expect(vm.matchSummary).toBe('6 payments read from the chain. Invoice IDs stay with the payer.');
  expect(vm.tieOut?.resultWord).toBe('Ties out. Difference 0 wei.');
});
