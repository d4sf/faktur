# Facturación estática + roles y permisos (MVP) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar (a) una vista de facturación con 3 planes estáticos, plan actual persistido y consumo de facturas del mes, y (b) cuatro roles de demo con permisos estáticos que filtran navegación, rutas y acciones.

**Architecture:** Los planes son una constante compartida del API (`domain/plans.ts`), servida por `GET /api/billing`; el plan elegido se guarda en la tabla `settings` (key `billing_plan`). No hay cobro, ni Stripe, ni metering facturable: solo conteo de facturas del mes. Los usuarios son estáticos en el web (`lib/users.ts`), la sesión vive en `localStorage` y la matriz rol→permiso en `lib/roles.ts`. Los permisos se aplican en cliente (nav, rutas, botones); el API no valida rol (limitación documentada).

**Tech Stack:** TypeScript 5.9, Fastify 5, React 19, `node:test` + `tsx`, sin dependencias nuevas.

**Spec:** `docs/modelo_negocio_faktur.md` §4 (planes) y §3 (roles). No hay spec dedicada: este plan fija las decisiones.

## Global Constraints

- Todo corre dentro del contenedor; `just` no está en el host: `bash ./scripts/compose.sh exec -T app <cmd>`.
- Imports relativos del API llevan `.js` aunque el archivo sea `.ts` (`module: NodeNext`).
- **El script `test` de `api/package.json` y `web/package.json` es una lista explícita: agregar cada test nuevo a mano.**
- Prettier 100 columnas, comillas dobles, semicolons. Correr `just fmt` / Prettier antes de cerrar.
- Commits Conventional Commits en inglés, uno por cambio lógico.
- Sin autenticación real, sin billing real, sin multi-tenant. Si se agrega, es otro plan.

## Review Focus

1. **Plan inválido en `PUT /api/billing/plan`** (`"enterprise"`, `""`, número) → 400 `invalid_plan`, nunca default silencioso.
2. **Borde de mes UTC** en el conteo de facturas: `ingested_at` compara contra el día 1 UTC; reloj inyectable en el servicio para testear.
3. **Sesión corrupta o usuario inexistente en `localStorage`** → cae al usuario CFO por defecto, no crashea ni deja la app en blanco.
4. **URL directa a ruta prohibida** (`/reglas` como auditor) → página 403 con link al tablero, no pantalla vacía.
5. **Acción visible pero prohibida:** el botón "Aprobar pago" no debe renderizarse para roles sin `approval:resolve` (además del guard de ruta).

---

## File Structure

**API**
- Create `api/src/domain/plans.ts` — `PLANS`, `PlanId`, `getPlan`.
- Create `api/src/services/billing.ts` — `getBillingState(db, now?)`, `setBillingPlan(db, plan)`, `BillingError`.
- Create `api/src/routes/billing.ts` — `GET /api/billing`, `PUT /api/billing/plan`.
- Modify `api/src/app.ts` — registrar `registerBillingRoutes`.
- Test `api/src/services/billing.test.ts`, `api/src/routes/billing.test.ts`.

**Web**
- Create `web/src/lib/roles.ts` — `Permission`, `Role`, `ROLE_PERMISSIONS`, `can`, `ROLE_LABELS`.
- Create `web/src/lib/users.ts` — `DEMO_USERS`, `userId` type.
- Create `web/src/lib/session.ts` — `SESSION_KEY`, `parseSession`, `resolveUser`, `serializeSession`.
- Create `web/src/lib/nav.ts` — `NAV_ITEMS` con permiso y `visibleNavItems(role)`.
- Create `web/src/components/session/SessionProvider.tsx` — contexto (`user`, `can`, `switchUser`).
- Create `web/src/components/auth/RequirePermission.tsx` — guard de ruta + `Forbidden`.
- Create `web/src/pages/Facturacion.tsx` — 3 planes, plan actual, consumo.
- Modify `web/src/components/layout/AppShell.tsx` — nav desde `nav.ts`, switcher de usuario.
- Modify `web/src/router.tsx` — rutas envueltas en `RequirePermission`.
- Modify `web/src/pages/Bandeja.tsx`, `web/src/pages/Aprobacion.tsx` — botones por permiso y `resolved_by` desde sesión.
- Modify `web/src/pages/Reglas.tsx` — acciones de guardado por permiso.
- Modify `web/src/App.tsx` — `SessionProvider`.
- Test `web/src/lib/roles.test.ts`, `web/src/lib/session.test.ts`, `web/src/lib/nav.test.ts`, `web/src/pages/Facturacion.test.tsx`.

---

## Task 1: Planes y servicio de facturación (API) — 2 h

**Files:** Create `api/src/domain/plans.ts`, `api/src/services/billing.ts`, `api/src/services/billing.test.ts`.

