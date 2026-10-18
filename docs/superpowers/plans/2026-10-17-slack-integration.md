# Integración con Slack (webhook) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar una pantalla "Integraciones" donde el usuario pega la URL de un incoming webhook de Slack, y enviar un mensaje a ese canal cuando una factura es escalada a un humano o rechazada por un humano. Reutiliza (y extiende) el outbox/notifier existente.

**Architecture:** Una tabla `settings` (key/value) persiste la URL. Un servicio `integrations.ts` la valida, guarda, borra y prueba. El notifier se extiende con un `SlackNotifier` que formatea un mensaje `text` con los datos del caso (y la explicación con IA si está cacheada). `defaultNotifier(db)` prioriza la URL guardada en `settings`, luego `NOTIFIER_WEBHOOK_URL`, luego consola. Se dispara en ESCALAR (ya existente en `decideInvoice`) y en NEGADA (nuevo, en `resolveApproval`). UI: nueva página `/integraciones` con formulario, botón de prueba y estado.

**Tech Stack:** TypeScript 5.9, Fastify 5, Zod 4.6.7, React 19, `node:test` vía tsx. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-10-17-slack-integration-design.md`.
**ADR:** `docs/decisiones/0004-slack-integration.md`.

**Relación con el feature "Explicación con IA":** parte 2. El mensaje de Slack incluye la explicación con IA **solo si ya está cacheada** en `ai_explanations` (sin llamar al modelo en el camino crítico).

## Global Constraints

- Todo corre dentro del contenedor. `just` no está instalado en el host: usar `bash ./scripts/compose.sh <args>`.
- Imports relativos llevan extensión `.js` (`module: NodeNext`).
- **El script `test` de `api/package.json` y `web/package.json` es una lista explícita y hay que editarla a mano** para cada archivo de test nuevo.
- Prettier: 100 columnas, comillas dobles, semicolons.
- Commits: Conventional Commits, mensajes en inglés, un commit = un cambio lógico.
- No se toca el motor determinista. La notificación es un efecto secundario del outbox.

## Review Focus

Cinco formas de falla que el spec implica y que ningún test del camino feliz toca.

1. **Un `.test.ts` nuevo que no está en el script `test`.** La falla más silenciosa del repo.
2. **URL no-Slack o no-HTTPS guardada como webhook.** El endpoint de configuración debe validar `https://` y rechazar URLs inválidas con 422.
3. **Notificación en NEGADA no disparada.** `resolveApproval` cierra en transacción; el dispatch asíncrono debe ocurrir **después** del commit, como en `decideInvoice`, para no revertir la decisión si el webhook falla.
4. **Outbox con canal congelado.** La fila nace con `channel` en el momento de la decisión; si el usuario configura la URL después, las notificaciones ya encoladas con `CONSOLE` no se reenvían por Slack. Es aceptable para MVP, pero el test debe documentarlo.
5. **AI explanation no cacheada.** El mensaje de Slack no debe llamar a Gemini; si no hay explicación cacheada, se envía solo el motivo determinista.

---

## Task 1: Tabla `settings` en el schema

**Files:**
- Modify: `api/src/db/schema.ts`
- Modify: `api/src/db/schema.test.ts` (conteo 13 → 14)

- [ ] **Step 1: Agregar el DDL de `settings`**

En `SCHEMA_SQL`, después de `ai_explanations`:

