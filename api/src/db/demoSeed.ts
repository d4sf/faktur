import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type Database from "better-sqlite3";

import type { Verdict } from "../domain/decision.js";
import { ExtractedInvoice } from "../domain/extraction.js";
import { getDecision } from "../repositories/decisions.js";
import { findAttemptByHashAndName } from "../repositories/ingest.js";
import { resolveApproval } from "../services/approvals.js";
import { decideInvoice } from "../services/decide.js";
import { persistExtraction } from "../services/extract.js";
import { ingestFile } from "../services/ingest.js";

const FIXTURES_DIR = fileURLToPath(new URL("../../../fixtures/", import.meta.url));

/** Las ESCALAR que quedan en la bandeja de la demo. Las demás escaladas se resuelven negadas. */
const RESOLVE_NEGATED = new Set(["TC-05", "TC-12"]);

type GroundTruthEntry = {
  expected_verdict: Verdict;
  expected_reason_code: string;
  dependsOn: string[];
};

function groundTruth(): Record<string, GroundTruthEntry> {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, "ground_truth.json"), "utf8")) as Record<
    string,
    GroundTruthEntry
  >;
}

function topologicalOrder(truth: Record<string, GroundTruthEntry>): string[] {
  const ordered: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(tc: string): void {
    if (visited.has(tc)) return;
    if (visiting.has(tc)) throw new Error(`demo_seed_cycle: ${tc}`);
    visiting.add(tc);
    for (const dep of truth[tc].dependsOn) visit(dep);
    visiting.delete(tc);
    visited.add(tc);
    ordered.push(tc);
  }

  for (const tc of Object.keys(truth).sort()) visit(tc);
  return ordered;
}

function verdictForExistingAttempt(
  attemptId: string,
  invoiceId: string | null,
  db: Database.Database,
): string {
  if (invoiceId !== null) {
    const row = db
      .prepare(
        `SELECT id FROM decisions WHERE invoice_id = ?
         ORDER BY decided_at DESC, id DESC LIMIT 1`,
      )
      .get(invoiceId) as { id: string } | undefined;
    return row === undefined ? "DESCONOCIDO" : (getDecision(row.id)?.verdict ?? "DESCONOCIDO");
  }

  const row = db
    .prepare(
      `SELECT verdict FROM decisions WHERE ingest_attempt_id = ?
       ORDER BY decided_at DESC, id DESC LIMIT 1`,
    )
    .get(attemptId) as { verdict: string } | undefined;
  return row?.verdict ?? "DESCONOCIDO";
}

/**
 * Carga el set demo contra una base con schema+seed usando el flujo real (hash → intento →
 * extracción → persistencia → decisión). No escribe facturas ni decisiones a mano.
 *
 * Idempotente por `(hash, nombre de archivo)`: una segunda corrida no duplica intentos ni
 * facturas. TC-03 comparte el hash de TC-01 a propósito: es el reenvío que debe quedar
 * FRENADO como intento duplicado.
 *
 * TC-04, TC-06, TC-07 y TC-10 quedan `PENDIENTE_APROBACION` para la bandeja; TC-05 y TC-12
 * (las otras ESCALAR) se niegan para que el resto quede resuelto.
 */
export function seedDemoSet(db: Database.Database): {
  seeded: number;
  verdicts: Record<string, string>;
} {
  const truth = groundTruth();
  const verdicts: Record<string, string> = {};
  let seeded = 0;

  for (const tc of topologicalOrder(truth)) {
    const fileName = `${tc}.json`;
    const buffer = readFileSync(join(FIXTURES_DIR, fileName));
    const hash = createHash("sha256").update(buffer).digest("hex");

    const existing = findAttemptByHashAndName(hash, fileName);
    if (existing !== null) {
      seeded += 1;
      verdicts[tc] = verdictForExistingAttempt(existing.id, existing.invoice_id, db);
      continue;
    }

    const result = ingestFile({ buffer, fileName, mimeType: "application/json" });
    seeded += 1;

    if (result.decision !== undefined) {
      verdicts[tc] = result.decision.verdict;
      continue;
    }

    const extracted = ExtractedInvoice.parse(JSON.parse(buffer.toString("utf8")));
    const { invoice_id } = persistExtraction(result.attempt_id, extracted, db);
    const decision = decideInvoice(invoice_id, db);
    verdicts[tc] = decision.verdict;

    if (RESOLVE_NEGATED.has(tc)) {
      const approval = db
        .prepare("SELECT id FROM approvals WHERE invoice_id = ? AND status = 'PENDIENTE'")
        .get(invoice_id) as { id: string } | undefined;
      if (approval !== undefined) {
        resolveApproval(approval.id, { approve: false, resolved_by: "demo-seed" }, db);
      }
    }
  }

  return { seeded, verdicts };
}
