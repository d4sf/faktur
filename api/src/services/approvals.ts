import type Database from "better-sqlite3";

import { ExtractedInvoice } from "../domain/extraction.js";
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

/**
 * Re-chequea las reglas 1–3 con la `policy_version` **del caso**, no con la activa (S15).
 *
 * Se evalúan las tres condiciones directamente en vez de correr el motor completo: la regla 1b
 * (confianza baja → ESCALAR) precede a las reglas 2 y 3 y enmascararía un proveedor bloqueado o
 * un duplicado, permitiendo aprobar un freno duro. El presupuesto tampoco participa: aprobar una
 * excepción por umbral o por saldo es justamente lo que el humano autoriza.
 */
function hardRulesBlock(invoiceId: string, policyVersion: string, db: Database.Database): boolean {
  const invoice = getInvoiceRow(invoiceId, db);
  if (invoice === null) return false;

  const extracted = ExtractedInvoice.parse(JSON.parse(invoice.extraction_json));
  const policy = getPolicySpecByVersion(db, policyVersion);

  // Regla 1a: datos críticos ilegibles o moneda fuera de la política.
  if (!extracted.vendor_tax_id || extracted.vendor_tax_id.trim() === "") return true;
  if (!policy.allowed_currencies.includes(extracted.currency as never)) return true;

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

  // Regla 2: hash conocido o (vendor, número) repetido.
  if (existingInvoices.some((e) => e.file_hash === invoice.file_hash)) return true;
  if (
    invoice.vendor_id !== null &&
    existingInvoices.some(
      (e) => e.vendor_id === invoice.vendor_id && e.invoice_number === extracted.invoice_number,
    )
  ) {
    return true;
  }

  // Regla 3: proveedor bloqueado.
  const vendor = db
    .prepare("SELECT status FROM vendors WHERE id = ?")
    .get(invoice.vendor_id ?? "") as { status: "ALLOWLISTED" | "BLOCKLISTED" } | undefined;
  return vendor?.status === "BLOCKLISTED";
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
