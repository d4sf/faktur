import assert from "node:assert/strict";
import test from "node:test";

import { IngestAttempt } from "./ingestion.js";

const base = {
  file_name: "factura.pdf",
  mime_type: "application/pdf",
  byte_size: 182_004,
  file_hash: "b".repeat(64),
  attempt_status: "RECIBIDA",
  invoice_id: null,
  duplicate_of_invoice_id: null,
};

test("un hash que no es sha-256 de 64 hex se rechaza", () => {
  assert.equal(IngestAttempt.safeParse({ ...base, file_hash: "abc" }).success, false);
  assert.equal(IngestAttempt.safeParse({ ...base, file_hash: "a".repeat(64) }).success, true);
});

test("un hash con mayusculas se rechaza", () => {
  // SHA-256 se computa en hex y el motor lo compara con `=` en la regla 2. Si el motor
  // escribiera mayusculas y el extractor en minúsculas, el dedup no encontraria el duplicado y
  // pagaria dos veces. Fijar el contrato en minusculas aca evita depender de esa suerte.
  assert.equal(IngestAttempt.safeParse({ ...base, file_hash: "A".repeat(64) }).success, false);
});

test("un intento duplicado referencia la factura canonica", () => {
  const r = IngestAttempt.safeParse({
    ...base,
    attempt_status: "DUPLICADA",
    invoice_id: "i1",
    duplicate_of_invoice_id: "i1",
  });
  assert.equal(r.success, true);
});

test("un intento recibido no apunta a ninguna canonica", () => {
  assert.equal(IngestAttempt.safeParse({ ...base, attempt_status: "RECIBIDA" }).success, true);
});

test("un byte_size negativo o decimal se rechaza", () => {
  assert.equal(IngestAttempt.safeParse({ ...base, byte_size: -1 }).success, false);
  assert.equal(IngestAttempt.safeParse({ ...base, byte_size: 10.5 }).success, false);
  assert.equal(IngestAttempt.safeParse({ ...base, byte_size: 0 }).success, true);
});
