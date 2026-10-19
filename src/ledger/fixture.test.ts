/**
 * Tie-out test for the recorded Arc mainnet batch (fixtures/mainnet-batch-1.json).
 *
 * Builds a fake LedgerClient entirely from the fixture — no network calls.
 * The fake client synthesises:
 *   • Six InvoicePaid logs + one BatchPaid log (from PAYOUT_BATCH_ABI via encodeEventTopics)
 *   • One USDC Approval log (noise)
 *   • Six ERC-20 Transfer logs from the USDC address 0x3600...0000 (noise)
 *   • Six native-transfer Transfer logs from 0xffff...fffe with 18-decimal amounts (noise)
 *   • Balances at blockBefore and blockAfter (from fixture)
 *
 * The payout-total test proves that the 18-decimal Transfer logs from 0xffff...fffe
 * cannot inflate the payout total because rebuildLedger reads only InvoicePaid events.
 *
 * TIE-OUT NUMBERS (Arc mainnet batch 1):
 *   payoutTotal micro        : 195 000
 *   gasUsed                  : 524 474
 *   effectiveGasPrice        : 21 000 000 000  (21 gwei)
 *   feeWei (exact)           : 11 013 954 000 000 000
 *   feeMicro (half-up)       : 11 014          (11 013.954 rounds up)
 *   ledgerTotalMicro         : 206 014
 *   ledgerTotalNative18      : 206 013 954 000 000 000
 *   nativeWeiBefore          : 5 959 204 477 000 000 000
 *   nativeWeiAfter           : 5 753 190 523 000 000 000
 *   nativeDelta18            : 206 013 954 000 000 000  (exact)
 *   payoutsPlusFeeWei        : 206 013 954 000 000 000  (= 195000×10^12 + 11013954000000000)
 *   differenceWei            : 0  ← tie closes to the wei
 *   erc20Before              : 5 959 204
 *   erc20After               : 5 753 190
 *   erc20Delta               : 206 014
 *   payoutsPlusFee6          : 206 014
 *   difference6              : 0  ← ERC-20 delta also matches exactly here
 *
 * OPEN QUESTION ANSWERED:
 *   On Arc mainnet, the native balance delta equals payouts×10^12 + feeWei exactly (0 wei residue).
 *   The ERC-20 balanceOf delta also equals payoutSumMicro + feeMicro exactly (0 micro residue).
 *   Both views agree, confirming that gas is deducted from the same USDC pool.
 *   (A rounding artefact of ≤1 micro is theoretically possible when floor(native/10^12) is
 *   applied before and after; in this batch it does not occur — both differ by 0.)
 */

import { expect, test } from 'bun:test';
import {
  type Address,
  type Hex,
  encodeAbiParameters,
  encodeEventTopics,
  parseAbi,
} from 'viem';
import { nativeToMicro } from './money.js';
import { rebuildLedger, type LedgerClient, type LocalInvoice } from './rebuild.js';

// ─── Fixture data (inlined from fixtures/mainnet-batch-1.json) ───────────────

const CONTRACT = '0xC86e2241166785344E4d6692E4D2A3D4c8466d0e' as Address;
const PAYER    = '0x429Fd794Ed2166c0F6fFef39fA6A1F580Ba64364' as Address;
const USDC_ADDR = '0x3600000000000000000000000000000000000000' as Address;
// Arc Arc native-transfer pseudo-address emitted alongside each ERC-20 Transfer
const NATIVE_TRANSFER_ADDR = '0xfffffffffffffffffffffffffffffffffffffffe' as Address;
const BATCH_TX  = '0x50d56ea910e0412c47a7dc186b5f89ccf7cbe71235db799379874d6100987056' as Hex;
const BLOCK_NUM = 26689516n;
const BATCH_ID  = 1n;

const GAS_USED   = 524474n;
const GAS_PRICE  = 21000000000n; // 21 gwei
/** Pre-computed fee for documentation — tests derive it inline via GAS_USED * GAS_PRICE. */
const _FEE_WEI   = GAS_USED * GAS_PRICE; // 11_013_954_000_000_000n