**Interfaces:**
- `PLANS: readonly Plan[]` con `{ id: PlanId; name: string; price_usd: number; invoice_limit: number; extra_invoice_usd: number; users_included: number }`.
- `PlanId = "starter" | "growth" | "scale"`.
- `getPlan(id: string): Plan | undefined`.
- `getBillingState(db, now?: Date): BillingState` con `{ plan: PlanId; plans: readonly Plan[]; invoices_this_month: number; overage_invoices: number; overage_usd: number; month_start: string }`.
- `setBillingPlan(db, plan: PlanId): BillingState`.
- `BillingError` con `code: "invalid_plan"`.

- [ ] **Step 1: Test que falla** — `billing.test.ts`: base vacía → plan `growth` por defecto, `invoices_this_month: 0`; `setBillingPlan(db, "starter")` persiste y `getBillingState` lo devuelve; con 2 facturas dentro del mes y 1 del mes anterior → cuenta 2; con plan starter (límite 100) y 101 facturas → `overage_invoices: 1`, `overage_usd: 0.5`; `setBillingPlan(db, "enterprise" as PlanId)` lanza `BillingError` con `invalid_plan`.
- [ ] **Step 2: Correr y ver fallar** — `compose.sh exec -T app npm test -w api -- --test-name-pattern="billing"` (o `npx tsx --test src/services/billing.test.ts`).
- [ ] **Step 3: Implementar** — planes con los valores del doc: Starter 99/100/0.5/3, Growth 299/500/0.35/10, Scale 799/2000/0.25/25. `getBillingState` lee `getSetting("billing_plan", db)` (default `"growth"`), valida con `getPlan` y cuenta `SELECT COUNT(*) FROM invoices WHERE ingested_at >= ?` con `month_start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()`.
- [ ] **Step 4: Verificar verde** y agregar el test a `api/package.json`.
- [ ] **Step 5: Commit** — `feat(api): add static billing plans and monthly usage service`

## Task 2: Endpoints de facturación (API) — 1.5 h

**Files:** Create `api/src/routes/billing.ts`, `api/src/routes/billing.test.ts`; modify `api/src/app.ts`.

**Interfaces:** Consumes Task 1. `GET /api/billing` → `BillingState` 200. `PUT /api/billing/plan` body `{ plan?: unknown }` → 200 `BillingState`; body inválido o plan inexistente → 400 `{ error: "invalid_plan" }`.

- [ ] **Step 1: Test que falla** — 3 casos: GET devuelve `plans` con 3 ids; PUT `{plan:"starter"}` cambia y persiste (GET posterior lo confirma); PUT `{plan:"enterprise"}` y `{}` → 400.
- [ ] **Step 2: Ver fallar.**
- [ ] **Step 3: Implementar rutas** y registrar `await app.register(registerBillingRoutes)` en `app.ts` junto a las demás.
- [ ] **Step 4: Ver verde** + agregar test al script `test`.
- [ ] **Step 5: Commit** — `feat(api): expose billing plan and usage endpoints`

## Task 3: Página de facturación (Web) — 3 h

**Files:** Create `web/src/pages/Facturacion.tsx`, `web/src/pages/Facturacion.test.tsx`; modify `web/src/router.tsx`, `web/src/lib/nav.ts` (Task 4) y `web/src/components/layout/AppShell.tsx`.

**Interfaces:** Consumes `GET/PUT /api/billing`. Render con `react-dom/server` para el test.

- [ ] **Step 1: Test que falla** — markup contiene "Starter", "Growth", "Scale", `$99`, `$299`, `$799`, "Plan actual" en la tarjeta de Growth, y `0 / 500` cuando el JSON mockea `invoices_this_month: 0`.
- [ ] **Step 2: Ver fallar.**
- [ ] **Step 3: Implementar** — page con `useEffect` + `fetch("/api/billing")` (mismo patrón que `Integraciones.tsx`), 3 cards (`card`/`button` existentes), badge "Plan actual", barra de consumo `invoices_this_month / invoice_limit`, texto de excedente `overage_usd`, botón "Elegir plan" → `PUT` y refresh optimista. Aclaración visible: "Demo: sin cobro real".
- [ ] **Step 4: Ver verde** + agregar test al script de `web/package.json`.
- [ ] **Step 5: Commit** — `feat(web): add billing plans page`

## Task 4: Matriz de roles y navegación (Web) — 1.5 h

**Files:** Create `web/src/lib/roles.ts`, `web/src/lib/nav.ts`, tests `roles.test.ts` y `nav.test.ts`; modify `AppShell.tsx`.

**Interfaces:**
- `Permission = "dashboard:view" | "invoice:upload" | "invoice:view" | "approval:resolve" | "policy:edit" | "report:view" | "billing:view" | "integrations:manage" | "demo:reset"`.
- `Role = "cfo" | "analyst" | "approver" | "auditor"`.
- `ROLE_PERMISSIONS: Record<Role, readonly Permission[]>`: cfo = todas; analyst = dashboard, upload, view; approver = dashboard, view, approval; auditor = dashboard, view, report.
- `can(role, permission): boolean`.
- `NAV_ITEMS: readonly { to, label, icon, permission }[]`; `visibleNavItems(role): typeof NAV_ITEMS`.

