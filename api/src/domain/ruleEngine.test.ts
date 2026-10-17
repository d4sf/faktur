import assert from "node:assert/strict";
import test from "node:test";

import { evaluate } from "./ruleEngine.js";
import type { EvaluableInvoice, EvaluationContext } from "./ruleEngine.js";
import { PolicySpec } from "./policy.js";
import type { Currency } from "./extraction.js";

const policy = PolicySpec.parse({
  version: "v1",
  created_at: "2026-10-17",
  created_by: "test",
  comment: "test",
  auto_approval_threshold_usd: 1000,
  monthly_budget_usd: 5000,
  vendor_drift_factor: 1.4,
  min_extraction_confidence: 0.7,
  allowed_currencies: ["USD", "MXN", "COP", "EUR"],
  category_budgets: {
    Infraestructura: 1500,
    Diseno: 1000,
    Marketing: 4000,
    Legal: 3000,
    Software: 500,
    Retail: 0,
  },
});

function inv(overrides: Partial<EvaluableInvoice> = {}): EvaluableInvoice {
  return {
    invoice_number: "INV-001",
    total_amount: 420,
    currency: "USD",
    vendor_name: "CloudServers Inc",
    vendor_tax_id: "CLOUD-SERVERS-INC",
    due_date: "2026-10-15",
    subtotal: 400,
    tax_amount: 20,
    line_items: [{ description: "hosting", quantity: 1, unit_price: 400, total: 400 }],
    file_hash: "a".repeat(64),
    vendor_id: "v1",
    total_usd: 420,
    fx_rate_used: 1.0,
    extraction_confidence: undefined,
    ...overrides,
  };
}

function ctx(overrides: Partial<EvaluationContext> = {}): EvaluationContext {
  return {
    vendor: { status: "ALLOWLISTED", historical_avg_usd: 420, category: "Infraestructura" },
    existingInvoices: [],
    budgetState: { monthlySpent: 0, monthlyBudget: 5000, categorySpent: {} },
    ...overrides,
  };
}

// --- Task 1: Rules 1-4 ---

test("regla 1a: sin tax_id → FRENAR ERR_INVALID_DATA", () => {
  const r = evaluate(inv({ vendor_tax_id: undefined }), policy, ctx());
  assert.equal(r.verdict, "FRENAR");
  assert.equal(r.reason_code, "ERR_INVALID_DATA");
  assert.match(r.explanation, /identificador fiscal/);
});

test("regla 1a: moneda no permitida → FRENAR ERR_INVALID_DATA", () => {
  const p = { ...policy, allowed_currencies: ["USD", "MXN"] as Currency[] };
  const r = evaluate(inv({ currency: "EUR" }), p, ctx());
  assert.equal(r.verdict, "FRENAR");
  assert.equal(r.reason_code, "ERR_INVALID_DATA");
  assert.match(r.explanation, /moneda/);
});

test("regla 1b: confianza baja → ESCALAR ALERT_LOW_CONFIDENCE", () => {
  const r = evaluate(
    inv({
      extraction_confidence: 0.5,
      field_confidence: {
        invoice_number: 0.95,
        vendor_tax_id: 0.98,
        total_amount: 0.99,
        currency: 1,
        due_date: 0.5,
      },
    }),
    policy,
    ctx(),
  );
  assert.equal(r.verdict, "ESCALAR");
  assert.equal(r.reason_code, "ALERT_LOW_CONFIDENCE");
  assert.match(r.explanation, /due_date/);
  assert.match(r.explanation, /0\.5/);
});

test("regla 1b: sin field_confidence → no dispara confianza", () => {
  const r = evaluate(inv({ extraction_confidence: undefined }), policy, ctx());
  assert.notEqual(r.reason_code, "ALERT_LOW_CONFIDENCE");
});

test("regla 2: hash duplicado → FRENAR ERR_DUPLICATE_INVOICE", () => {
  const r = evaluate(
    inv(),
    policy,
    ctx({
      existingInvoices: [{ file_hash: "a".repeat(64), vendor_id: "v1", invoice_number: "INV-001" }],
    }),
  );
  assert.equal(r.verdict, "FRENAR");
  assert.equal(r.reason_code, "ERR_DUPLICATE_INVOICE");
});