// Payer balances from fixture
const NATIVE_BEFORE = 5959204477000000000n;
const NATIVE_AFTER  = 5753190523000000000n;
const ERC20_BEFORE  = 5959204n;  // micro-USDC
const ERC20_AFTER   = 5753190n;  // micro-USDC

interface LineData {
  lineIndex: number;
  invoiceId: string;
  payee: Address;
  amount: bigint;   // micro-USDC
  invoiceRef: Hex;
}

const LINES: LineData[] = [
  { lineIndex: 0, invoiceId: 'INV-0001', payee: '0xFe2b873C97CE177A0AF5e3BEad37EFE336e6a571', amount: 20000n, invoiceRef: '0x480f1d091980e77bfd5476fefacccaf148fd2eda7228cb643226eb5e0948b6db' },
  { lineIndex: 1, invoiceId: 'INV-0002', payee: '0x5eb1f8E7b85938E2eB71a1a0A0c71c9155B79F07', amount: 25000n, invoiceRef: '0x877fa72df36ad606e17c95f4810e171ccf89f2388e4904aaa43ca7885c49a9bd' },
  { lineIndex: 2, invoiceId: 'INV-0003', payee: '0x46DC111108143D53A119927f0CD60f463F2671d0', amount: 30000n, invoiceRef: '0x81c573e0a1e3c4ee65db10d9472f4127c084f794c539350958bc9e8470724762' },
  { lineIndex: 3, invoiceId: 'INV-0004', payee: '0xF80060bDA0F08b9D9000c138e44eAdeD4BAEFA97', amount: 35000n, invoiceRef: '0x09877960442bd25d36f9b8490678413a808abeb7a3b38f87cbff55acac2a4f71' },
  { lineIndex: 4, invoiceId: 'INV-0005', payee: '0x361fceB4632D9215a4B0b7f7b9288308312f7A4A', amount: 40000n, invoiceRef: '0x1b30e5e92b78f8c6a336beacda678c84b606c8bdc756a9f217fdb68bd0f7d053' },
  { lineIndex: 5, invoiceId: 'INV-0006', payee: '0xdA131CBb1cbB8AF35FFCd9B8D3bC065CF630932C', amount: 45000n, invoiceRef: '0xc0d92519e0006e0ed36a0f1270f24d2ac732a46f1edc7fd5a40365efe0bf03bb' },
] as LineData[];

const PAYOUT_TOTAL = LINES.reduce((s, l) => s + l.amount, 0n); // 195_000n

// ─── ABI ─────────────────────────────────────────────────────────────────────

const PAYOUT_BATCH_ABI = parseAbi([
  'event InvoicePaid(uint256 indexed batchId, uint256 lineIndex, address indexed payee, uint256 amount, bytes32 indexed invoiceRef)',
  'event BatchPaid(uint256 indexed batchId, address indexed payer, uint256 lineCount, uint256 total)',
]);

const ERC20_ABI = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
]);

// ─── Log builders ─────────────────────────────────────────────────────────────

function makeInvoicePaidLog(line: LineData) {
  const topics = encodeEventTopics({
    abi: PAYOUT_BATCH_ABI,
    eventName: 'InvoicePaid',
    args: { batchId: BATCH_ID, payee: line.payee, invoiceRef: line.invoiceRef },
  }) as [Hex, ...Hex[]];

  const data = encodeAbiParameters(
    [{ type: 'uint256' }, { type: 'uint256' }],
    [BigInt(line.lineIndex), line.amount],
  );

  return {
    address: CONTRACT,
    blockNumber: BLOCK_NUM,
    transactionHash: BATCH_TX,
    topics,
    data,
    logIndex: BigInt(line.lineIndex * 3),  // arbitrary
  };
}

