import assert from "node:assert/strict";
import test from "node:test";

import { Approval, ApprovalStatus, AuditRecord } from "./audit.js";
import { Decision } from "./decision.js";
import { ExtractedInvoice } from "./extraction.js";

test("una aprobacion empieza PENDIENTE", () => {
  assert.equal(ApprovalStatus.parse("PENDIENTE"), "PENDIENTE");
});

test("un estado de aprobacion fuera del enum se rechaza", () => {
  assert.equal(ApprovalStatus.safeParse("CANCELADA").success, false);
});

test("una aprobacion resuelta exige quien, cuando y por que", () => {
  const resuelta = {
    id: "a1",
    decision_id: "d1",
    invoice_id: "i1",
    status: "APROBADA",
    requested_at: "2026-10-17T00:00:00Z",
    resolved_by: "cfo-demo",
    resolved_at: "2026-10-17T04:00:00Z",
    comment: "autorizada con sobrecupo",
    override_with_overbudget: true,
  };
  assert.equal(Approval.safeParse(resuelta).success, true);

  // Las tres claves de resolucion son requeridas aunque el valor sea nulo: si faltan, el
  // objeto tiene que ser invalido, no "incompleto en silencio". Se borran sobre una copia en
  // vez de desestructurar con `_` porque la config de ESLint no ignora los prefijos.
  const sinResolver: Record<string, unknown> = { ...resuelta };
  delete sinResolver.resolved_by;
  delete sinResolver.resolved_at;
  delete sinResolver.comment;
  assert.equal(Approval.safeParse(sinResolver).success, false);
});

test("una aprobacion PENDIENTE es valida con los tres en null", () => {
  // Este es el estado con el que T5 crea la bandeja al escalar (TC-04), o sea el que el
  // sistema produce de verdad. Sin este test la cobertura solo miraba el camino resuelto.
  assert.equal(
    Approval.safeParse({
      id: "a2",
      decision_id: "d2",
      invoice_id: "i2",
      status: "PENDIENTE",
      requested_at: "2026-10-17T00:00:00Z",
      resolved_by: null,
      resolved_at: null,
      comment: null,
      override_with_overbudget: false,
    }).success,
    true,
  );
});

const factura = ExtractedInvoice.parse({
  invoice_number: "INV-9022",
  vendor_name: "CloudServers Inc",
  vendor_tax_id: "CLOUD-SERVERS-INC",
  due_date: "2026-10-15",
  currency: "usd",
  total_amount: 420,
});

const decision = Decision.parse({
  invoice_id: "i1",
  ingest_attempt_id: null,
  verdict: "ESCALAR",
  reason_code: "ALERT_VENDOR_DRIFT",
  explanation: "el monto triplica el promedio historico del beneficiario",
  policy_version: "v1",
  amount_usd_evaluated: 1260,
  decided_by: "AGENTE",
});

test("AuditRecord monta una Decision sin reinterpretar nada", () => {
  const r = AuditRecord.parse({
    id: "d1",
    invoice: factura,
    document_hash: "c".repeat(64),
    amount_usd: 1260,
    verdict: decision.verdict,
    reason_code: decision.reason_code,
    explanation: decision.explanation,
    created_at: "2026-10-17T04:00:00Z",
    human_approved: null,
  });

  // La proyeccion pega la factura a la decision. Si alguno de estos tres difiere del `Decision`
  // de origen, la traza esta contando una historia que no fue la que se decidio.
  assert.equal(r.verdict, "ESCALAR");
  assert.equal(r.reason_code, "ALERT_VENDOR_DRIFT");
  assert.equal(r.explanation, "el monto triplica el promedio historico del beneficiario");

  // Y la factura sale normalizada, no como el modelo la emitio.
  assert.equal(r.invoice.currency, "USD");
  assert.deepEqual(r.invoice.vendor_tax_id, "CLOUD-SERVERS-INC");
});

test("un AuditRecord no acepta un veredicto fuera del enum", () => {
  const base = {
    id: "d2",
    invoice: factura,
    document_hash: "c".repeat(64),
    amount_usd: 1260,
    reason_code: "ALERT_VENDOR_DRIFT",
    explanation: "motivo",
    created_at: "2026-10-17T04:00:00Z",
    human_approved: null,
  };
  assert.equal(AuditRecord.safeParse({ ...base, verdict: "PAGAR" }).success, true);
  assert.equal(AuditRecord.safeParse({ ...base, verdict: "APROBADO" }).success, false);
});

test("human_approved es tri-estado: null antes de que un humano responda", () => {
  const base = {
    id: "d3",
    invoice: factura,
    document_hash: "c".repeat(64),
    amount_usd: 1260,
    verdict: "ESCALAR",
    reason_code: "ALERT_VENDOR_DRIFT",
    explanation: "motivo",
    created_at: "2026-10-17T04:00:00Z",
  };
  for (const v of [null, true, false]) {
    assert.equal(AuditRecord.safeParse({ ...base, human_approved: v }).success, true, String(v));
  }
  // Sin la clave tiene que fallar: "nadie respondio" y "no se consulto el campo" no son lo
  // mismo, y un `.default(null)` taparia la diferencia.
  assert.equal(AuditRecord.safeParse(base).success, false);
});

test("el hash de documento se exige en sha-256 hex", () => {
  const base = {
    id: "d4",
    invoice: factura,
    amount_usd: 1260,
    verdict: "ESCALAR",
    reason_code: "ALERT_VENDOR_DRIFT",
    explanation: "motivo",
    created_at: "2026-10-17T04:00:00Z",
    human_approved: null,
  };
  assert.equal(AuditRecord.safeParse({ ...base, document_hash: "f".repeat(64) }).success, true);
  assert.equal(AuditRecord.safeParse({ ...base, document_hash: "no-es-un-hash" }).success, false);
  assert.equal(AuditRecord.safeParse({ ...base, document_hash: "F".repeat(64) }).success, false);
});
