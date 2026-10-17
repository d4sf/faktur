import type Database from "better-sqlite3";

import { ExtractedInvoice } from "../domain/extraction.js";
import { PolicySpec } from "../domain/policy.js";
import { evaluate } from "../domain/ruleEngine.js";
import type { Verdict } from "../domain/decision.js";
import { getInvoiceRow } from "../repositories/invoices.js";
import { getBudgetState } from "../repositories/ledger.js";
import { createPolicyVersion, getActivePolicySpec } from "../repositories/policies.js";

export class InvalidPolicyError extends Error {
  constructor(detail: string) {
    super(`invalid_policy: ${detail}`);
    this.name = "InvalidPolicyError";
  }
}

export const CandidatePolicySchema = PolicySpec.omit({ version: true });

export function readPolicy(db: Database.Database): PolicySpec {
  return getActivePolicySpec(db);
}

export function updatePolicy(raw: unknown, db: Database.Database): PolicySpec {
  const parsed = CandidatePolicySchema.safeParse(raw);
  if (!parsed.success) {
    throw new InvalidPolicyError(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const { version } = createPolicyVersion(db, parsed.data);
  return { ...parsed.data, version } as PolicySpec;
}

export type AffectedInvoice = {
  invoice_id: string;
  before: Verdict;
  after: Verdict;
  reason_code: string;
};

function evaluableOf(invoiceId: string, db: Database.Database) {
  const invoice = getInvoiceRow(invoiceId, db);
  if (invoice === null) return null;

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

  return {
    invoice: {
      ...extracted,
      file_hash: invoice.file_hash,
      vendor_id: invoice.vendor_id,
      total_usd: invoice.total_usd,
      fx_rate_used: invoice.fx_rate_used,
      extraction_confidence: invoice.extraction_confidence ?? undefined,
    },
    context: {
      vendor:
        vendor === undefined
          ? null
          : {
              status: vendor.status,
              historical_avg_usd: vendor.historical_avg_usd,
              category: vendor.category,
            },
      existingInvoices,
      budgetState: getBudgetState(db),
    },
  };
}

/**
 * Evalúa una política hipotética contra las facturas existentes sin escribir nada: ni versión,
 * ni decisiones. Devuelve solo las facturas cuyo veredicto cambia.
 */
export function previewPolicy(raw: unknown, db: Database.Database): AffectedInvoice[] {
  const parsed = CandidatePolicySchema.safeParse(raw);
  if (!parsed.success) {
    throw new InvalidPolicyError(parsed.error.issues.map((i) => i.message).join("; "));
  }

  const hypothetical: PolicySpec = { ...parsed.data, version: "v-preview" } as PolicySpec;
  const current = getActivePolicySpec(db);
  const ids = db.prepare("SELECT id FROM invoices ORDER BY id ASC").all() as Array<{ id: string }>;

  const affected: AffectedInvoice[] = [];
  for (const { id } of ids) {
    const evaluable = evaluableOf(id, db);
    if (evaluable === null) continue;

    const before = evaluate(evaluable.invoice, current, evaluable.context);
    const after = evaluate(evaluable.invoice, hypothetical, evaluable.context);
    if (before.verdict !== after.verdict) {
      affected.push({
        invoice_id: id,
        before: before.verdict,
        after: after.verdict,
        reason_code: after.reason_code,
      });
    }
  }
  return affected;
}
