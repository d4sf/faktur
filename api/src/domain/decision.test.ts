import assert from "node:assert/strict";
import test from "node:test";

import { Decision, INVOICE_STATUSES, InvoiceStatus, REASON_CODES } from "./decision.js";

test("el enum de reason_code tiene diez entradas", () => {
  assert.equal(REASON_CODES.length, 10);
});

test("ERR_BUDGET_OVERRUN no esta en el enum", () => {
  // El Set<string> es a proposito: `REASON_CODES.includes("ERR_BUDGET_OVERRUN")` no compila,
  // porque TypeScript narrowea el argumento contra el literal del `as const` y el codigo que
  // el test quiere comprobar ausente es justamente el que no es miembro del tuple.
  assert.equal(new Set<string>(REASON_CODES).has("ERR_BUDGET_OVERRUN"), false);
});

test("InvoiceStatus tiene los siete estados sin tilde", () => {
  assert.equal(INVOICE_STATUSES.length, 7);
  assert.deepEqual(INVOICE_STATUSES, [
    "RECIBIDA",
    "EXTRAIDA",
    "DECIDIDA",
    "PENDIENTE_APROBACION",
    "APROBADA",
    "NEGADA",
    "FRENADA",
  ]);
});

test("un motivo vacio se rechaza", () => {
  const base = {
    invoice_id: "i1",
    ingest_attempt_id: null,
    verdict: "PAGAR",
    reason_code: "SUCCESS_TOUCHLESS_STP",
    policy_version: "v1",
    amount_usd_evaluated: 100,
    decided_by: "AGENTE",
  };
  assert.equal(Decision.safeParse({ ...base, explanation: "dentro de politica" }).success, true);
  assert.equal(Decision.safeParse({ ...base, explanation: "" }).success, false);
});

test("un veredicto fuera del enum se rechaza", () => {
  assert.equal(InvoiceStatus.safeParse("EXTRAÍDA").success, false);
  assert.equal(InvoiceStatus.safeParse("EXTRAIDA").success, true);
});