```sql
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

- [ ] **Step 2: Actualizar el test de schema**

Renombrar a "crea las 14 tablas" y agregar `"settings"` a la lista ordenada.

- [ ] **Step 3: Correr y verificar**

Run: `bash ./scripts/compose.sh exec app sh -c 'cd /app/api && npx tsx --test src/db/schema.test.ts'`
Expected: PASS.

- [ ] **Step 4: Commitear**

```bash
git add api/src/db/schema.ts api/src/db/schema.test.ts
git commit -m "feat(api): add settings table for runtime integration config"
```

---

## Task 2: Repositorio `settings`

**Files:**
- Create: `api/src/repositories/settings.ts`
- Create: `api/src/repositories/settings.test.ts`
- Modify: `api/package.json` (script `test`)

**Interfaces:**

```ts
// api/src/repositories/settings.ts
export function getSetting(key: string, db: Database.Database): string | null;
export function setSetting(key: string, value: string, db: Database.Database): void;
export function deleteSetting(key: string, db: Database.Database): void;
```

- [ ] **Step 1: Agregar el test al script `test`**

- [ ] **Step 2: Escribir tests** (get null, set+get, overwrite, delete).

- [ ] **Step 3: Implementar** usando `INSERT ... ON CONFLICT(key) DO UPDATE`.

- [ ] **Step 4: Correr y commitear**

```bash
git add api/src/repositories/settings.ts api/src/repositories/settings.test.ts api/package.json
git commit -m "feat(api): add settings repository for runtime config"
```

---

## Task 3: Servicio de integraciones (Slack)

**Files:**
- Create: `api/src/services/integrations.ts`
- Create: `api/src/services/integrations.test.ts`
- Modify: `api/package.json` (script `test`)

**Interfaces:**

```ts
// api/src/services/integrations.ts
export const SLACK_WEBHOOK_KEY = "slack_webhook_url";

export function getSlackWebhookUrl(db: Database.Database): string | null;   // settings → env var → null
export function setSlackWebhookUrl(url: string, db: Database.Database): void; // valida https, guarda
export function deleteSlackWebhookUrl(db: Database.Database): void;
export async function testSlackWebhook(url: string): Promise<{ ok: boolean; status?: number; error?: string }>;
```

Validación: `z.string().url()` + `https:`. Rechazar si el hostname no contiene "slack.com" **solo como warning** (permitir webhook.site para tests) — decisión: exigir `https://`, no exigir slack.com (para facilitar tests), pero documentar.

- [ ] **Step 1: Agregar el test al script `test`**

- [ ] **Step 2: Escribir tests** (get null, set+get, validación URL inválida, delete, test ping con mock fetch).

- [ ] **Step 3: Implementar**

`testSlackWebhook` hace `fetch(url, { method: "POST", body: JSON.stringify({ text: "Ping de prueba — Blinka PayAgent" }) })` y devuelve `{ ok, status }` o `{ ok: false, error }`.

- [ ] **Step 4: Correr y commitear**

```bash
git add api/src/services/integrations.ts api/src/services/integrations.test.ts api/package.json
git commit -m "feat(api): add slack integration service with validation and test ping"
```

---

## Task 4: Notifier — `SlackNotifier` + `defaultNotifier(db)`

**Files:**
- Modify: `api/src/services/notifier.ts`
- Modify: `api/src/services/notifier.test.ts` (si existe; verificar)

**Cambios:**

1. Agregar `SlackNotifier implements Notifier` que formatea un mensaje Slack `text`:

```
🔴/🟡 *Factura <numero> — <veredicto>*
Proveedor: <vendor> · Monto: $<amount> USD
Motivo: <explanation>
Pasos: <ai_explanation si cacheada, o "—">
```

El `SlackNotifier` lee la explicación con IA cacheada desde `ai_explanations` por `decision_id` (si existe) y la anexa.

2. Cambiar firma: `defaultNotifier(db: Database.Database)` lee URL de `getSlackWebhookUrl(db)`; si hay URL → `SlackNotifier(url)` con channel `WEBHOOK`; si no → env var `NOTIFIER_WEBHOOK_URL` → `WebhookNotifier`; si no → `ConsoleNotifier`.

3. `queueNotification` y `dispatchNotification` sin cambios (channel sigue `WEBHOOK`/`CONSOLE`).

- [ ] **Step 1: Escribir/actualizar tests** del notifier (SlackNotifier formatea text, defaultNotifier prioriza settings).

