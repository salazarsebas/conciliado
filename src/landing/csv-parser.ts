/**
 * Pure CSV parser for the Conciliado invoice list format.
 * No imports from viem or React; safe for bun test without DOM.
 *
 * Expected columns (first row must be this exact header, in this order):
 *   invoice_id, payee, amount, invoice_ref, cost_center
 *
 * The `amount` column is raw 6-decimal micro-USDC units (e.g. "20000" = 0.020000 USDC).
 * The `invoice_ref` is a 0x-prefixed 32-byte hex string (pre-computed, no salt needed).
 */

export interface CsvInvoiceRow {
  invoiceId: string;
  payee: string;
  amount: bigint;       // micro-USDC (6 decimals)
  invoiceRef: string;   // 0x-prefixed 32-byte hex
  costCenter: string;
}

const EXPECTED_HEADER = 'invoice_id,payee,amount,invoice_ref,cost_center';

export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvParseError';
  }
}

/**
 * Parse a Conciliado invoice CSV string into rows.
 * Throws CsvParseError if the header is wrong or any data row is malformed.
 */
export function parseCsv(raw: string): CsvInvoiceRow[] {
  const lines = raw.trim().split(/\r?\n/);
  if (lines.length === 0) throw new CsvParseError('Empty file.');

  const header = (lines[0] ?? '').trim();
  if (header !== EXPECTED_HEADER) {
    throw new CsvParseError(
      `Bad header. Expected: "${EXPECTED_HEADER}", got: "${header}"`,
    );
  }

  const rows: CsvInvoiceRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    if (!line) continue;
    const parts = line.split(',');
    if (parts.length < 5) {
      throw new CsvParseError(`Row ${i}: expected 5 columns, got ${parts.length}.`);
    }
    const [invoiceId, payee, amountStr, invoiceRef, costCenter] = parts as [string, string, string, string, string];
    const amount = BigInt(amountStr.trim());
    rows.push({
      invoiceId: invoiceId.trim(),
      payee: payee.trim(),
      amount,
      invoiceRef: invoiceRef.trim(),
      costCenter: costCenter.trim(),
    });
  }
  return rows;
}
