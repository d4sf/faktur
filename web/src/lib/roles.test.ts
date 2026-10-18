import assert from "node:assert/strict";
import test from "node:test";

import { ROLE_PERMISSIONS, can, type Role } from "@/lib/roles";

test("el CFO puede ver y hacer todo, incluida la facturación", () => {
  const role: Role = "cfo";

  assert.equal(can(role, "billing:view"), true);
  assert.equal(can(role, "policy:edit"), true);
  assert.equal(can(role, "approval:resolve"), true);
  assert.equal(can(role, "demo:reset"), true);
  assert.equal(ROLE_PERMISSIONS.cfo.length, 9);
});

test("el analista sube facturas pero no aprueba ni edita política", () => {
  assert.equal(can("analyst", "invoice:upload"), true);
  assert.equal(can("analyst", "invoice:view"), true);
  assert.equal(can("analyst", "approval:resolve"), false);
  assert.equal(can("analyst", "policy:edit"), false);
  assert.equal(can("analyst", "billing:view"), false);
});

test("el aprobador resuelve la bandeja pero no sube facturas", () => {
  assert.equal(can("approver", "approval:resolve"), true);
  assert.equal(can("approver", "invoice:view"), true);
  assert.equal(can("approver", "invoice:upload"), false);
});

test("el auditor solo lee tablero, facturas y reporte", () => {
  assert.equal(can("auditor", "dashboard:view"), true);
  assert.equal(can("auditor", "report:view"), true);
  assert.equal(can("auditor", "policy:edit"), false);
  assert.equal(can("auditor", "approval:resolve"), false);
  assert.equal(can("auditor", "billing:view"), false);
  assert.equal(can("auditor", "invoice:upload"), false);
});
