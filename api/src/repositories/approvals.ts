import type Database from "better-sqlite3";

import type { ApprovalStatus } from "../domain/audit.js";

export type ApprovalListRow = {
  id: string;
  invoice_id: string;
  vendor_name: string | null;
  amount_usd: number;
  reason_code: string;
  explanation: string;
  requested_at: string;
};

export type ApprovalRow = {
  id: string;
  decision_id: string;
  invoice_id: string;
  status: ApprovalStatus;
  requested_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  comment: string | null;
  override_with_overbudget: number;
};

const APPROVAL_COLUMNS = `id, decision_id, invoice_id, status, requested_at, resolved_by,
  resolved_at, comment, override_with_overbudget`;

export function getApproval(id: string, db: Database.Database): ApprovalRow | null {
  const row = db.prepare(`SELECT ${APPROVAL_COLUMNS} FROM approvals WHERE id = ?`).get(id);
  return (row as ApprovalRow | undefined) ?? null;
}

export function listApprovals(db: Database.Database, status?: ApprovalStatus): ApprovalListRow[] {
  const where = status === undefined ? "" : "WHERE a.status = ?";
  const statement = db.prepare(
    `SELECT a.id AS id, a.invoice_id AS invoice_id, v.display_name AS vendor_name,
      d.amount_usd_evaluated AS amount_usd, d.reason_code AS reason_code,
      d.explanation AS explanation, a.requested_at AS requested_at
     FROM approvals a
     JOIN decisions d ON d.id = a.decision_id
     JOIN invoices i ON i.id = a.invoice_id
     LEFT JOIN vendors v ON v.id = i.vendor_id
     ${where}
     ORDER BY a.requested_at DESC, a.id DESC`,
  );

  return (status === undefined ? statement.all() : statement.all(status)) as ApprovalListRow[];
}

/**
 * La transición `PENDIENTE -> APROBADA | NEGADA` es única (RI-4). El `WHERE status = 'PENDIENTE'`
 * hace que un segundo POST no cambie ni el estado ni `resolved_at`; `changes === 0` es la señal
 * de idempotencia que lee el servicio.
 */
export function resolveApprovalRow(
  id: string,
  input: {
    status: Exclude<ApprovalStatus, "PENDIENTE">;
    resolved_by: string;
    comment: string | null;
    resolved_at: string;
  },
  db: Database.Database,
): number {
  return db
    .prepare(
      `UPDATE approvals SET status = ?, resolved_by = ?, resolved_at = ?, comment = ?
       WHERE id = ? AND status = 'PENDIENTE'`,
    )
    .run(input.status, input.resolved_by, input.resolved_at, input.comment, id).changes;
}

export function findLedgerByDecision(decisionId: string, db: Database.Database): string | null {
  const row = db.prepare("SELECT id FROM ledger_entries WHERE decision_id = ?").get(decisionId) as
    { id: string } | undefined;
  return row?.id ?? null;
}
