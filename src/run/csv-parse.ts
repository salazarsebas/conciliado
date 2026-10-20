/**
 * src/run/csv-parse.ts
 *
 * CSV parser and validator for the /run batch flow.
 *
 * Input columns (case-insensitive header, snake_case aliases accepted):
 *   invoiceId / invoice_id, payee, amount, costCenter / cost_center
 *   costCenter column is optional.
 *
 * amount is a decimal USDC string (e.g. "20.5"), converted to 6-decimal raw
 * bigint with exact integer arithmetic (no floats).
 *
 * All rows are validated (no early exit); errors are collected with 1-based
 * line numbers.
 */

import { isAddress } from 'viem';
import type { Address, Hex } from 'viem';
import { makeInvoiceRef } from '../ledger/ref.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ParsedRow {
  /** 1-based row number in the CSV body (header = 0, first data row = 1) */
  rowNum: number;
  invoiceId: string;
  payee: Address;
  amountMicro: bigint;   // 6-decimal raw USDC units
  amountDisplay: string; // original decimal string, normalised
  costCenter: string;
}

export interface RowError {
  rowNum: number;
  reason: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: RowError[];
  /** True when the file had more than 200 data rows (whole-file rejection). */
  tooManyRows: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert a decimal USDC string to raw micro-USDC bigint (6 decimals).
 * Rejects negative values, non-numeric strings, and more than 6 decimal places.
 * Uses exact integer arithmetic (no floats).
 *
 * Returns null and a reason string on error.
 */
export function decimalToMicro(raw: string): { micro: bigint; display: string } | { error: string } {
  const s = raw.trim();
  // Allow optional leading minus for detection only; we reject negatives below
  if (!/^-?(\d+)(\.\d+)?$/.test(s)) {
    return { error: `"${s}" is not a valid number` };
  }
  if (s.startsWith('-')) {
    return { error: `amount must be positive, got "${s}"` };
  }
  const dotIdx = s.indexOf('.');
  let intPart: string;
  let fracPart: string;
  if (dotIdx === -1) {
    intPart = s;
    fracPart = '';
  } else {
    intPart = s.slice(0, dotIdx);
    fracPart = s.slice(dotIdx + 1);
  }
  if (fracPart.length > 6) {
    return { error: `amount "${s}" has more than 6 decimal places` };
  }
  const paddedFrac = fracPart.padEnd(6, '0');
  const micro = BigInt(intPart) * 1_000_000n + BigInt(paddedFrac);
  if (micro === 0n) {
    return { error: 'amount must not be zero' };
  }
  // Normalised display: restore with 6 decimals
  const display = `${intPart}.${paddedFrac}`;
  return { micro, display };
}

/** Normalise a CSV field: unquote, unescape doubled quotes, trim. */
function unquoteField(raw: string): string {
  const s = raw.trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    // Strip outer quotes and unescape doubled quotes
    return s.slice(1, -1).replace(/""/g, '"');
  }
  return s;
}

/**
 * Neutralise a value that starts with = + - @ to prevent spreadsheet formula
 * injection when written to a CSV cell.
 */