test("regla 2: tupla duplicada → FRENAR ERR_DUPLICATE_INVOICE", () => {
  const r = evaluate(
    inv(),
    policy,
    ctx({
      existingInvoices: [{ file_hash: "b".repeat(64), vendor_id: "v1", invoice_number: "INV-001" }],
    }),
  );
  assert.equal(r.verdict, "FRENAR");
  assert.equal(r.reason_code, "ERR_DUPLICATE_INVOICE");
});

test("regla 2: vendor_id null → salta tupla, solo hash", () => {
  const r = evaluate(
    inv({ vendor_id: null }),
    policy,
    ctx({
      existingInvoices: [{ file_hash: "b".repeat(64), vendor_id: null, invoice_number: "INV-001" }],
    }),
  );
  assert.notEqual(r.reason_code, "ERR_DUPLICATE_INVOICE");
});

test("regla 3: bloqueado → FRENAR ERR_BLACKLISTED_VENDOR", () => {
  const r = evaluate(
    inv(),
    policy,
    ctx({ vendor: { status: "BLOCKLISTED", historical_avg_usd: 0, category: "Retail" } }),
  );
  assert.equal(r.verdict, "FRENAR");
  assert.equal(r.reason_code, "ERR_BLACKLISTED_VENDOR");
});

test("regla 4: proveedor nuevo → ESCALAR ALERT_NEW_VENDOR", () => {
  const r = evaluate(inv(), policy, ctx({ vendor: null }));
  assert.equal(r.verdict, "ESCALAR");
  assert.equal(r.reason_code, "ALERT_NEW_VENDOR");
});

test("regla 4: precedencia sobre regla 5 (desconocido no tiene drift)", () => {
  const r = evaluate(inv({ total_usd: 99999 }), policy, ctx({ vendor: null }));
  assert.equal(r.reason_code, "ALERT_NEW_VENDOR");
});

// --- Task 2: Rules 5-8 ---

test("regla 5: drift → ESCALAR ALERT_VENDOR_DRIFT", () => {
  const r = evaluate(
    inv({ total_usd: 1200 }),
    policy,
    ctx({ vendor: { status: "ALLOWLISTED", historical_avg_usd: 480, category: "Diseno" } }),
  );
  assert.equal(r.verdict, "ESCALAR");
  assert.equal(r.reason_code, "ALERT_VENDOR_DRIFT");
  assert.match(r.explanation, /480/);
  assert.match(r.explanation, /1\.200/);
});

test("regla 5: sin drift → no dispara", () => {
  const r = evaluate(
    inv({ total_usd: 500 }),
    policy,
    ctx({ vendor: { status: "ALLOWLISTED", historical_avg_usd: 480, category: "Diseno" } }),
  );
  assert.notEqual(r.reason_code, "ALERT_VENDOR_DRIFT");
});

test("regla 5: avg = 0 → se salta", () => {
  const r = evaluate(
    inv({ total_usd: 100 }),
    policy,
    ctx({ vendor: { status: "ALLOWLISTED", historical_avg_usd: 0, category: "Diseno" } }),
  );
  assert.notEqual(r.reason_code, "ALERT_VENDOR_DRIFT");
});

test("regla 5: monto menor al promedio → no dispara", () => {
  const r = evaluate(
    inv({ total_usd: 100 }),
    policy,
    ctx({ vendor: { status: "ALLOWLISTED", historical_avg_usd: 480, category: "Diseno" } }),
  );
  assert.notEqual(r.reason_code, "ALERT_VENDOR_DRIFT");
});

test("regla 6a: presupuesto mensual excedido → ESCALAR ALERT_BUDGET_OVERRUN", () => {
  const r = evaluate(
    inv({ total_usd: 100 }),
    policy,
    ctx({ budgetState: { monthlySpent: 4950, monthlyBudget: 5000, categorySpent: {} } }),
  );
  assert.equal(r.verdict, "ESCALAR");
  assert.equal(r.reason_code, "ALERT_BUDGET_OVERRUN");
});

