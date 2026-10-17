import assert from "node:assert/strict";
import test from "node:test";

import { CATEGORIES, loadPolicySpec, parsePolicySpec } from "./policy.js";

test("el JSON congelado valida", () => {
  assert.equal(parsePolicySpec(loadPolicySpec()).success, true);
});

test("los defaults son los del spec", () => {
  const p = loadPolicySpec();
  assert.equal(p.version, "v1");
  assert.equal(p.auto_approval_threshold_usd, 1000);
  assert.equal(p.monthly_budget_usd, 5000);
  assert.equal(p.vendor_drift_factor, 1.4);
  assert.equal(p.min_extraction_confidence, 0.7);
  assert.deepEqual(p.allowed_currencies, ["USD", "MXN", "COP", "EUR"]);
});

test("Marketing sostiene TC-04 y no puede volver a 2500", () => {
  assert.ok(loadPolicySpec().category_budgets.Marketing >= 3500);
});

test("el umbral de confianza esta acotado", () => {
  const base = loadPolicySpec();
  assert.equal(parsePolicySpec({ ...base, min_extraction_confidence: 1.2 }).success, false);
  assert.equal(parsePolicySpec({ ...base, min_extraction_confidence: -0.1 }).success, false);
});

test("toda categoria del enum tiene presupuesto", () => {
  const b = loadPolicySpec().category_budgets;
  for (const c of CATEGORIES) assert.ok(typeof b[c] === "number", c);
});

test("una categoria desconocida se rechaza sin tocar el archivo", () => {
  const base = loadPolicySpec();
  const r = parsePolicySpec({
    ...base,
    category_budgets: { ...base.category_budgets, Cocina: 100 },
  });
  assert.equal(r.success, false);
});

test("loadPolicySpec cachea", () => {
  assert.equal(loadPolicySpec(), loadPolicySpec());
});