export function neutraliseFormulaInjection(value: string): string {
  if (/^[=+\-@]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

/**
 * Split a CSV line respecting quoted fields. Returns an array of raw fields
 * (including outer quotes if present).
 */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = false;
          cur += ch;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuote = true;
        cur += ch;
      } else if (ch === ',') {
        fields.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  fields.push(cur);
  return fields;
}

const MAX_LINES = 200;

// Accepted header column names (canonical → accepted aliases)
const COL_INVOICE_ID = ['invoiceid', 'invoice_id'];
const COL_PAYEE = ['payee'];
const COL_AMOUNT = ['amount'];
const COL_COST_CENTER = ['costcenter', 'cost_center'];

function findColIdx(headers: string[], accepted: string[]): number {
  return headers.findIndex((h) => accepted.includes(h.toLowerCase().replace(/\s/g, '')));
}

// ─── Main parse function ─────────────────────────────────────────────────────

/**
 * Parse and validate a CSV string for the /run batch flow.
 * Returns all rows (even ones with errors) plus the error list.
 * Does NOT perform on-chain checks (those require a wallet/network).
 */
export function parseRunCsv(raw: string): ParseResult {
  // Strip UTF-8 BOM if present
  const withoutBom = raw.startsWith('\ufeff') ? raw.slice(1) : raw;

  // Split lines, handle CRLF and LF
  const allLines = withoutBom.split(/\r?\n/);

  // Find the first non-blank line as the header
  let headerIdx = -1;
  for (let i = 0; i < allLines.length; i++) {
    if ((allLines[i] ?? '').trim() !== '') {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    return { rows: [], errors: [{ rowNum: 0, reason: 'File is empty.' }], tooManyRows: false };
  }

  const headerLine = allLines[headerIdx] ?? '';
  const rawHeaders = splitCsvLine(headerLine).map((h) => unquoteField(h).trim().toLowerCase().replace(/\s/g, ''));

  const idxInvoiceId = findColIdx(rawHeaders, COL_INVOICE_ID);
  const idxPayee = findColIdx(rawHeaders, COL_PAYEE);
  const idxAmount = findColIdx(rawHeaders, COL_AMOUNT);
  const idxCostCenter = findColIdx(rawHeaders, COL_COST_CENTER); // optional

  const missingCols: string[] = [];
  if (idxInvoiceId === -1) missingCols.push('invoiceId');
  if (idxPayee === -1) missingCols.push('payee');
  if (idxAmount === -1) missingCols.push('amount');
  if (missingCols.length > 0) {
    return {
      rows: [],
      errors: [{ rowNum: 0, reason: `Header missing required columns: ${missingCols.join(', ')}` }],
      tooManyRows: false,
    };
  }

  // Collect data lines (skip blanks, skip trailing newline)
  const dataLines: Array<{ line: string; rowNum: number }> = [];
  for (let i = headerIdx + 1; i < allLines.length; i++) {
    const line = allLines[i] ?? '';
    if (line.trim() === '') continue;
    dataLines.push({ line, rowNum: dataLines.length + 1 });
  }

  if (dataLines.length > MAX_LINES) {
    return {
      rows: [],
      errors: [{
        rowNum: 0,
        reason: `File has ${dataLines.length} rows but the maximum is ${MAX_LINES} (PayoutBatch MAX_LINES). The whole file is rejected.`,
      }],
      tooManyRows: true,
    };
  }

  const errors: RowError[] = [];
  const rows: ParsedRow[] = [];
  const seenInvoiceIds = new Map<string, number>();

  for (const { line, rowNum } of dataLines) {
    const fields = splitCsvLine(line).map(unquoteField);

    const raw_invoiceId = (fields[idxInvoiceId] ?? '').trim();
    const raw_payee = (fields[idxPayee] ?? '').trim();
    const raw_amount = (fields[idxAmount] ?? '').trim();
    const raw_costCenter = idxCostCenter >= 0 ? (fields[idxCostCenter] ?? '').trim() : '';

    let rowOk = true;

    // invoiceId
    if (!raw_invoiceId) {
      errors.push({ rowNum, reason: `Row ${rowNum}: invoiceId is empty` });
      rowOk = false;
    } else {
      const prev = seenInvoiceIds.get(raw_invoiceId);
      if (prev !== undefined) {
        errors.push({ rowNum, reason: `Row ${rowNum}: duplicate invoiceId "${raw_invoiceId}" (first seen at row ${prev})` });
        rowOk = false;
      } else {
        seenInvoiceIds.set(raw_invoiceId, rowNum);
      }
    }

    // payee
    let payee: Address | null = null;
    if (!raw_payee) {
      errors.push({ rowNum, reason: `Row ${rowNum}: payee address is empty` });
      rowOk = false;
    } else if (raw_payee === '0x0000000000000000000000000000000000000000') {
      errors.push({ rowNum, reason: `Row ${rowNum}: payee is the zero address` });
      rowOk = false;
    } else if (!isAddress(raw_payee, { strict: false }) || raw_payee.length !== 42) {
      errors.push({ rowNum, reason: `Row ${rowNum}: invalid payee address "${raw_payee}"` });
      rowOk = false;
    } else {
      payee = raw_payee;
    }

    // amount
    let amountMicro: bigint | null = null;
    let amountDisplay = raw_amount;
    if (!raw_amount) {
      errors.push({ rowNum, reason: `Row ${rowNum}: amount is empty` });
      rowOk = false;
    } else {
      const result = decimalToMicro(raw_amount);
      if ('error' in result) {
        errors.push({ rowNum, reason: `Row ${rowNum}: ${result.error}` });
        rowOk = false;
      } else {
        amountMicro = result.micro;
        amountDisplay = result.display;
      }
    }

    if (rowOk && payee !== null && amountMicro !== null && raw_invoiceId) {
      rows.push({
        rowNum,
        invoiceId: raw_invoiceId,
        payee,
        amountMicro,
        amountDisplay,
        costCenter: raw_costCenter,
      });
    }
  }

  return { rows, errors, tooManyRows: false };
}

// ─── Batch salt generation ───────────────────────────────────────────────────

/** Generate a cryptographically random 32-byte salt for a batch. */
export function generateSalt(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return ('0x' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')) as Hex;
}

/** Derive the invoiceRef for each parsed row given a batch salt. */
export function deriveRefs(rows: ParsedRow[], salt: Hex): Hex[] {
  return rows.map((r) => makeInvoiceRef(r.invoiceId, salt));
}

// ─── Download helpers ────────────────────────────────────────────────────────

/** Escape a CSV cell: wrap in double-quotes if it contains commas, quotes, or newlines. */
function escapeCsvCell(value: string): string {
  const s = neutraliseFormulaInjection(value);
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** Build the payer CSV content (invoiceId, payee, amount, invoiceRef, costCenter). */
export function buildPayerCsv(
  rows: ParsedRow[],
  refs: Hex[],
): string {
  const header = 'invoiceId,payee,amount,invoiceRef,costCenter';
  const dataLines = rows.map((r, i) => [
    escapeCsvCell(r.invoiceId),
    escapeCsvCell(r.payee),
    escapeCsvCell(r.amountDisplay),
    escapeCsvCell(refs[i] ?? ''),
    escapeCsvCell(r.costCenter),
  ].join(','));
  return [header, ...dataLines].join('\r\n');
}

/** Build the salt file content. */
export function buildSaltFile(salt: Hex, payoutBatchAddress: Address, chainId: number): string {
  return [
    `salt=${salt}`,
    `payoutBatch=${payoutBatchAddress}`,
    `chainId=${chainId}`,
    '',
    'Keep this file. The salt is the only way to reproduce the invoice references from your invoice IDs.',
    'Anyone who has it can test guessed invoice IDs against the references on chain.',
    'Conciliado does not store it.',
  ].join('\n');
}