test("regla 6b: presupuesto categoría excedido → ESCALAR ALERT_BUDGET_TIGHT", () => {
  const r = evaluate(
    inv({ total_usd: 950 }),
    policy,
    ctx({
      vendor: { status: "ALLOWLISTED", historical_avg_usd: 850, category: "Diseno" },
      budgetState: { monthlySpent: 0, monthlyBudget: 5000, categorySpent: { Diseno: 850 } },
    }),
  );
  assert.equal(r.verdict, "ESCALAR");
  assert.equal(r.reason_code, "ALERT_BUDGET_TIGHT");
  assert.match(r.explanation, /Diseno/);
});

test("regla 6a precedencia sobre 6b", () => {
  const r = evaluate(
    inv({ total_usd: 100 }),
    policy,
    ctx({
      budgetState: { monthlySpent: 4950, monthlyBudget: 5000, categorySpent: { Diseno: 850 } },
    }),
  );
  assert.equal(r.reason_code, "ALERT_BUDGET_OVERRUN");
});

test("regla 6b: categoría ausente en policy → se salta", () => {
  const r = evaluate(
    inv({ total_usd: 100 }),
    policy,
    ctx({
      vendor: { status: "ALLOWLISTED", historical_avg_usd: 480, category: "Inexistente" },
      budgetState: { monthlySpent: 0, monthlyBudget: 5000, categorySpent: {} },
    }),
  );
  assert.notEqual(r.reason_code, "ALERT_BUDGET_TIGHT");
});

test("regla 6: budget = 0 → cualquier monto positivo excede", () => {
  const r = evaluate(
    inv({ total_usd: 10 }),
    policy,
    ctx({
      vendor: { status: "ALLOWLISTED", historical_avg_usd: 480, category: "Retail" },
      budgetState: { monthlySpent: 0, monthlyBudget: 5000, categorySpent: { Retail: 0 } },
    }),
  );
  assert.equal(r.reason_code, "ALERT_BUDGET_TIGHT");
});

test("regla 7: umbral superado → ESCALAR ALERT_THRESHOLD_EXCEEDED", () => {
  const r = evaluate(
    inv({ total_usd: 3500 }),
    policy,
    ctx({ vendor: { status: "ALLOWLISTED", historical_avg_usd: 10000, category: "Marketing" } }),
  );
  assert.equal(r.verdict, "ESCALAR");
  assert.equal(r.reason_code, "ALERT_THRESHOLD_EXCEEDED");
});

test("regla 7: monto en el umbral exacto → no dispara", () => {
  const r = evaluate(
    inv({ total_usd: 1000 }),
    policy,
    ctx({ vendor: { status: "ALLOWLISTED", historical_avg_usd: 10000, category: "Marketing" } }),
  );
  assert.notEqual(r.reason_code, "ALERT_THRESHOLD_EXCEEDED");
});

test("regla 8: pasa todo → PAGAR SUCCESS_TOUCHLESS_STP", () => {
  const r = evaluate(inv({ total_usd: 420 }), policy, ctx());
  assert.equal(r.verdict, "PAGAR");
  assert.equal(r.reason_code, "SUCCESS_TOUCHLESS_STP");
});

test("umbral alto + duplicado → FRENAR (regla 2 precede a la 7)", () => {
  const r = evaluate(
    inv({ total_usd: 3500 }),
    policy,
    ctx({
      existingInvoices: [{ file_hash: "a".repeat(64), vendor_id: "v1", invoice_number: "INV-001" }],
    }),
  );
  assert.equal(r.verdict, "FRENAR");
  assert.equal(r.reason_code, "ERR_DUPLICATE_INVOICE");
});

test("proveedor bloqueado precede a drift", () => {
  const r = evaluate(
    inv({ total_usd: 99999 }),
    policy,
    ctx({ vendor: { status: "BLOCKLISTED", historical_avg_usd: 0, category: "Retail" } }),
  );
  assert.equal(r.reason_code, "ERR_BLACKLISTED_VENDOR");
});

test("proveedor nuevo precede a drift", () => {
  const r = evaluate(inv({ total_usd: 99999 }), policy, ctx({ vendor: null }));
  assert.equal(r.reason_code, "ALERT_NEW_VENDOR");
});
