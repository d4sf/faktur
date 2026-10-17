import assert from "node:assert/strict";
import test from "node:test";

import {
  CONFIDENCE_FIELDS,
  ExtractedInvoice,
  FieldConfidence,
  globalConfidence,
} from "./extraction.js";

const full = {
  invoice_number: "INV-9022",
  vendor_name: "CloudServers Inc",
  vendor_tax_id: "CLOUD-SERVERS-INC",
  issue_date: "2026-10-01",
  due_date: "2026-10-15",
  currency: "USD",
  subtotal: 400,
  tax_amount: 20,
  total_amount: 420,
  line_items: [{ description: "servidor", quantity: 1, unit_price: 400, total: 400 }],
  field_confidence: {
    invoice_number: 0.95,
    vendor_tax_id: 0.98,
    total_amount: 0.99,
    currency: 1,
    due_date: 0.9,
  },
};

/**
 * Saca una clave sin destructurar. El plan usaba `const { [key]: _drop, ...rest } = full`, y la
 * config de ESLint del repo no ignora los prefijos `_`, asi que `no-unused-vars` lo rechaza.
 * `delete` sobre una copia hace lo mismo y no deja variables muertas.
 */
function sinClave(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const copia = { ...obj };
  delete copia[key];
  return copia;
}

test("una factura completa valida", () => {
  assert.equal(ExtractedInvoice.safeParse(full).success, true);
});

test("sin folio, monto o moneda se rechaza", () => {
  for (const key of ["invoice_number", "total_amount", "currency"]) {
    assert.equal(ExtractedInvoice.safeParse(sinClave(full, key)).success, false, key);
  }
});

test("sin tax_id valida: TC-08 lo frena el motor, no el parser", () => {
  const r = ExtractedInvoice.safeParse(sinClave(full, "vendor_tax_id"));
  assert.equal(r.success, true);
});

test("field_confidence exige los cinco campos", () => {
  assert.equal(CONFIDENCE_FIELDS.length, 5);
  for (const key of CONFIDENCE_FIELDS) {
    const fc = sinClave(full.field_confidence, key);
    const r = ExtractedInvoice.safeParse({ ...full, field_confidence: fc });
    assert.equal(r.success, false, key);
  }
});

test("una confianza fuera de 0..1 se rechaza", () => {
  for (const mala of [-0.1, 1.1]) {
    const r = ExtractedInvoice.safeParse({
      ...full,
      field_confidence: { ...full.field_confidence, currency: mala },
    });
    assert.equal(r.success, false, String(mala));
  }
});

test("la confianza global es el minimo de los cinco", () => {
  const fc: FieldConfidence = {
    invoice_number: 0.95,
    vendor_tax_id: 0.6,
    total_amount: 0.99,
    currency: 1,
    due_date: 0.9,
  };
  assert.equal(globalConfidence(fc), 0.6);
});

test("sin field_confidence la confianza no lanza, devuelve undefined", () => {
  const r = ExtractedInvoice.safeParse(sinClave(full, "field_confidence"));
  assert.equal(r.success, true);
  assert.equal(globalConfidence(r.data?.field_confidence), undefined);
  assert.equal(globalConfidence(undefined), undefined);
});

test("la moneda se normaliza", () => {
  for (const raw of ["usd", " USD ", "USD"]) {
    const r = ExtractedInvoice.safeParse({ ...full, currency: raw });
    assert.equal(r.success, true, raw);
    assert.equal(r.data?.currency, "USD", raw);
  }
  assert.equal(ExtractedInvoice.safeParse({ ...full, currency: "BTC" }).success, false);
});

test("las fechas son ISO estrictas", () => {
  assert.equal(ExtractedInvoice.safeParse({ ...full, due_date: "2026-10-15" }).success, true);
  assert.equal(ExtractedInvoice.safeParse({ ...full, due_date: "15/10/2026" }).success, false);
  assert.equal(ExtractedInvoice.safeParse({ ...full, issue_date: "2026-13-01" }).success, false);
});

test("un monto negativo se rechaza", () => {
  assert.equal(ExtractedInvoice.safeParse({ ...full, total_amount: -1 }).success, false);
});

test("la cantidad de un line item puede ser fraccionaria", () => {
  // 0.5 horas de consultoria a 1800/hora. Un `int()` aca rechazaria un caso real y el agente
  // lo frenaria por un tipo, no por una regla.
  const r = ExtractedInvoice.safeParse({
    ...full,
    line_items: [{ description: "consultoria", quantity: 0.5, unit_price: 1800, total: 900 }],
  });
  assert.equal(r.success, true);
});
