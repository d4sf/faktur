import assert from "node:assert/strict";
import test from "node:test";

import { Approval, ApprovalStatus } from "./audit.js";

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