- [ ] **Step 2: Implementar** `SlackNotifier` + modificar `defaultNotifier`.

- [ ] **Step 3: Actualizar callers** (`decideInvoice` ya pasa `db` a `defaultNotifier(db)`).

- [ ] **Step 4: Correr y commitear**

```bash
git add api/src/services/notifier.ts api/src/services/notifier.test.ts
git commit -m "feat(api): add slack notifier and db-backed default notifier"
```

---

## Task 5: Notificación en NEGADA (rechazo humano)

**Files:**
- Modify: `api/src/services/approvals.ts`
- Modify: `api/src/services/approvals.test.ts` (si existe)

**Cambio en `resolveApproval`:** cuando `!input.approve`:
- Después de `updateInvoiceStatus(invoice.id, "FRENADA", db)`, encolar una notificación:
  ```ts
  const notifier = defaultNotifier(db);
  let notificationId: string | undefined;
  notificationId = queueNotification({
    invoice_id: invoice.id,
    decision_id: decision.id,
    channel: notifier.channel,
    reason_code: decision.reason_code,
    explanation: decision.explanation,
    amount_usd: decision.amount_usd_evaluated,
    ...(extracted.vendor_name === undefined ? {} : { vendor_name: extracted.vendor_name }),
  });
  ```
- Dispatch asíncrono **fuera** de la transacción (como en `decideInvoice`): capturar `notificationId` y llamar `dispatchNotification` después del commit.

Para capturar dentro de la transacción, declarar `let notificationId` fuera y asignar dentro. El dispatch va después de `db.transaction(...)`.

- [ ] **Step 1: Actualizar tests** de approvals (verificar que NEGADA encola notificación).

- [ ] **Step 2: Implementar**.

- [ ] **Step 3: Correr y commitear**

```bash
git add api/src/services/approvals.ts api/src/services/approvals.test.ts
git commit -m "feat(api): notify on human rejection (NEGADA)"
```

---

## Task 6: Endpoints de integración

**Files:**
- Create: `api/src/routes/integrations.ts`
- Create: `api/src/routes/integrations.test.ts`
- Modify: `api/src/app.ts` (registrar)
- Modify: `api/package.json` (script `test`)

**Endpoints:**

- `GET /api/integrations/slack` → `{ configured: boolean, url: string | null }` (URL enmascarada: mostrar solo los últimos 8 chars, o null).
- `PUT /api/integrations/slack` con body `{ url: string }` → valida (https), guarda, devuelve `{ configured: true }`. 422 si inválida.
- `DELETE /api/integrations/slack` → borra, devuelve `{ configured: false }`.
- `POST /api/integrations/slack/test` con body `{ url?: string }` → usa la URL dada o la guardada; envía ping; devuelve `{ ok, status?, error? }`. 400 si no hay URL.

- [ ] **Step 1: Agregar el test al script `test`**

- [ ] **Step 2: Escribir tests** (GET no configurado, PUT válido, PUT inválido, DELETE, test ping).

- [ ] **Step 3: Implementar** la ruta.

- [ ] **Step 4: Registrar** en `app.ts`.

- [ ] **Step 5: Correr y commitear**

```bash
git add api/src/routes/integrations.ts api/src/routes/integrations.test.ts api/src/app.ts api/package.json
git commit -m "feat(api): add slack integration endpoints"
```

---

## Task 7: UI — página `/integraciones`

**Files:**
- Create: `web/src/pages/Integraciones.tsx`
- Modify: `web/src/router.tsx`
- Modify: `web/src/components/layout/AppShell.tsx` (nav item)

**Contenido de la página:**

