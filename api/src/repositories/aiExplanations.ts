import { randomUUID } from "node:crypto";

import type Database from "better-sqlite3";

export type AiExplanationRow = {
  id: string;
  invoice_id: string;
  decision_id: string;
  policy_version: string;
  model: string;
  prompt_version: string;
  explanation: string;
  created_at: string;
};

export type NewAiExplanation = Omit<AiExplanationRow, "id"> & { id?: string };

const COLUMNS = `id, invoice_id, decision_id, policy_version, model, prompt_version, explanation, created_at`;

export function insertAiExplanation(row: NewAiExplanation, db: Database.Database): string {
  const id = row.id ?? randomUUID();
  db.prepare(`INSERT INTO ai_explanations (${COLUMNS}) VALUES (?,?,?,?,?,?,?,?)`).run(
    id,
    row.invoice_id,
    row.decision_id,
    row.policy_version,
    row.model,
    row.prompt_version,
    row.explanation,
    row.created_at,
  );
  return id;
}

export function getLatestAiExplanationByDecision(
  decisionId: string,
  db: Database.Database,
): AiExplanationRow | null {
  const row = db
    .prepare(
      `SELECT ${COLUMNS} FROM ai_explanations WHERE decision_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .get(decisionId);
  return (row as AiExplanationRow | undefined) ?? null;
}

export function getLatestAiExplanationByInvoice(
  invoiceId: string,
  db: Database.Database,
): AiExplanationRow | null {
  const row = db
    .prepare(
      `SELECT ${COLUMNS} FROM ai_explanations WHERE invoice_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .get(invoiceId);
  return (row as AiExplanationRow | undefined) ?? null;
}
