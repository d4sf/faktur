import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { closeDb, loadDb } from "../db/index.js";
import { REASON_CODES, ReasonCode, Verdict } from "./decision.js";
import { ExtractedInvoice, globalConfidence } from "./extraction.js";
import { loadPolicySpec } from "./policy.js";
import { evaluate } from "./ruleEngine.js";
import type {
  EvaluableInvoice,
  EvaluationContext,
  ExistingInvoice,
  VendorInfo,
} from "./ruleEngine.js";

const FIXTURES_DIR = fileURLToPath(new URL("../../../fixtures/", import.meta.url));

const FX_RATES: Record<string, number> = {
  USD: 1,
  MXN: 0.055,
  COP: 0.00024,
  EUR: 1.08,
};

type GroundTruthEntry = {
  expected_verdict: Verdict;
  expected_reason_code: ReasonCode;
  dependsOn: string[];
};

type VendorRow = {
  id: string;
  tax_id: string;
  category: string;
  status: "ALLOWLISTED" | "BLOCKLISTED";
  historical_avg_usd: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function fixtureNames(): string[] {
  return readdirSync(FIXTURES_DIR)
    .filter((f) => /^TC-\d+\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

function hashOf(file: string): string {
  return createHash("sha256")
    .update(readFileSync(join(FIXTURES_DIR, `${file}.json`)))
    .digest("hex");
}

/** Orden topológico por `dependsOn`; desempate por id para que el resultado no dependa del orden de archivo. */
function topologicalOrder(groundTruth: Record<string, GroundTruthEntry>): string[] {
  const ordered: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(tc: string): void {
    if (visited.has(tc)) return;
    assert.ok(!visiting.has(tc), `dependencia circular en ${tc}`);
    visiting.add(tc);
    for (const dep of groundTruth[tc].dependsOn) visit(dep);
    visiting.delete(tc);
    visited.add(tc);
    ordered.push(tc);
  }

  for (const tc of Object.keys(groundTruth).sort()) visit(tc);
  return ordered;
}

test("el motor reproduce ground_truth.json sin LLM y sin red", () => {
  const policy = loadPolicySpec();
  const groundTruth = readJson(join(FIXTURES_DIR, "ground_truth.json")) as Record<
    string,
    GroundTruthEntry
  >;
  const fixtures = fixtureNames();
  assert.deepEqual(
    fixtures,
    Object.keys(groundTruth).sort(),
    "fixtures y ground truth deben empatar",
  );

  const db = loadDb(":memory:");
  try {
    const vendors = new Map<string, VendorRow>();
    for (const row of db
      .prepare("SELECT id, tax_id, category, status, historical_avg_usd FROM vendors")
      .all() as VendorRow[]) {
      vendors.set(row.tax_id, row);
    }

    const extracted = new Map<string, ExtractedInvoice>();
    for (const tc of fixtures) {
      extracted.set(tc, ExtractedInvoice.parse(readJson(join(FIXTURES_DIR, `${tc}.json`))));
    }

    const invoiceOf = (tc: string): EvaluableInvoice => {
      const invoice = extracted.get(tc)!;
      const vendor = invoice.vendor_tax_id ? vendors.get(invoice.vendor_tax_id) : undefined;
      const fxRate = FX_RATES[invoice.currency];
      assert.ok(fxRate !== undefined, `${tc}: moneda sin tasa FX local`);
      return {
        ...invoice,
        file_hash: hashOf(tc),
        vendor_id: vendor?.id ?? null,
        total_usd: round2(invoice.total_amount * fxRate),
        fx_rate_used: fxRate,
        extraction_confidence: globalConfidence(invoice.field_confidence),
      };
    };

    const vendorInfoOf = (tc: string): VendorInfo | null => {
      const invoice = extracted.get(tc)!;
      const vendor = invoice.vendor_tax_id ? vendors.get(invoice.vendor_tax_id) : undefined;
      if (vendor === undefined) return null;
      return {
        status: vendor.status,
        historical_avg_usd: vendor.historical_avg_usd,
        category: vendor.category,
      };
    };

    /**
     * Cada fixture se evalúa en aislamiento con presupuesto base fijo. Solo los `dependsOn`
     * montan pre-estado: TC-03 la factura previa (duplicado) y TC-10 el gasto de categoría
     * que deja el saldo en negativo. Así el ground truth no depende del orden de archivo.
     */
    const contextFor = (tc: string): EvaluationContext => {
      const existingInvoices: ExistingInvoice[] = [];
      const categorySpent: Record<string, number> = {};
      let monthlySpent = 0;

      for (const dep of groundTruth[tc].dependsOn) {
        const depInvoice = invoiceOf(dep);
        const depVendor = vendorInfoOf(dep);
        existingInvoices.push({
          file_hash: depInvoice.file_hash,
          vendor_id: depInvoice.vendor_id,
          invoice_number: depInvoice.invoice_number,
        });
        if (groundTruth[dep].expected_verdict === "PAGAR" && depVendor !== null) {
          monthlySpent = round2(monthlySpent + depInvoice.total_usd);
          categorySpent[depVendor.category] = round2(
            (categorySpent[depVendor.category] ?? 0) + depInvoice.total_usd,
          );
        }
      }

      return {
        vendor: vendorInfoOf(tc),
        existingInvoices,
        budgetState: {
          monthlySpent,
          monthlyBudget: policy.monthly_budget_usd,
          categorySpent,
        },
      };
    };

    const ordered = topologicalOrder(groundTruth);
    const produced = new Set<ReasonCode>();

    for (const tc of ordered) {
      const result = evaluate(invoiceOf(tc), policy, contextFor(tc));
      produced.add(result.reason_code);
      assert.deepEqual(
        { verdict: result.verdict, reason_code: result.reason_code },
        {
          verdict: groundTruth[tc].expected_verdict,
          reason_code: groundTruth[tc].expected_reason_code,
        },
        `${tc}: ${result.explanation}`,
      );
    }

    assert.deepEqual(
      [...produced].sort(),
      [...REASON_CODES].sort(),
      "el set de fixtures debe ejercitar todos los reason_code del enum",
    );
  } finally {
    closeDb();
  }
});
