# Modo desactivado (maintenance mode) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un modo desactivado togggleable por endpoint con secret (env var). Al desactivar, el servidor devuelve una página centrada "Flush" para toda la web; la API sigue funcionando.

**Architecture:** Estado en `settings` (key `maintenance_mode`). Hook `onRequest` en `app.ts` intercepta rutas no-`/api` cuando está activo y devuelve HTML autocontenido. Endpoints `GET/POST /api/maintenance`. Secret verificado por header `X-Maintenance-Secret`.

**Tech Stack:** TypeScript 5.9, Fastify 5, `node:test` vía tsx. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-10-18-maintenance-mode-design.md`.

## Global Constraints

- Todo corre dentro del contenedor. `just` no está instalado en el host: usar `bash ./scripts/compose.sh <args>`.
- Imports relativos llevan extensión `.js` (`module: NodeNext`).
- **El script `test` de `api/package.json` es una lista explícita y hay que editarla a mano** para cada archivo de test nuevo.
- Prettier: 100 columnas, comillas dobles, semicolons.
- Commits: Conventional Commits, mensajes en inglés, un commit = un cambio lógico.

## Review Focus

1. **Un `.test.ts` nuevo que no está en el script `test`.** La falla más silenciosa del repo.
2. **El hook `onRequest` bloquea el toggle.** Si el hook intercepta `/api/maintenance` cuando está desactivado, no se puede reactivar. El hook debe excluir `/api/`.
3. **El secret se compara con `===`** sin trim ni normalización. Documentar que debe coincidir exactamente.
4. **La página "Flush" debe ser autocontenida** (sin CSS/JS externos), porque las requests a `/assets/...` también se interceptan.
5. **Estado por defecto activado.** Si no hay fila en `settings`, el sitio funciona normal.

---

## Task 1: Servicio de maintenance

**Files:**
- Create: `api/src/services/maintenance.ts`
- Create: `api/src/services/maintenance.test.ts`
- Modify: `api/package.json` (script `test`)

**Interfaces:**

```ts
// api/src/services/maintenance.ts
export const MAINTENANCE_KEY = "maintenance_mode";
export const MAINTENANCE_HTML = `<!DOCTYPE html>...`; // página "Flush" centrada

export function isMaintenanceMode(db: Database.Database): boolean;
export function setMaintenanceMode(maintenance: boolean, db: Database.Database): void;
```

- [ ] **Step 1: Agregar el test al script `test`.**

- [ ] **Step 2: Escribir tests** (default false, set true, set false, isMaintenanceMode refleja el estado).

- [ ] **Step 3: Implementar** usando `getSetting`/`setSetting` de `repositories/settings.ts`.

- [ ] **Step 4: Correr y commitear.**

```bash
git add api/src/services/maintenance.ts api/src/services/maintenance.test.ts api/package.json
git commit -m "feat(api): add maintenance mode service"
```

---

## Task 2: Env var `MAINTENANCE_SECRET`

**Files:**
- Modify: `api/src/config/env.ts`

- [ ] **Step 1: Agregar al schema** (y a `BLANK_IS_UNDEFINED`):

```ts
MAINTENANCE_SECRET: z.string().min(1).optional(),
```

- [ ] **Step 2: Typecheck.**

- [ ] **Step 3: Commitear**

```bash
git add api/src/config/env.ts
git commit -m "feat(api): add MAINTENANCE_SECRET env var"
```

---

## Task 3: Hook en `app.ts` + rutas

**Files:**
- Modify: `api/src/app.ts`
- Create: `api/src/routes/maintenance.ts`
- Create: `api/src/routes/maintenance.test.ts`
- Modify: `api/package.json` (script `test`)

**Hook en `app.ts`:**

```ts
import { isMaintenanceMode } from "./services/maintenance.js";
import { MAINTENANCE_HTML } from "./services/maintenance.js";

