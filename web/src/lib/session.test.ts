import assert from "node:assert/strict";
import test from "node:test";

import {
  DEMO_USERS,
  SESSION_KEY,
  parseSession,
  resolveUser,
  serializeSession,
} from "@/lib/session";

test("hay cuatro usuarios de demo, uno por rol", () => {
  assert.deepEqual(
    DEMO_USERS.map((user) => user.role),
    ["cfo", "analyst", "approver", "auditor"],
  );
  assert.equal(SESSION_KEY, "flush.session.userId");
});

test("sin sesión guardada la app arranca como CFO", () => {
  assert.equal(resolveUser(null).role, "cfo");
});

test("una sesión desconocida o corrupta cae al CFO en lugar de romper", () => {
  assert.equal(resolveUser("").role, "cfo");
  assert.equal(resolveUser("no-existe").role, "cfo");
  assert.equal(resolveUser('{"id":"auditor"}').role, "cfo");
});

test("resuelve el usuario guardado por id", () => {
  assert.equal(resolveUser("auditor").role, "auditor");
  assert.equal(resolveUser("analyst").email, "analista@flush.demo");
});

test("serializa y parsea el id de sesión", () => {
  assert.equal(serializeSession("approver"), "approver");
  assert.equal(parseSession(serializeSession("approver")), "approver");
  assert.equal(parseSession("   "), null);
  assert.equal(parseSession(null), null);
});