- Encabezado "Integraciones".
- Card "Slack (webhook)":
  - Input de URL (https://hooks.slack.com/...).
  - Botón "Guardar".
  - Botón "Probar" (envía ping).
  - Estado: "Configurado" / "No configurado" + URL enmascarada.
  - Botón "Eliminar" (si configurado).
  - Instrucciones: cómo crear un incoming webhook en Slack (link a documentación).
- Manejo de errores (URL inválida, ping fallido).

Nav item: `{ to: "/integraciones", label: "Integraciones", icon: Webhook }`.

- [ ] **Step 1: Crear la página.**

- [ ] **Step 2: Registrar ruta y nav.**

- [ ] **Step 3: Typecheck web.**

Run: `bash ./scripts/compose.sh exec app sh -c 'cd /app/web && npx tsc --noEmit'`

- [ ] **Step 4: Commitear**

```bash
git add web/src/pages/Integraciones.tsx web/src/router.tsx web/src/components/layout/AppShell.tsx
git commit -m "feat(web): add slack integration settings page"
```

---

## Task 8: Documentación (ADR, spec, PRD, backlog)

**Files:**
- Create: `docs/decisiones/0004-slack-integration.md`
- Create: `docs/superpowers/specs/2026-10-17-slack-integration-design.md`
- Modify: `docs/PRD_Faktur.md` (tabla "Decisiones posteriores")
- Modify: `docs/backlog_implementacion_mvp.md` (§9.1 post-MVP)

- [ ] **Step 1: Crear ADR 0004** con la decisión de persistir la URL en `settings`, disparo en ESCALAR+NEGADA, formato `text` simple, botón de prueba.

- [ ] **Step 2: Crear el spec** `2026-10-17-slack-integration-design.md` con alcance y fuera de alcance.

- [ ] **Step 3: Agregar fila a la tabla "Decisiones posteriores" del PRD** registrando las dos funcionalidades post-MVP (Explicación con IA + Integración con Slack) sin editar el cuerpo del PRD.

- [ ] **Step 4: Agregar §9.1 al backlog** documentando las funcionalidades post-MVP.

- [ ] **Step 5: Commitear**

```bash
git add docs/decisiones/0004-slack-integration.md docs/superpowers/specs/2026-10-17-slack-integration-design.md docs/PRD_Faktur.md docs/backlog_implementacion_mvp.md
git commit -m "docs: register slack integration as post-mvp feature"
```

## Task 9: Verificación final

- [ ] **Step 1: `just check` (typecheck + lint + test) ambos workspaces**

Run: `bash ./scripts/compose.sh exec app sh -c 'cd /app/api && npx tsc --noEmit && npm test'` y `cd /app/web && npx tsc --noEmit && npm test`.

- [ ] **Step 2: Prettier**

Run: `bash ./scripts/compose.sh exec app sh -c 'cd /app && npx prettier --write <archivos nuevos>'` y verificar.

- [ ] **Step 3: Smoke manual**

1. Configurar URL en `/integraciones`, probar ping → OK.
2. Subir una factura que escale (TC-04) → verificar mensaje en Slack.
3. Rechazar una aprobación en la bandeja → verificar mensaje en Slack.
4. Verificar que FRENAR (TC-08) NO envía mensaje.

- [ ] **Step 4: Commitear cualquier ajuste.**

---

## Self-Review

1. **Spec coverage:** persistencia (T1-T2), servicio (T3), notifier (T4), NEGADA (T5), endpoints (T6), UI (T7), verificación (T8). Cubierto.
2. **Step scan:** cada paso tiene comando y expected.
3. **Type consistency:** `settings` repo, `integrations` service, `SlackNotifier`, endpoints, page. Consistentes.
4. **Review Focus:** los cinco puntos tienen verificación en las tareas.
5. **Proportion:** el código de implementación es ~250 líneas de backend + ~150 de UI.

## Execution Handoff

Plan completo y guardado en `docs/superpowers/plans/2026-10-17-slack-integration.md`. ¿Captura lo que quieres?

La ejecución será con el método que ya elegiste (**Native**): yo implemento cada paso en esta sesión y un revisor final revisa toda la rama. ¿Procedo con la implementación?