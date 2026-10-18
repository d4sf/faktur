import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { RequirePermission } from "@/components/auth/RequirePermission";
import { SessionProvider } from "@/components/session/SessionProvider";
import { DEMO_USERS } from "@/lib/session";

function renderAs(role: "cfo" | "auditor", permission: "policy:edit") {
  const user = DEMO_USERS.find((candidate) => candidate.role === role)!;
  return renderToStaticMarkup(
    <SessionProvider initialUser={user}>
      <MemoryRouter>
        <RequirePermission permission={permission}>
          <p>contenido protegido</p>
        </RequirePermission>
      </MemoryRouter>
    </SessionProvider>,
  );
}

test("un rol sin permiso ve la pantalla de acceso denegado", () => {
  const html = renderAs("auditor", "policy:edit");

  assert.match(html, /Sin permiso para esta sección/);
  assert.doesNotMatch(html, /contenido protegido/);
});

test("un rol con permiso ve el contenido de la ruta", () => {
  const html = renderAs("cfo", "policy:edit");

  assert.match(html, /contenido protegido/);
  assert.doesNotMatch(html, /Sin permiso para esta sección/);
});
