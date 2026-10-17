import type Database from "better-sqlite3";

import { ExtractedInvoice } from "../domain/extraction.js";
import { evaluate } from "../domain/ruleEngine.js";
import type { ApprovalStatus } from "../domain/audit.js";
import {
  findLedgerByDecision,
  getApproval,
  resolveApprovalRow,
} from "../repositories/approvals.js";
import { getDecision } from "../repositories/decisions.js";
import { getInvoiceRow, updateInvoiceStatus } from "../repositories/invoices.js";
import { insertLedgerEntry } from "../repositories/ledger.js";
import { getPolicySpecByVersion } from "../repositories/policies.js";

export type ResolveInput = {
  approve: boolean;
  resolved_by: string;
  comment?: string;
};

export type ResolveResult = {
  status: Exclude<ApprovalStatus, "PENDIENTE">;
  ledger?: string;
};

export class ApprovalError extends Error {
  constructor(readonly code: "not_found" | "invoice_not_escalated" | "rules_block_approval") {
    super(code);
    this.name = "ApprovalError";
  }
}

const HARD_STOPS = new Set(["ERR_INVALID_DATA", "ERR_DUPLICATE_INVOICE", "ERR_BLACKLISTED_VENDOR"]);

/**
 * Re-chequea las reglas 1–3 con la `policy_version` **del caso**, no con la activa (S15).
 * El presupuesto no participa: aprobar una excepción por umbral o por saldo es justamente lo
 * que el humano está autorizando.
 */
function hardRulesBlock(invoiceId: string, policyVersion: string, db: Database.Database): boolean {
  const invoice = getInvoiceRow(invoiceId, db);
  if (invoice === null) return false;

  const extracted = ExtractedInvoice.parse(JSON.parse(invoice.extraction_json));
  const vendor = db
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

  const result = evaluate(
    {
      ...extracted,
      file_hash: invoice.file_hash,
      vendor_id: invoice.vendor_id,
      total_usd: invoice.total_usd,
      fx_rate_used: invoice.fx_rate_used,
      extraction_confidence: invoice.extraction_confidence ?? undefined,
    },
    getPolicySpecByVersion(db, policyVersion),
    {
      vendor:
        vendor === undefined
          ? null
          : {
              status: vendor.status,
              historical_avg_usd: vendor.historical_avg_usd,
              category: vendor.category,
            },
      existingInvoices,
      budgetState: { monthlySpent: 0, monthlyBudget: Number.MAX_SAFE_INTEGER, categorySpent: {} },
    },
  );

  return result.verdict === "FRENAR" && HARD_STOPS.has(result.reason_code);
}

/**
 * Cierre atómico de una aprobación: re-chequeo, ledger, aprobación y estado de la factura en
 * una sola transacción (S12/S15).
 *
 * - Ya resuelta: devuelve el mismo resultado sin volver a escribir (doble clic idempotente).
 * - `approve` con reglas 1–3 disparando: 409 `rules_block_approval`, no habilita PAGAR.
 * - `approve` permitido: escribe ledger una vez y deja la factura `APROBADA`.
 * - `!approve`: `NEGADA` + factura `FRENADA`, sin ledger.
 */
export function resolveApproval(
  id: string,
  input: ResolveInput,
  db: Database.Database,
): ResolveResult {
  return db.transaction((): ResolveResult => {
    const approval = getApproval(id, db);
    if (approval === null) throw new ApprovalError("not_found");

    const decision = getDecision(approval.decision_id);
    if (decision === null) throw new ApprovalError("not_found");

    if (approval.status !== "PENDIENTE") {
      return {
        status: approval.status as Exclude<ApprovalStatus, "PENDIENTE">,
        ledger: findLedgerByDecision(approval.decision_id, db) ?? undefined,
      };
    }

    const invoice = getInvoiceRow(approval.invoice_id, db);
    if (invoice === null) throw new ApprovalError("not_found");
    if (invoice.status !== "PENDIENTE_APROBACION") {
      throw new ApprovalError("invoice_not_escalated");
    }

    if (input.approve && hardRulesBlock(invoice.id, decision.policy_version, db)) {
      throw new ApprovalError("rules_block_approval");
    }

    const resolvedAt = new Date().toISOString();
    const status = input.approve ? "APROBADA" : "NEGADA";
    const changes = resolveApprovalRow(
      id,
      {
        status,
        resolved_by: input.resolved_by,
        comment: input.comment ?? null,
        resolved_at: resolvedAt,
      },
      db,
    );

    if (changes === 0) {
      const current = getApproval(id, db)!;
      return {
        status: current.status as Exclude<ApprovalStatus, "PENDIENTE">,
        ledger: findLedgerByDecision(approval.decision_id, db) ?? undefined,
      };
    }

    if (!input.approve) {
      updateInvoiceStatus(invoice.id, "FRENADA", db);
      return { status: "NEGADA" };
    }

    const ledger =
      insertLedgerEntry({
        invoice_id: invoice.id,
        decision_id: decision.id,
        policy_version: decision.policy_version,
        amount_usd: decision.amount_usd_evaluated,
      }) ?? findLedgerByDecision(decision.id, db);

    updateInvoiceStatus(invoice.id, "APROBADA", db);
    return { status: "APROBADA", ledger: ledger ?? undefined };
  })();
}
