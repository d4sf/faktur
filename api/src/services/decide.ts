import { randomUUID } from "node:crypto";

import type Database from "better-sqlite3";

import { ExtractedInvoice } from "../domain/extraction.js";
import { evaluate, type BudgetState, type EvaluationContext } from "../domain/ruleEngine.js";
import type { DecisionRow } from "../repositories/decisions.js";
import { getDecision, insertDecision } from "../repositories/decisions.js";
import { getInvoiceRow, updateInvoiceStatus } from "../repositories/invoices.js";
import { getActivePolicySpec } from "../repositories/policies.js";

function budgetState(db: Database.Database, monthlyBudget: number): BudgetState {
  const monthly = db
    .prepare("SELECT COALESCE(SUM(amount_usd), 0) AS spent FROM ledger_entries")
    .get() as { spent: number };
  const byCategory = db
    .prepare(
      `SELECT v.category AS category, SUM(l.amount_usd) AS spent
       FROM ledger_entries l
       JOIN invoices i ON i.id = l.invoice_id
       JOIN vendors v ON v.id = i.vendor_id
       GROUP BY v.category`,
    )
    .all() as Array<{ category: string; spent: number }>;

  return {
    monthlySpent: monthly.spent,
    monthlyBudget,
    categorySpent: Object.fromEntries(byCategory.map((r) => [r.category, r.spent])),
  };
}

/**
 * Corre el motor contra la política activa y persiste la decisión en una sola transacción.
 *
 * - `PAGAR` → `DECIDIDA`; el ledger lo escribe T16, no este servicio.
 * - `ESCALAR` → `PENDIENTE_APROBACION` + una fila `PENDIENTE` en `approvals`.
 * - `FRENAR` → `FRENADA` y **ninguna** bandeja (RI-3).
 *
 * Re-evaluar inserta una fila nueva; `decisions` es append-only (RI-8).
 */
export function decideInvoice(invoiceId: string, db: Database.Database): DecisionRow {
  const invoice = getInvoiceRow(invoiceId, db);
  if (invoice === null) throw new Error("invoice_not_found");
  if (invoice.status !== "EXTRAIDA") throw new Error("status_transition_invalid");

  const policy = getActivePolicySpec(db);
  const extracted = ExtractedInvoice.parse(JSON.parse(invoice.extraction_json));

  const vendorRow = db
    .prepare("SELECT status, historical_avg_usd, category FROM vendors WHERE id = ?")
    .get(invoice.vendor_id ?? "") as
    | { status: "ALLOWLISTED" | "BLOCKLISTED"; historical_avg_usd: number; category: string }
    | undefined;

  const existingInvoices = db
    .prepare(
      `SELECT file_hash, vendor_id, invoice_number FROM invoices
       WHERE id != ? AND invoice_number IS NOT NULL`,
    )
    .all(invoiceId) as Array<{
    file_hash: string;
    vendor_id: string | null;
    invoice_number: string;
  }>;

  const context: EvaluationContext = {
    vendor:
      vendorRow === undefined
        ? null
        : {
            status: vendorRow.status,
            historical_avg_usd: vendorRow.historical_avg_usd,
            category: vendorRow.category,
          },
    existingInvoices,
    budgetState: budgetState(db, policy.monthly_budget_usd),
  };

  const result = evaluate(
    {
      ...extracted,
      file_hash: invoice.file_hash,
      vendor_id: invoice.vendor_id,
      total_usd: invoice.total_usd,
      fx_rate_used: invoice.fx_rate_used,
      extraction_confidence: invoice.extraction_confidence ?? undefined,
    },
    policy,
    context,
  );

  const decisionId = db.transaction(() => {
    const id = insertDecision({
      invoice_id: invoiceId,
      ingest_attempt_id: null,
      verdict: result.verdict,
      reason_code: result.reason_code,
      explanation: result.explanation,
      policy_version: policy.version,
      amount_usd_evaluated: invoice.total_usd,
      decided_by: "AGENTE",
    });

    if (result.verdict === "PAGAR") {
      updateInvoiceStatus(invoiceId, "DECIDIDA", db);
    } else if (result.verdict === "ESCALAR") {
      updateInvoiceStatus(invoiceId, "PENDIENTE_APROBACION", db);
      db.prepare(
        `INSERT INTO approvals (id, decision_id, invoice_id, status, requested_at, resolved_by,
          resolved_at, comment, override_with_overbudget)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      ).run(
        randomUUID(),
        id,
        invoiceId,
        "PENDIENTE",
        new Date().toISOString(),
        null,
        null,
        null,
        0,
      );
    } else {
      updateInvoiceStatus(invoiceId, "FRENADA", db);
    }

    return id;
  })();

  return getDecision(decisionId)!;
}