function makeBatchPaidLog() {
  const topics = encodeEventTopics({
    abi: PAYOUT_BATCH_ABI,
    eventName: 'BatchPaid',
    args: { batchId: BATCH_ID, payer: PAYER },
  }) as [Hex, ...Hex[]];

  const data = encodeAbiParameters(
    [{ type: 'uint256' }, { type: 'uint256' }],
    [BigInt(LINES.length), PAYOUT_TOTAL],
  );

  return {
    address: CONTRACT,
    blockNumber: BLOCK_NUM,
    transactionHash: BATCH_TX,
    topics,
    data,
    logIndex: BigInt(LINES.length * 3),
  };
}

/** ERC-20 Approval noise log (PAYER approves CONTRACT for the total). */
function makeApprovalLog() {
  const topics = encodeEventTopics({
    abi: ERC20_ABI,
    eventName: 'Approval',
    args: { owner: PAYER, spender: CONTRACT },
  }) as [Hex, ...Hex[]];

  const data = encodeAbiParameters([{ type: 'uint256' }], [PAYOUT_TOTAL]);

  return {
    address: USDC_ADDR,
    blockNumber: BLOCK_NUM,
    transactionHash: BATCH_TX,
    topics,
    data,
    logIndex: 100n,
  };
}

/** ERC-20 Transfer log (6-decimal, from USDC address). */
function makeErc20TransferLog(line: LineData, idx: number) {
  const topics = encodeEventTopics({
    abi: ERC20_ABI,
    eventName: 'Transfer',
    args: { from: PAYER, to: line.payee },
  }) as [Hex, ...Hex[]];

  const data = encodeAbiParameters([{ type: 'uint256' }], [line.amount]);

  return {
    address: USDC_ADDR,
    blockNumber: BLOCK_NUM,
    transactionHash: BATCH_TX,
    topics,
    data,
    logIndex: BigInt(200 + idx),
  };
}

/**
 * Arc native-transfer Transfer log (18-decimal, from 0xffff...fffe).
 * Arc emits these alongside each ERC-20 Transfer to represent the same payment
 * in native units. rebuildLedger must NOT count these as payouts.
 */
function makeNativeTransferLog(line: LineData, idx: number) {
  const topics = encodeEventTopics({
    abi: ERC20_ABI,
    eventName: 'Transfer',
    args: { from: PAYER, to: line.payee },
  }) as [Hex, ...Hex[]];

  // 18-decimal amount: micro × 10^12
  const nativeAmount = line.amount * 1_000_000_000_000n;
  const data = encodeAbiParameters([{ type: 'uint256' }], [nativeAmount]);

  return {
    address: NATIVE_TRANSFER_ADDR,
    blockNumber: BLOCK_NUM,
    transactionHash: BATCH_TX,
    topics,
    data,
    logIndex: BigInt(300 + idx),
  };
}

// ─── Build all logs (with noise) ──────────────────────────────────────────────

function buildAllLogs() {
  return [
    makeApprovalLog(),
    ...LINES.map((l, i) => makeErc20TransferLog(l, i)),
    ...LINES.map((l, i) => makeNativeTransferLog(l, i)),
    ...LINES.map((l) => makeInvoicePaidLog(l)),
    makeBatchPaidLog(),
  ];
}

// ─── Fake client ──────────────────────────────────────────────────────────────

function buildFakeClient(): LedgerClient {
  const allLogs = buildAllLogs();
  const Bm1 = BLOCK_NUM - 1n;

  return {
    getLogs: ({ fromBlock, toBlock }: { address: Address; fromBlock: bigint; toBlock: bigint }) => {
      const filtered = allLogs.filter((l) => {
        const bn = l.blockNumber ?? 0n;
        return bn >= fromBlock && bn <= toBlock;
      });
      return Promise.resolve(filtered as unknown) as ReturnType<LedgerClient['getLogs']>;
    },

    getTransactionReceipt: () => Promise.resolve({
      transactionHash: BATCH_TX,
      blockNumber: BLOCK_NUM,
      status: 'success' as const,
      gasUsed: GAS_USED,
      effectiveGasPrice: GAS_PRICE,
      // receipt.logs could carry the noise too — rebuildLedger uses its own getLogs, not this
      logs: [],
    } as unknown as Awaited<ReturnType<LedgerClient['getTransactionReceipt']>>),

    getBlock: () => Promise.resolve({
      number: BLOCK_NUM,
      transactions: [{ hash: BATCH_TX, from: PAYER }],
    } as unknown as Awaited<ReturnType<LedgerClient['getBlock']>>),

    getBlockNumber: () => Promise.resolve(BLOCK_NUM),

    getBalance: ({ blockNumber }: { address: Address; blockNumber: bigint }) =>
      Promise.resolve(blockNumber === Bm1 ? NATIVE_BEFORE : NATIVE_AFTER),

    readContract: ({ blockNumber }: { blockNumber: bigint }) =>
      Promise.resolve(blockNumber === Bm1 ? ERC20_BEFORE : ERC20_AFTER) as ReturnType<LedgerClient['readContract']>,
  } as unknown as LedgerClient;
}

