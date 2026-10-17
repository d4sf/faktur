import { randomUUID } from "node:crypto";

import type Database from "better-sqlite3";

import { ExtractedInvoice } from "../domain/extraction.js";
import { evaluate, type EvaluationContext } from "../domain/ruleEngine.js";
import type { DecisionRow } from "../repositories/decisions.js";
import { getDecision, insertDecision } from "../repositories/decisions.js";
import { getInvoiceRow, updateInvoiceStatus } from "../repositories/invoices.js";
import { getBudgetState, insertLedgerEntry } from "../repositories/ledger.js";
import { getActivePolicySpec } from "../repositories/policies.js";
import { defaultNotifier, dispatchNotification, queueNotification } from "./notifier.js";

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
    budgetState: getBudgetState(db),
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

  const notification = defaultNotifier();
  let notificationId: string | undefined;

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
      insertLedgerEntry({
        invoice_id: invoiceId,
        decision_id: id,
        policy_version: policy.version,
        amount_usd: invoice.total_usd,
      });
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

      notificationId = queueNotification({
        invoice_id: invoiceId,
        decision_id: id,
        channel: notification.channel,
        reason_code: result.reason_code,
        explanation: result.explanation,
        amount_usd: invoice.total_usd,
        ...(extracted.vendor_name === undefined ? {} : { vendor_name: extracted.vendor_name }),
      });
    } else {
      updateInvoiceStatus(invoiceId, "FRENADA", db);
    }

    return id;
  })();

  if (notificationId !== undefined) {
    void dispatchNotification(notificationId, notification.notifier, db);
  }

  return getDecision(decisionId)!;
}
