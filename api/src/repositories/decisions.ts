import { randomUUID } from "node:crypto";

import { getDb } from "../db/index.js";
import type { ReasonCode, Verdict } from "../domain/decision.js";

/**
 * La fila tal como vive en `decisions` (snake_case) más el `id` generado por la app.
 *
 * `invoice_id` es anulable porque una decisión de reenvío duplicado se ancla únicamente al
 * `ingest_attempt_id` (RI-3/S19). El `CHECK` de la tabla exige exactamente uno de los dos.
 */
export type DecisionRow = {
  id: string;
  invoice_id: string | null;
  ingest_attempt_id: string | null;
  verdict: Verdict;
  reason_code: ReasonCode;
  explanation: string;
  policy_version: string;
  amount_usd_evaluated: number;
  decided_by: "AGENTE" | "HUMANO";
  decided_at: string;
};

/**
 * `decided_at` es opcional en la entrada: el repositorio sella el timestamp ISO-8601 UTC.
 * `policy_version` es obligatoria y nunca se deriva acá: la congela quien decide.
 */
export type NewDecision = Omit<DecisionRow, "id" | "decided_at"> & {
  id?: string;
  decided_at?: string;
};

const COLUMNS = `id, invoice_id, ingest_attempt_id, verdict, reason_code, explanation,
  policy_version, amount_usd_evaluated, decided_by, decided_at`;

function anchorIsValid(row: NewDecision): boolean {
  const hasInvoice = typeof row.invoice_id === "string" && row.invoice_id.length > 0;
  const hasAttempt = typeof row.ingest_attempt_id === "string" && row.ingest_attempt_id.length > 0;
  return hasInvoice !== hasAttempt;
}

/**
 * Inserta una decisión inmutable. Toda re-evaluación es una fila nueva (RI-8): este módulo no
 * expone `UPDATE` ni `DELETE` sobre `decisions`.
 */
export function insertDecision(row: NewDecision): string {
  if (!anchorIsValid(row)) throw new Error("decision_anchor_invalid");

  const id = row.id ?? randomUUID();
  getDb()
    .prepare(`INSERT INTO decisions (${COLUMNS}) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(
      id,
      row.invoice_id,
      row.ingest_attempt_id,
      row.verdict,
      row.reason_code,
      row.explanation,
      row.policy_version,
      row.amount_usd_evaluated,
      row.decided_by,
      row.decided_at ?? new Date().toISOString(),
    );
  return id;
}

export function getDecision(id: string): DecisionRow | null {
  const row = getDb().prepare(`SELECT ${COLUMNS} FROM decisions WHERE id = ?`).get(id);
  return (row as DecisionRow | undefined) ?? null;
}

export function listDecisionsByInvoice(invoiceId: string): DecisionRow[] {
  return getDb()
    .prepare(
      `SELECT ${COLUMNS} FROM decisions WHERE invoice_id = ? ORDER BY decided_at DESC, id DESC`,
    )
    .all(invoiceId) as DecisionRow[];
}

/** La decisión anclada a un intento (reenvío duplicado). Un intento produce a lo sumo una. */
export function getDecisionForAttempt(attemptId: string): DecisionRow | null {
  const row = getDb()
    .prepare(
      `SELECT ${COLUMNS} FROM decisions WHERE ingest_attempt_id = ? ORDER BY decided_at DESC, id DESC LIMIT 1`,
    )
    .get(attemptId);
  return (row as DecisionRow | undefined) ?? null;
}
