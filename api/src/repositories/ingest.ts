import { randomUUID } from "node:crypto";

import { getDb } from "../db/index.js";
import type { AttemptStatus } from "../domain/ingestion.js";

export type IngestAttemptRow = {
  id: string;
  invoice_id: string | null;
  file_name: string;
  mime_type: string;
  byte_size: number;
  file_hash: string;
  attempt_status: AttemptStatus;
  duplicate_of_invoice_id: string | null;
  submitted_at: string;
};

export type NewIngestAttempt = Omit<IngestAttemptRow, "id" | "submitted_at"> & {
  id?: string;
  submitted_at?: string;
};

const COLUMNS = `id, invoice_id, file_name, mime_type, byte_size, file_hash, attempt_status,
  duplicate_of_invoice_id, submitted_at`;

export function createAttempt(row: NewIngestAttempt): string {
  const id = row.id ?? randomUUID();
  getDb()
    .prepare(`INSERT INTO ingest_attempts (${COLUMNS}) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(
      id,
      row.invoice_id,
      row.file_name,
      row.mime_type,
      row.byte_size,
      row.file_hash,
      row.attempt_status,
      row.duplicate_of_invoice_id,
      row.submitted_at ?? new Date().toISOString(),
    );
  return id;
}

export function findInvoiceByHash(hash: string): { id: string; ingested_at: string } | null {
  const row = getDb()
    .prepare("SELECT id, ingested_at FROM invoices WHERE file_hash = ?")
    .get(hash) as { id: string; ingested_at: string } | undefined;
  return row ?? null;
}

export function findAttemptByHash(
  hash: string,
): { id: string; invoice_id: string | null; submitted_at: string } | null {
  const row = getDb()
    .prepare(
      `SELECT id, invoice_id, submitted_at FROM ingest_attempts WHERE file_hash = ?
       ORDER BY submitted_at ASC, id ASC LIMIT 1`,
    )
    .get(hash) as { id: string; invoice_id: string | null; submitted_at: string } | undefined;
  return row ?? null;
}

export function linkAttemptToInvoice(attemptId: string, invoiceId: string): void {
  getDb()
    .prepare("UPDATE ingest_attempts SET invoice_id = ? WHERE id = ?")
    .run(invoiceId, attemptId);
}

export function getAttempt(id: string): IngestAttemptRow | null {
  const row = getDb().prepare(`SELECT ${COLUMNS} FROM ingest_attempts WHERE id = ?`).get(id);
  return (row as IngestAttemptRow | undefined) ?? null;
}