app.addHook("onRequest", async (request, reply) => {
  if (request.url.startsWith("/api/")) return;
  if (!isMaintenanceMode(getDb())) return;
  return reply.type("text/html").code(200).send(MAINTENANCE_HTML);
});
```

**Rutas:**

```ts
// GET /api/maintenance
app.get("/api/maintenance", async () => ({ enabled: !isMaintenanceMode(getDb()) }));

// POST /api/maintenance
app.post<{ Body: { enabled?: unknown } }>("/api/maintenance", async (request, reply) => {
  const secret = request.headers["x-maintenance-secret"];
  const envSecret = loadEnv().MAINTENANCE_SECRET;
  if (envSecret === undefined) return reply.code(503).send({ error: "maintenance_secret_not_configured" });
  if (secret !== envSecret) return reply.code(403).send({ error: "invalid_secret" });
  const body = (request.body ?? {}) as { enabled?: unknown };
  if (typeof body.enabled !== "boolean") return reply.code(400).send({ error: "invalid_body" });
  setMaintenanceMode(!body.enabled, getDb());
  return reply.code(200).send({ enabled: body.enabled });
});
```

- [ ] **Step 1: Implementar hook y rutas.**
- [ ] **Step 2: Registrar rutas en `app.ts`.**
- [ ] **Step 3: Typecheck.**
- [ ] **Step 4: Commitear**

```bash
git add api/src/app.ts api/src/routes/maintenance.ts api/src/routes/maintenance.test.ts api/package.json
git commit -m "feat(api): add maintenance mode hook and endpoints"
```

---

## Task 4: Tests

**Files:**
- `api/src/services/maintenance.test.ts` (ya en Task 1)
- `api/src/routes/maintenance.test.ts`

**Casos:**
- GET `/api/maintenance` → `{ enabled: true }` por defecto.
- POST con secret válido y `{ enabled: false }` → 200 `{ enabled: false }`; GET posterior → `{ enabled: false }`.
- POST con secret inválido → 403 `invalid_secret`.
- POST sin secret configurado (env vacío) → 503 `maintenance_secret_not_configured`.
- POST con body inválido → 400 `invalid_body`.
- Con maintenance activo, `GET /` devuelve HTML con "Flush" (200).
- Con maintenance activo, `GET /api/health` sigue devolviendo 200 (no interceptado).

- [ ] **Step 1: Escribir tests.**
- [ ] **Step 2: Correr y verificar.**
- [ ] **Step 3: Commitear**

```bash
git add api/src/services/maintenance.test.ts api/src/routes/maintenance.test.ts api/package.json
git commit -m "test(api): add maintenance mode tests"
```

---

## Task 5: Documentación y `.env.example`

**Files:**
- Modify: `.env.example`
- Create: `docs/decisiones/0006-maintenance-mode.md` (opcional)

- [ ] **Step 1: Agregar `MAINTENANCE_SECRET` a `.env.example`.**
- [ ] **Step 2: Commitear**

```bash
git add .env.example
git commit -m "docs: add MAINTENANCE_SECRET to .env.example"
```

---

## Task 6: Verificación final

- [ ] **Step 1: Typecheck + tests + lint.**
- [ ] **Step 2: Smoke manual:** activar maintenance con curl, verificar página "Flush", desactivar, verificar sitio normal.
- [ ] **Step 3: Commitear cualquier ajuste.**

---

## Self-Review

1. **Spec coverage:** servicio (T1), env (T2), hook + rutas (T3), tests (T4), docs (T5), verificación (T6). Cubierto.
2. **Step scan:** cada paso tiene comando y expected.
3. **Type consistency:** `MAINTENANCE_KEY`, `MAINTENANCE_HTML`, `isMaintenanceMode`, `setMaintenanceMode`, endpoints. Consistentes.
4. **Review Focus:** los cinco puntos tienen verificación en las tareas.

## Execution Handoff

Plan completo y guardado en `docs/superpowers/plans/2026-10-18-maintenance-mode.md`. ¿Captura lo que quieres?

La ejecución será con el método que ya elegiste (**Native**): yo implemento cada paso en esta sesión. ¿Procedo con la implementación?