- [ ] **Step 1: Test que falla** — matriz: cfo tiene `billing:view`; analyst **no** tiene `approval:resolve` ni `policy:edit`; approver no tiene `invoice:upload`; auditor no tiene `billing:view`. `visibleNavItems("auditor")` no incluye `/subir`, `/reglas`, `/facturacion`.
- [ ] **Step 2: Ver fallar.**
- [ ] **Step 3: Implementar** `roles.ts`/`nav.ts` y cambiar `AppShell.tsx` para filtrar con `visibleNavItems(role)`; agregar item `{ to: "/facturacion", label: "Facturación", permission: "billing:view" }`.
- [ ] **Step 4: Ver verde** + tests al script.
- [ ] **Step 5: Commit** — `feat(web): add static role permissions and nav filtering`

## Task 5: Sesión de demo y guard de rutas — 2.5 h

**Files:** Create `web/src/lib/users.ts`, `web/src/lib/session.ts`, `web/src/components/session/SessionProvider.tsx`, `web/src/components/auth/RequirePermission.tsx`, `web/src/lib/session.test.ts`; modify `web/src/App.tsx`, `web/src/router.tsx`, `AppShell.tsx`.

**Interfaces:**
- `DEMO_USERS`: `cfo@flush.demo` (CFO), `analista@flush.demo`, `aprobador@flush.demo`, `auditor@flush.demo`, con `{ id, name, email, role }`.
- `SESSION_KEY = "flush.session.userId"`, `parseSession(raw: string | null): string | null`, `resolveUser(raw): User` (fallback CFO), `serializeSession(userId): string`.
- `useSession(): { user, can(permission), switchUser(id) }`.
- `<RequirePermission permission="policy:edit">` → children o `<Forbidden />`.

- [ ] **Step 1: Test que falla** — `resolveUser("no-existe")` y `resolveUser(null)` devuelven CFO; `resolveUser("auditor")` devuelve auditor; `parseSession("{")` → null.
- [ ] **Step 2: Ver fallar.**
- [ ] **Step 3: Implementar** provider con `useState(() => resolveUser(localStorage.getItem(SESSION_KEY)))`, `switchUser` escribe storage; switcher en el footer del sidebar (select con nombre + rol); banner sutil "Sesión de demo — sin autenticación"; envolver cada ruta en `router.tsx` con el permiso de `NAV_ITEMS`.
- [ ] **Step 4: Ver verde** + test al script.
- [ ] **Step 5: Commit** — `feat(web): add static demo session and route permissions`

## Task 6: Permisos en acciones y autor de aprobación — 1.5 h

**Files:** Modify `web/src/pages/Bandeja.tsx`, `web/src/pages/Aprobacion.tsx`, `web/src/pages/Reglas.tsx`.

- [ ] **Step 1:** En Bandeja/Aprobación, ocultar "Aprobar pago"/"Negar" si `!can("approval:resolve")`; enviar `resolved_by: user.name` en el POST existente (el API ya lo acepta y lo guarda en `approvals.resolved_by`).
- [ ] **Step 2:** En Reglas, deshabilitar "Aplicar"/guardar si `!can("policy:edit")` y mostrar "Solo lectura: tu rol no edita la política".
- [ ] **Step 3:** Verificar manualmente con el switcher: auditor ve reporte pero no reglas; analista sube pero no aprueba.
- [ ] **Step 4: Commit** — `feat(web): gate approval and policy actions by role`

## Task 7: Docs, smoke y cierre — 1.5 h

**Files:** Modify `README.md`, `docs/backlog_implementacion_mvp.md` (nota de alcance), `api/src/smoke.acceptance.test.ts` (solo si hace falta).

- [ ] **Step 1:** README: sección "Roles de demo" con tabla rol→puede ver, y "Facturación (demo)" con los 3 planes y la aclaración de que no hay cobro.
- [ ] **Step 2:** Correr `typecheck` + `lint` + tests de ambos workspaces y `just fmt`/Prettier.
- [ ] **Step 3: Commit** — `docs: document demo roles and static billing`

---

## Estimación

| Bloque | Horas | Días (8 h) |
|---|---|---|
| Facturación (Task 1–3) | 6.5 | 0.8 |
| Roles y sesión (Task 4–6) | 5.5 | 0.7 |
| Docs y cierre (Task 7) | 1.5 | 0.2 |
| **Total sin buffer** | **13.5** | **1.7** |
| **Con buffer 20% (demo, mobile, imprevistos)** | **16** | **2** |

Referencia monetaria (si se terceriza): a US$ 30–50/h → **US$ 400–800**. En el hackathon equivale a **2 días de una persona**.

**Recorte opcional a 4–6 h:** solo la vista visual de planes (sin API, sin persistencia, sin consumo) + selector de rol que oculta nav y rutas. Sirve para el pitch, no para demo de persistencia.

## Limitaciones que hay que decir en el pitch

- Los permisos son **cosméticos**: el API no valida rol, así que un `curl` puede saltarlos. No afirmar "seguridad por roles".
- No hay cobro, ni Stripe, ni facturas emitidas: solo el plan elegido y el conteo del mes.
- Sin login ni contraseñas: es un selector de usuarios de demo.
