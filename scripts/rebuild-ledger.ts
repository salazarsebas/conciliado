/**
 * scripts/rebuild-ledger.ts
 *
 * Read-only live ledger rebuild for Arc mainnet.
 * Reads from the chain — never writes, never signs.
 *
 * Defaults:
 *   Chain    : Arc mainnet (chain id 5042)
 *   RPC      : https://rpc.mainnet.arc.io  (override with env RPC_URL)
 *   Contract : from fixtures/mainnet-batch-1.json
 *   Payer    : from fixtures/mainnet-batch-1.json
 *   Target   : by batchTx from fixtures/mainnet-batch-1.json
 *   Invoices : parsed from fixtures/mainnet-batch-1.csv
 *
 * Exit code 1 if differenceWei !== 0 OR any ref is unmatched.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, defineChain, http, type Address, type Hex } from 'viem';
import { formatMicro, formatUsd2, rebuildLedger, type LocalInvoice } from '../src/ledger/index.js';

// ─── Arc mainnet chain definition ────────────────────────────────────────────

const arcMainnet = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.mainnet.arc.io'] },
  },
  blockExplorers: {
    default: { name: 'Arc Explorer', url: 'https://explorer.arc.io' },
  },
});

// ─── Paths ────────────────────────────────────────────────────────────────────

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const FIXTURE_PATH = path.join(ROOT, 'fixtures', 'mainnet-batch-1.json');
const CSV_PATH     = path.join(ROOT, 'fixtures', 'mainnet-batch-1.csv');

// ─── Load fixture (target + payer only — NOT for expected numbers) ────────────

interface FixtureMeta {
  contract: Address;
  usdc: Address;
  payer: Address;
  batchTx: Hex;
}

function loadFixtureMeta(): FixtureMeta {
  const raw = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf-8')) as {
    contract: string;
    usdc: string;
    payer: string;
    batchTx: string;
  };
  return {
    contract: raw.contract as Address,
    usdc: raw.usdc as Address,
    payer: raw.payer as Address,
    batchTx: raw.batchTx as Hex,
  };
}

// ─── Parse CSV invoice list ───────────────────────────────────────────────────

function parseCsv(csvPath: string): LocalInvoice[] {
  const text = fs.readFileSync(csvPath, 'utf-8');
  const lines = text.trim().split('\n');
  // header: invoice_id,payee,amount,invoice_ref,cost_center
  const header = lines[0]?.split(',') ?? [];
  const idxId     = header.indexOf('invoice_id');
  const idxRef    = header.indexOf('invoice_ref');
  const idxPayee  = header.indexOf('payee');
  const idxAmount = header.indexOf('amount');
  if (idxId === -1 || idxRef === -1) {
    throw new Error(`CSV missing required columns invoice_id / invoice_ref. Header: ${lines[0]}`);
  }
  return lines.slice(1).map((line) => {
    const cols = line.split(',');
    const invoiceId  = cols[idxId]?.trim();
    const invoiceRef = cols[idxRef]?.trim();
    if (!invoiceId || !invoiceRef) throw new Error(`Malformed CSV line: ${line}`);
    const inv: LocalInvoice = { invoiceId, invoiceRef: invoiceRef as Hex };
    // Pass payee and amount for cross-checking when present
    if (idxPayee !== -1) {
      const p = cols[idxPayee]?.trim();
      if (p) (inv as { payee?: string }).payee = p;
    }
    if (idxAmount !== -1) {
      const a = cols[idxAmount]?.trim();
      if (a) (inv as { amountMicro?: bigint }).amountMicro = BigInt(a);
    }
    return inv;
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const rpcUrl = process.env.RPC_URL ?? 'https://rpc.mainnet.arc.io';
  const meta = loadFixtureMeta();
  const invoiceList = parseCsv(CSV_PATH);

  console.log(`Connecting to Arc mainnet via ${rpcUrl}`);
  console.log(`Contract  : ${meta.contract}`);
  console.log(`Payer     : ${meta.payer}`);
  console.log(`Target tx : ${meta.batchTx}`);
  console.log(`Invoices  : ${invoiceList.length}`);
  console.log('');

  const client = createPublicClient({
    chain: arcMainnet,
    transport: http(rpcUrl),
  });

  const result = await rebuildLedger({
    client,
    contract: meta.contract,
    payer: meta.payer,
    usdc: meta.usdc,
    target: { txHash: meta.batchTx },
    invoiceList,
    blockRangePerPage: 1000n,
  });

  if (result.status === 'pending') {
    console.error('Status: PENDING — transaction not yet confirmed.');
    process.exit(1);
  }

  console.log(`Status           : ${result.status} / ${result.receiptStatus ?? '-'}`);
  console.log(`Block            : ${result.blockNumber}`);
  console.log(`Batch id         : ${result.batchId}`);
  console.log(`Tx hash          : ${result.txHash}`);
  console.log('');

  console.log('── Payout rows ──────────────────────────────────────────');
  for (const row of result.payoutRows) {
    console.log(
      `  [${row.lineIndex}] ${row.payee}  ${formatMicro(row.amountMicro)} USDC  ref=${row.invoiceRef}`,
    );
  }
  console.log('');

  const payoutSum = result.payoutRows.reduce((s, r) => s + r.amountMicro, 0n);
  console.log(`── Fee row ───────────────────────────────────────────────`);
  console.log(`  gasUsed              : ${result.feeRow?.gasUsed}`);
  console.log(`  effectiveGasPrice    : ${result.feeRow?.effectiveGasPrice}`);
  console.log(`  feeNative18 (wei)    : ${result.feeRow?.feeNative18}`);
  console.log(`  feeMicro (half-up)   : ${result.feeRow?.feeMicro}`);
  console.log('');

  console.log(`── Ledger totals ─────────────────────────────────────────`);
  console.log(`  payoutSum micro      : ${payoutSum}  (${formatMicro(payoutSum)} USDC)`);
  console.log(`  ledgerTotalMicro     : ${result.ledgerTotalMicro}  (${formatMicro(result.ledgerTotalMicro!)} USDC)`);
  console.log(`  ledgerTotalNative18  : ${result.ledgerTotalNative18} wei`);
  console.log('');

  console.log(`── Balance delta (block ${Number(result.blockNumber!) - 1} → ${result.blockNumber}) ─────────`);
  console.log(`  nativeDelta18        : ${result.nativeDelta18} wei`);
  console.log(`  differenceWei        : ${result.differenceNative18} wei`);
  console.log(`  differenceDisplay    : ${result.differenceDisplay}`);
  console.log(`  differenceExact      : ${result.differenceExact}`);
  console.log(`  ERC-20 delta (micro) : ${result.usdcDeltaMicro}  (secondary view)`);
  console.log('');

  console.log(`── Invoice join ──────────────────────────────────────────`);
  console.log(`  Matched   ${result.matchedCount} of ${invoiceList.length}`);
  console.log(`  Mismatch  ${result.mismatchedCount}`);
  if (result.mismatchedCount > 0) {
    console.log(`  MISMATCH (${result.mismatchedCount}):`);
    for (const m of result.mismatched) {
      const fieldStr = m.fields.join(', ');
      console.log(`    ${m.invoiceId}  ref=${m.ref}  fields=[${fieldStr}]`);
      if (m.fields.includes('payee')) {
        console.log(`      payee   expected=${String(m.expected.payee)}  actual=${m.actual.payee}`);
      }
      if (m.fields.includes('amount')) {
        const exp = m.expected.amountMicro !== undefined ? formatMicro(m.expected.amountMicro) : '-';
        console.log(`      amount  expected=${exp} USDC  actual=${formatMicro(m.actual.amountMicro)} USDC`);
      }
    }
  }
  if (result.unmatchedOnChainCount > 0) {
    console.log(`  UNMATCHED ON-CHAIN (${result.unmatchedOnChainCount}):`);
    for (const ref of result.unmatchedOnChain) console.log(`    ${ref}`);
  }
  if (result.unmatchedLocalCount > 0) {
    console.log(`  UNMATCHED LOCAL (${result.unmatchedLocalCount}):`);
    for (const inv of result.unmatchedLocal) console.log(`    ${inv.invoiceId}`);
  }

  if (result.warnings.length > 0) {
    console.log('');
    console.log('── Warnings ─────────────────────────────────────────────');
    for (const w of result.warnings) console.log(`  ⚠  ${w}`);
  }

  // ── Exit code ──────────────────────────────────────────────────────────────
  let ok = true;
  if (result.differenceNative18 !== 0n) {
    console.error(`\nERROR: differenceWei = ${result.differenceNative18} (expected 0)`);
    ok = false;
  }
  if (result.mismatchedCount > 0) {
    console.error(
      `\nERROR: ${result.mismatchedCount} mismatch(es) — payee or amount does not match the CSV`,
    );
    ok = false;
  }
  if (result.unmatchedOnChainCount > 0 || result.unmatchedLocalCount > 0) {
    console.error(
      `\nERROR: unmatched refs — onChain=${result.unmatchedOnChainCount}, local=${result.unmatchedLocalCount}`,
    );
    ok = false;
  }

  if (!ok) {
    process.exit(1);
  }

  console.log(`\nOK — ledger total ${formatUsd2(result.ledgerTotalMicro!)} matches balance delta exactly.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
