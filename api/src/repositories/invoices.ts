import type Database from "better-sqlite3";

import type { AuditRecord } from "../domain/audit.js";
import type { DecisionRow } from "../repositories/decisions.js";
import type { InvoiceStatus } from "../domain/decision.js";
import { ExtractedInvoice } from "../domain/extraction.js";

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

/** La proyección de T13: el `AuditRecord` de la última decisión más el estado actual. */
export type AuditRecordView = AuditRecord & {
  estado: "PAGADA" | "FRENADA" | "ESCALADA" | "PENDIENTE";
};

export type TimelineEvent = {
  type: "INGESTA" | "EXTRACCION" | "DECISION" | "RESOLUCION";
  at: string;
  detail: string;
};

export type ResolutionView = {
  resolved_by: string;
  resolved_at: string;
  comment: string | null;
};

type RecordRow = InvoiceRow & {
  decision_id: string;
  verdict: AuditRecord["verdict"];
  reason_code: AuditRecord["reason_code"];
  explanation: string;
  policy_version: string;
  amount_usd_evaluated: number;
  decided_by: string;
  decided_at: string;
  approval_status: "PENDIENTE" | "APROBADA" | "NEGADA" | null;
  resolved_by: string | null;
  resolved_at: string | null;
  comment: string | null;
};

const LATEST_DECISION_JOIN = `
  JOIN decisions d ON d.id = (
    SELECT d2.id FROM decisions d2
    WHERE d2.invoice_id = i.id
    ORDER BY d2.decided_at DESC, d2.id DESC
    LIMIT 1
  )
  LEFT JOIN approvals a ON a.decision_id = d.id
`;

const RECORD_SELECT = `
  SELECT i.id, i.vendor_id, i.invoice_number, i.status, i.file_name, i.mime_type,
    i.file_hash, i.issue_date, i.due_date, i.currency, i.subtotal, i.tax_amount,
    i.total_amount, i.fx_rate_used, i.total_usd, i.extraction_confidence,
    i.extraction_json, i.ingested_at,
    d.id AS decision_id, d.verdict AS verdict, d.reason_code AS reason_code,
    d.explanation AS explanation, d.policy_version AS policy_version,
    d.amount_usd_evaluated AS amount_usd_evaluated, d.decided_by AS decided_by,
    d.decided_at AS decided_at, a.status AS approval_status,
    a.resolved_by AS resolved_by, a.resolved_at AS resolved_at, a.comment AS comment
  FROM invoices i
  ${LATEST_DECISION_JOIN}
`;

function estadoOf(status: InvoiceStatus): AuditRecordView["estado"] {
  switch (status) {
    case "DECIDIDA":
    case "APROBADA":
      return "PAGADA";
    case "PENDIENTE_APROBACION":
      return "ESCALADA";
    case "FRENADA":
    case "NEGADA":
      return "FRENADA";
    default:
      return "PENDIENTE";
  }
}

function toAuditRecord(row: RecordRow): AuditRecordView {
  return {
    id: row.decision_id,
    invoice: ExtractedInvoice.parse(JSON.parse(row.extraction_json)),
    document_hash: row.file_hash,
    amount_usd: row.amount_usd_evaluated,
    verdict: row.verdict,
    reason_code: row.reason_code,
    explanation: row.explanation,
    created_at: row.decided_at,
    human_approved:
      row.approval_status === "APROBADA" ? true : row.approval_status === "NEGADA" ? false : null,
    estado: estadoOf(row.status),
  };
}

/** Listado LIFO por fecha de decisión, una fila por factura (no por re-evaluación). */
export function listAuditRecords(
  db: Database.Database,
  filters: { status?: InvoiceStatus; limit?: number; offset?: number } = {},
): { items: AuditRecordView[]; total: number } {
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  const where = filters.status === undefined ? "" : "WHERE i.status = ?";
  const params = filters.status === undefined ? [] : [filters.status];

  const rows = db
    .prepare(`${RECORD_SELECT} ${where} ORDER BY d.decided_at DESC, d.id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as RecordRow[];

  const total = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM invoices i ${LATEST_DECISION_JOIN} ${where}`)
      .get(...params) as { n: number }
  ).n;

  return { items: rows.map(toAuditRecord), total };
}

export function getAuditRecord(
  invoiceId: string,
  db: Database.Database,
): {
  record: AuditRecordView;
  timeline: TimelineEvent[];
  resolution: ResolutionView | null;
} | null {
  const row = db.prepare(`${RECORD_SELECT} WHERE i.id = ?`).get(invoiceId) as RecordRow | undefined;
  if (row === undefined) return null;

  const events: TimelineEvent[] = [];
  const attempts = db
    .prepare(
      `SELECT file_name, submitted_at FROM ingest_attempts WHERE invoice_id = ?
       ORDER BY submitted_at ASC, id ASC`,
    )
    .all(invoiceId) as Array<{ file_name: string; submitted_at: string }>;
  for (const attempt of attempts) {
    events.push({
      type: "INGESTA",
      at: attempt.submitted_at,
      detail: `Archivo ${attempt.file_name} recibido`,
    });
  }

  events.push({
    type: "EXTRACCION",
    at: row.ingested_at,
    detail: `Extracción completada: ${row.invoice_number ?? "sin número"}`,
  });

  const decisions = db
    .prepare(
      `SELECT verdict, reason_code, explanation, decided_at FROM decisions
       WHERE invoice_id = ? ORDER BY decided_at ASC, id ASC`,
    )
    .all(invoiceId) as Array<DecisionRow>;
  for (const decision of decisions) {
    events.push({
      type: "DECISION",
      at: decision.decided_at,
      detail: `${decision.verdict} ${decision.reason_code}: ${decision.explanation}`,
    });
  }

  const approvals = db
    .prepare(
      `SELECT status, resolved_by, resolved_at, comment FROM approvals
       WHERE invoice_id = ? AND resolved_at IS NOT NULL ORDER BY resolved_at ASC, id ASC`,
    )
    .all(invoiceId) as Array<{
    status: string;
    resolved_by: string | null;
    resolved_at: string | null;
    comment: string | null;
  }>;
  for (const approval of approvals) {
    events.push({
      type: "RESOLUCION",
      at: approval.resolved_at!,
      detail: `${approval.status} por ${approval.resolved_by ?? "desconocido"}${
        approval.comment === null ? "" : `: ${approval.comment}`
      }`,
    });
  }

  events.sort((a, b) => (a.at === b.at ? a.type.localeCompare(b.type) : a.at.localeCompare(b.at)));

  return {
    record: toAuditRecord(row),
    timeline: events,
    resolution:
      row.resolved_by !== null && row.resolved_at !== null
        ? {
            resolved_by: row.resolved_by,
            resolved_at: row.resolved_at,
            comment: row.comment,
          }
        : null,
  };
}
