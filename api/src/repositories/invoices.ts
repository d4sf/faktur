import type Database from "better-sqlite3";

import type { InvoiceStatus } from "../domain/decision.js";

export type InvoiceRow = {
  id: string;
  vendor_id: string | null;
  invoice_number: string | null;
  status: InvoiceStatus;
  file_name: string;
  mime_type: string;
  file_hash: string;
  issue_date: string | null;
  due_date: string | null;
  currency: string;
  subtotal: number | null;
  tax_amount: number | null;
  total_amount: number;
  fx_rate_used: number;
  total_usd: number;
  extraction_confidence: number | null;
  extraction_json: string;
  ingested_at: string;
};

export const INVOICE_COLUMNS = `id, vendor_id, invoice_number, status, file_name, mime_type,
  file_hash, issue_date, due_date, currency, subtotal, tax_amount, total_amount, fx_rate_used,
  total_usd, extraction_confidence, extraction_json, ingested_at`;

export function getInvoiceRow(id: string, db: Database.Database): InvoiceRow | null {
  const row = db.prepare(`SELECT ${INVOICE_COLUMNS} FROM invoices WHERE id = ?`).get(id);
  return (row as InvoiceRow | undefined) ?? null;
}

export function updateInvoiceStatus(
  id: string,
  status: InvoiceStatus,
  db: Database.Database,
): void {
  db.prepare("UPDATE invoices SET status = ? WHERE id = ?").run(status, id);
}
