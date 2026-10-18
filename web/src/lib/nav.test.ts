import assert from "node:assert/strict";
import test from "node:test";

import { NAV_ITEMS, visibleNavItems } from "@/lib/nav";

test("el CFO ve toda la navegación, incluida facturación", () => {
  const paths = visibleNavItems("cfo").map((item) => item.to);

  assert.deepEqual(
    paths,
    NAV_ITEMS.map((item) => item.to),
  );
  assert.ok(paths.includes("/facturacion"));
});

test("el auditor no ve subir, reglas, facturación, integraciones ni datos de demo", () => {
  const paths = visibleNavItems("auditor").map((item) => item.to);

  assert.ok(paths.includes("/"));
  assert.ok(paths.includes("/reporte"));
  assert.ok(!paths.includes("/subir"));
  assert.ok(!paths.includes("/reglas"));
  assert.ok(!paths.includes("/facturacion"));
  assert.ok(!paths.includes("/integraciones"));
  assert.ok(!paths.includes("/datos"));
});

test("el analista ve subir y facturas, pero no la bandeja de aprobación", () => {
  const paths = visibleNavItems("analyst").map((item) => item.to);

  assert.ok(paths.includes("/subir"));
  assert.ok(!paths.includes("/bandeja"));
  assert.ok(!paths.includes("/facturacion"));
});