// ─── Invoice list (from CSV — invoiceRef is pre-computed, no salt) ────────────

const INVOICE_LIST: LocalInvoice[] = LINES.map((l) => ({
  invoiceId: l.invoiceId,
  invoiceRef: l.invoiceRef,
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

test('fixture tie-out: payout total is 195000 micro despite ERC-20 and native Transfer noise', async () => {
  // This test proves that rebuildLedger counts ONLY InvoicePaid events.
  // The 6 ERC-20 Transfer logs from USDC (6-decimal) and the 6 native Transfer
  // logs from 0xffff...fffe (18-decimal) must NOT inflate the payout total.
  const client = buildFakeClient();

  const result = await rebuildLedger({
    client,
    contract: CONTRACT,
    payer: PAYER,
    usdc: USDC_ADDR,
    target: { txHash: BATCH_TX },
    invoiceList: INVOICE_LIST,
  });

  expect(result.status).toBe('final');
  expect(result.receiptStatus).toBe('success');
  // Exactly 6 payout rows from InvoicePaid events — not 12 or 13 from noise
  expect(result.payoutRows).toHaveLength(6);

  const payoutSum = result.payoutRows.reduce((s, r) => s + r.amountMicro, 0n);
  // Must equal 195 000, not 195000 + Σ(amount×10^12) inflated by native logs
  expect(payoutSum).toBe(195000n);
  expect(result.payoutRows[0].amountMicro).toBe(20000n);
  expect(result.payoutRows[5].amountMicro).toBe(45000n);
});

test('fixture tie-out: rebuildLedger against Arc mainnet batch 1', async () => {
  const client = buildFakeClient();

  const result = await rebuildLedger({
    client,
    contract: CONTRACT,
    payer: PAYER,
    usdc: USDC_ADDR,
    target: { txHash: BATCH_TX },
    invoiceList: INVOICE_LIST,
  });

  // ── Basic ─────────────────────────────────────────────────────────────────
  expect(result.status).toBe('final');
  expect(result.receiptStatus).toBe('success');
  expect(result.blockNumber).toBe(BLOCK_NUM);
  expect(result.batchId).toBe(BATCH_ID);
  expect(result.txHash?.toLowerCase()).toBe(BATCH_TX.toLowerCase());
  expect(result.payoutRows).toHaveLength(6);

  // ── Per-line amounts ──────────────────────────────────────────────────────
  for (let i = 0; i < LINES.length; i++) {
    const row = result.payoutRows.find((r) => r.lineIndex === BigInt(LINES[i].lineIndex));
    expect(row).toBeDefined();
    expect(row!.amountMicro).toBe(LINES[i].amount);
    expect(row!.payee.toLowerCase()).toBe(LINES[i].payee.toLowerCase());
    expect(row!.invoiceRef.toLowerCase()).toBe(LINES[i].invoiceRef.toLowerCase());
  }

  // ── Fee ───────────────────────────────────────────────────────────────────
  // feeWei = gasUsed × effectiveGasPrice = 524474 × 21000000000 = 11013954000000000
  const expectedFeeWei = GAS_USED * GAS_PRICE; // 11_013_954_000_000_000n
  const expectedFeeMicro = nativeToMicro(expectedFeeWei); // 11014n (rounds up: 11013.954)
  expect(result.feeRow?.gasUsed).toBe(GAS_USED);
  expect(result.feeRow?.effectiveGasPrice).toBe(GAS_PRICE);
  expect(result.feeRow?.feeNative18).toBe(expectedFeeWei);
  expect(result.feeRow?.feeMicro).toBe(11014n);
  expect(expectedFeeMicro).toBe(11014n);

  // ── Ledger totals ─────────────────────────────────────────────────────────
  // ledgerTotalMicro = 195000 + 11014 = 206014
  expect(result.ledgerTotalMicro).toBe(206014n);
  // ledgerTotalNative18 = 195000 × 10^12 + 11013954000000000 = 206013954000000000
  expect(result.ledgerTotalNative18).toBe(206013954000000000n);

  // ── Balance deltas ────────────────────────────────────────────────────────
  // nativeWeiBefore = 5959204477000000000, nativeWeiAfter = 5753190523000000000
  // nativeDelta18 = 206013954000000000
  expect(result.nativeDelta18).toBe(NATIVE_BEFORE - NATIVE_AFTER); // 206013954000000000n
  expect(result.nativeDelta18).toBe(206013954000000000n);

  // erc20Before = 5959204, erc20After = 5753190 → erc20Delta = 206014
  expect(result.usdcDeltaMicro).toBe(ERC20_BEFORE - ERC20_AFTER); // 206014n
  expect(result.usdcDeltaMicro).toBe(206014n);

  // ─────────────────────────────────────────────────────────────────────────
  // OPEN QUESTION: On Arc, does the ERC-20 balanceOf delta equal payouts + fee?
  //
  // Native18 check (exact, no rounding):
  //   nativeDelta18               = 206 013 954 000 000 000
  //   payoutSumMicro × 10^12      = 195 000 × 10^12 = 195 000 000 000 000 000
  //   + feeWei                    =              11 013 954 000 000 000
  //   payoutsPlusFeeWei           = 206 013 954 000 000 000  ← matches exactly
  //   differenceWei               = 0  (gas comes from the same USDC pool)
  //
  // Micro check (6-decimal, via ERC-20 view):
  //   erc20Delta                  = 206 014
  //   payoutSumMicro + feeMicro   = 195 000 + 11 014 = 206 014  ← exact match
  //   difference6                 = 0
  //
  // Both views agree: Arc deducts gas from the same pool that balanceOf reports.
  // ─────────────────────────────────────────────────────────────────────────

  // Native18 exact tie-out: nativeDelta18 === payoutSum×10^12 + feeWei
  const payoutsPlusFeeWei = PAYOUT_TOTAL * 1_000_000_000_000n + expectedFeeWei;
  // 195000 × 10^12 = 195_000_000_000_000_000; + 11_013_954_000_000_000 = 206_013_954_000_000_000
  expect(payoutsPlusFeeWei).toBe(206013954000000000n);
  const differenceWei = result.nativeDelta18! - payoutsPlusFeeWei;
  expect(differenceWei).toBe(0n); // exact — no rounding residue

  // ERC-20 micro tie-out: usdcDeltaMicro === payoutSum + feeMicro
  const payoutsPlusFee6 = PAYOUT_TOTAL + expectedFeeMicro; // 195000 + 11014 = 206014
  expect(payoutsPlusFee6).toBe(206014n);
  const difference6 = result.usdcDeltaMicro! - payoutsPlusFee6;
  expect(difference6).toBe(0n); // exact match on this batch

  // differenceMicro from rebuildLedger (ledgerTotal - usdcDelta) = 206014 - 206014 = 0
  expect(result.differenceMicro).toBe(0n);
  expect(result.differenceNative18).toBe(0n);
  expect(result.differenceDisplay).toBe('$0.00');
  expect(result.differenceExact).toBe('0.000000');

  // ── Invoice join (CSV path — invoiceRef pre-computed, no salt) ────────────
  expect(result.matchedCount).toBe(6);
  expect(result.unmatchedOnChainCount).toBe(0);
  expect(result.unmatchedLocalCount).toBe(0);

  for (const inv of result.matched) {
    const line = LINES.find((l) => l.invoiceId === inv.invoiceId);
    expect(line).toBeDefined();
    expect(inv.ref.toLowerCase()).toBe(line!.invoiceRef.toLowerCase());
    // CSV path: salt is absent
    expect(inv.salt).toBeUndefined();
  }

  // ── No warnings (single payer tx in block) ────────────────────────────────
  expect(result.payerTxCountInBlock).toBe(1);
  expect(result.warnings).toHaveLength(0);

  // ── Log output for documentation ─────────────────────────────────────────
  console.log('\n=== MAINNET BATCH 1 TIE-OUT ===');
  console.log(`payoutTotal micro    : ${PAYOUT_TOTAL}`);
  console.log(`gasUsed              : ${GAS_USED}`);
  console.log(`effectiveGasPrice    : ${GAS_PRICE}`);
  console.log(`feeWei (exact)       : ${expectedFeeWei}`);
  console.log(`feeMicro (half-up)   : ${expectedFeeMicro}  (11013.954 → rounds up)`);
  console.log(`ledgerTotalMicro     : ${result.ledgerTotalMicro}`);
  console.log(`ledgerTotalNative18  : ${result.ledgerTotalNative18}`);
  console.log(`nativeDelta18        : ${result.nativeDelta18}`);
  console.log(`payoutsPlusFeeWei    : ${payoutsPlusFeeWei}`);
  console.log(`differenceWei        : ${differenceWei}  ← exact`);
  console.log(`erc20Delta           : ${result.usdcDeltaMicro}`);
  console.log(`payoutsPlusFee6      : ${payoutsPlusFee6}`);
  console.log(`difference6          : ${difference6}  ← exact`);
  console.log(`differenceMicro      : ${result.differenceMicro}`);
  console.log(`differenceDisplay    : ${result.differenceDisplay}`);
  console.log('CONCLUSION: nativeDelta18 === payouts×10^12 + feeWei (exact, 0 wei residue).');
  console.log('            ERC-20 delta also agrees (0 micro residue on this batch).');
});

test('fixture tie-out: unmatchedOnChain reported when invoice list is empty', async () => {
  // Proves the unmatched-ref path still works when no local invoices are provided
  const client = buildFakeClient();

  const result = await rebuildLedger({
    client,
    contract: CONTRACT,
    payer: PAYER,
    usdc: USDC_ADDR,
    target: { txHash: BATCH_TX },
    invoiceList: [], // no local invoices
  });

  expect(result.matchedCount).toBe(0);
  expect(result.unmatchedOnChainCount).toBe(6);
  expect(result.unmatchedLocalCount).toBe(0);
  expect(result.unmatchedOnChain).toHaveLength(6);
});

test('fixture tie-out: unmatchedLocal reported when one invoice ref is wrong', async () => {
  // Replace INV-0006 with a wrong invoiceRef to force an unmatched local entry
  const wrongRef = '0x' + 'ff'.repeat(32) as Hex;
  const invoiceListWithWrong: LocalInvoice[] = [
    ...LINES.slice(0, 5).map((l) => ({ invoiceId: l.invoiceId, invoiceRef: l.invoiceRef })),
    { invoiceId: 'INV-0006', invoiceRef: wrongRef },
  ];

  const client = buildFakeClient();

  const result = await rebuildLedger({
    client,
    contract: CONTRACT,
    payer: PAYER,
    usdc: USDC_ADDR,
    target: { txHash: BATCH_TX },
    invoiceList: invoiceListWithWrong,
  });

  expect(result.matchedCount).toBe(5);
  expect(result.unmatchedLocalCount).toBe(1);
  expect(result.unmatchedLocal[0].invoiceId).toBe('INV-0006');
  // The real INV-0006 ref is on chain but has no local match
  expect(result.unmatchedOnChainCount).toBe(1);
});
