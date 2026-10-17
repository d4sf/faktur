# Factories, seeders por perfil y reset desde la UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar factories de datos, seeders por perfil (`reference` / `demo`) y una pantalla `/datos` que borra y re-siembra la base desde el navegador, funcionando también en el deploy de Render.

**Architecture:** Cuatro capas nuevas sobre lo que ya existe: `api/src/db/factories.ts` (builders que insertan filas válidas), `api/src/db/seeders.ts` (registry de perfiles que reutiliza `seed()` y `seedDemoSet()`), `api/src/db/reset.ts` (borra el archivo SQLite + `uploads/`, reabre y siembra) y `api/src/routes/admin.ts` (`GET /api/admin/db`, `POST /api/admin/db/reset`). La UI es una página React Router nueva que consume esas dos rutas.

**Tech Stack:** TypeScript 5.9, Node 22, Fastify 5, better-sqlite3 13 (síncrono), zod, React 19 + React Router 7 + Tailwind, `node:test` vía tsx.

**Spec:** No hay spec separado: el diseño se acordó en sesión el 2026-10-17 y las decisiones de producto están en §Decisiones de este mismo plan. Cualquier cambio de alcance va acá primero.

## Global Constraints

- Todo corre dentro del contenedor. En esta máquina **`just` no está instalado**: usar `bash ./scripts/compose.sh <args>` (compose v2). El contenedor dev tiene que estar arriba; el cwd de `exec` es `/app`.
- `bash ./scripts/compose.sh exec -T app npx tsx --test src/<archivo>.test.ts` corre un test puntual.
- Las tres verificaciones (`typecheck`, `lint`, `test`) usan `compose exec`; sin contenedor fallan con `service "app" is not running`.
- **El script `test` de `api/package.json` es una lista explícita**: cada `.test.ts` nuevo se agrega a mano, en orden alfabético por directorio como está hoy.
- Imports relativos en `api/` llevan extensión `.js` (`module: NodeNext`) aunque el archivo sea `.ts`.
- better-sqlite3 es **síncrono**: no hay `await` entre cerrar y reabrir la base. El reset no puede ceder el event loop a mitad de camino.
- `config/env.ts` es el único módulo que lee `process.env`. Los servicios y rutas reciben valores ya validados.
- Ems de dominio sin tilde: `PAGAR | FRENAR | ESCALAR`, `PENDIENTE | APROBADA | NEGADA`, etc.
- Prettier: 100 columnas, comillas dobles, semicolons. `just check` **no** corre Prettier: antes de cerrar cada tarea, `bash ./scripts/compose.sh exec -T app npx prettier --write <archivos> -w api` (o `npm run fmt` si la receta existe).
- Commits: Conventional Commits, mensajes en inglés, un commit por tarea. **No hacer push.**
- Nada de borrar `data/faktur.db` del host durante el desarrollo de los tests: todos los tests usan `mkdtempSync`.

## Decisiones de producto (acordadas)

1. **Reset total**: borra `faktur.db` (+ `-wal`/`-shm`), vacía `uploads/`, reaplica schema y `seed()`, y corre el perfil elegido. No preserva policy editada ni aprobaciones.
2. **Funciona en Render**: el guard no depende de `NODE_ENV`. Se habilita con `ALLOW_DB_RESET=true`; en producción además exige `ADMIN_TOKEN` (fail-closed: sin token el endpoint responde 403, nunca queda público).
3. **Perfiles**: `reference` (solo datos de referencia: 8 vendors, policy v1, budgets, FX) y `demo` (lo anterior + los 12 `fixtures/TC-*.json` por el pipeline real). **No hay perfil `bulk`.**

## Review Focus

Cinco formas de falla que este diseño implica y que el camino feliz no toca.

1. **Endpoint público que borra la base de producción.** En Render la app es pública: sin guard, cualquiera hace `POST /api/admin/db/reset`. Mitigación: `ALLOW_DB_RESET=true` **y** `ADMIN_TOKEN` obligatorio cuando `NODE_ENV=production`; sin token configurado el POST responde `403 db_reset_token_missing`. Test en Task 4.
2. **Reset que deja archivos `-wal`/`-shm` huérfanos.** SQLite en modo WAL puede mantener datos en el log: borrar solo `faktur.db` deja una base "reiniciada" que sigue viendo filas viejas o queda corrupta. Mitigación: borrar los tres sufijos y verificar `SELECT COUNT(*) FROM invoices = 0`. Test en Task 3.
3. **`getDb()` después del reset.** Si el reset cierra la base y falla al reabrir, cada request posterior lanza `DB no inicializada`. Mitigación: reabrir en el mismo bloque síncrono y devolver la instancia nueva; test que llama `getDb()` después de `resetDatabase`. Test en Task 3.
4. **Factories que violan UNIQUE entre sí.** `vendors.tax_id`, `invoices.file_hash` y `(vendor_id, invoice_number)` son únicos: dos factories con valores fijos rompen el segundo insert. Mitigación: contador module-level `nextSeq()`; test que crea dos vendors y dos invoices sin override. Test en Task 1.
5. **Botón de reset sin fricción en la UI.** Un click borra la demo en vivo. Mitigación: `Dialog` que exige escribir `REINICIAR` y muestra qué se va a borrar. Test manual en Task 5 (la web no tiene suite de tests).

---

### Task 1: Factories

**Files:**
- Create: `api/src/db/factories.ts`
- Create: `api/src/db/factories.test.ts`
- Modify: `api/package.json` (script `test`)

**Interfaces:**
- Consumes: `schema.ts` (columnas y CHECKs), `crypto.randomUUID()`.
- Produces:
  ```ts
  // api/src/db/factories.ts
  export function nextSeq(): number;                       // contador module-level, arranca en 1

  export interface VendorRow { id: string; tax_id: string; display_name: string; category: string;
    status: "ALLOWLISTED" | "BLOCKLISTED"; historical_avg_usd: number;
    first_seen_at: string | null; last_seen_at: string | null }
  export interface InvoiceRow { id: string; vendor_id: string | null; invoice_number: string | null;
    status: "RECIBIDA"|"EXTRAIDA"|"DECIDIDA"|"PENDIENTE_APROBACION"|"APROBADA"|"NEGADA"|"FRENADA";
    file_name: string; mime_type: string; file_hash: string; issue_date: string | null;
    due_date: string | null; currency: string; subtotal: number | null; tax_amount: number | null;
    total_amount: number; fx_rate_used: number; total_usd: number;
    extraction_confidence: number | null; extraction_json: string; ingested_at: string }
  export interface LineItemRow { id: string; invoice_id: string; description: string;
    quantity: number; unit_price: number; total: number }
  export interface IngestAttemptRow { id: string; invoice_id: string | null; file_name: string;
    mime_type: string; byte_size: number; file_hash: string;
    attempt_status: "RECIBIDA"|"DUPLICADA"|"RECHAZADA"; duplicate_of_invoice_id: string | null;
    submitted_at: string }
  export interface DecisionRow { id: string; invoice_id: string | null; ingest_attempt_id: string | null;
    verdict: "PAGAR"|"FRENAR"|"ESCALAR"; reason_code: string; explanation: string;
    policy_version: string; amount_usd_evaluated: number; decided_by: "AGENTE"|"HUMANO";
    decided_at: string }
  export interface ApprovalRow { id: string; decision_id: string; invoice_id: string;
    status: "PENDIENTE"|"APROBADA"|"NEGADA"; requested_at: string; resolved_by: string | null;
    resolved_at: string | null; comment: string | null; override_with_overbudget: number }

  export function vendorFactory(db: Database.Database, overrides?: Partial<VendorRow>): VendorRow;
  export function invoiceFactory(db: Database.Database, overrides?: Partial<InvoiceRow>): InvoiceRow;
  export function lineItemFactory(db: Database.Database, overrides?: Partial<LineItemRow>): LineItemRow;
  export function ingestAttemptFactory(db: Database.Database, overrides?: Partial<IngestAttemptRow>): IngestAttemptRow;
  export function decisionFactory(db: Database.Database, overrides?: Partial<DecisionRow>): DecisionRow;
  export function approvalFactory(db: Database.Database, overrides?: Partial<ApprovalRow>): ApprovalRow;
  ```

**Comportamiento fijado (no lo deciden los tests):**

- Cada factory **inserta** y **devuelve la fila insertada** (defaults + overrides), no un DTO.
- Los IDs salen de `randomUUID()`; los valores únicos (`tax_id`, `file_hash`, `invoice_number`, nombres de archivo) usan `nextSeq()`.
- `invoiceFactory` sin `vendor_id` crea un vendor con `vendorFactory` y lo usa. `currency` default `"USD"` (existe en `fx_rates` por `seed()`). `status` default `"RECIBIDA"`. `total_amount` = `total_usd` = `100`, `fx_rate_used` = `1`, `extraction_json` = `"{}"`, `ingested_at` = `"2026-10-17T00:00:00Z"`.
- `lineItemFactory` sin `invoice_id` crea la factura; default `quantity` 1, `unit_price` 100, `total` 100.
- `decisionFactory` sin `invoice_id` **ni** `ingest_attempt_id` crea una factura. Default `verdict` `"PAGAR"`, `reason_code` `"SUCCESS_TOUCHLESS_STP"`, `policy_version` `"v1"`, `decided_by` `"AGENTE"`, `amount_usd_evaluated` = `total_usd` de la factura. Respeta el CHECK XOR: si se pasa `ingest_attempt_id`, `invoice_id` queda `null`.
- `approvalFactory` sin `decision_id` crea la decisión; `invoice_id` se toma de la decisión. Default `status` `"PENDIENTE"`, `override_with_overbudget` `0`.
- `ingestAttemptFactory` default `attempt_status` `"RECIBIDA"`, `byte_size` `128`, mime `"application/json"`.
- `overrides` siempre gana sobre el default, incluido `id`. **Las claves con valor `undefined` se descartan antes del INSERT**: better-sqlite3 lanza `TypeError` si recibe `undefined`, y `Partial<Row>` permite pasarlo.
- `decisionFactory` sin factura (caso `ingest_attempt_id`) usa `amount_usd_evaluated` 100 por default.

- [x] **Step 1: Registrar el test en `api/package.json`**

Agregar `src/db/factories.test.ts` a la lista del script `test`, junto a los otros `src/db/*`.

- [x] **Step 2: Escribir los tests que fallan**

```ts
// api/src/db/factories.test.ts
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type Database from "better-sqlite3";
import { closeDb, loadDb } from "./index.js";
import { approvalFactory, decisionFactory, ingestAttemptFactory, invoiceFactory, lineItemFactory, vendorFactory } from "./factories.js";

let db: Database.Database;
beforeEach(() => { closeDb(); db = loadDb(":memory:"); });
afterEach(() => { closeDb(); });

test("dos vendors sin override no violan tax_id UNIQUE", () => {
  const a = vendorFactory(db);
  const b = vendorFactory(db);
  assert.notEqual(a.tax_id, b.tax_id);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM vendors WHERE id IN (?,?)").get(a.id, b.id) as { n: number }).n, 2);
});

test("invoiceFactory crea vendor y usa USD por default", () => {
  const invoice = invoiceFactory(db);
  assert.ok(invoice.vendor_id !== null);
  assert.equal(invoice.currency, "USD");
  assert.equal(invoice.total_usd, 100);
});

test("los overrides ganan sobre los defaults", () => {
  const invoice = invoiceFactory(db, { total_amount: 250, total_usd: 250, status: "DECIDIDA" });
  assert.equal(invoice.total_amount, 250);
  assert.equal(invoice.status, "DECIDIDA");
});

test("decisionFactory con ingest_attempt_id deja invoice_id en null (CHECK XOR)", () => {
  const attempt = ingestAttemptFactory(db);
  const decision = decisionFactory(db, { ingest_attempt_id: attempt.id, invoice_id: null });
  assert.equal(decision.invoice_id, null);
  assert.equal(decision.ingest_attempt_id, attempt.id);
});
```

Además, un test corto por factory restante, con estas afirmaciones:
- `lineItemFactory` sin `invoice_id` crea la factura (`SELECT COUNT(*) FROM invoices` sube en 1) y persiste `total` 100.
- `approvalFactory` deriva `invoice_id` de la decisión y nace con `status === "PENDIENTE"`.
- `ingestAttemptFactory(db, { attempt_status: "DUPLICADA" })` respeta el override.
- Cada factory deja la fila leída de vuelta (`SELECT * FROM <tabla> WHERE id = ?`) con los valores devueltos.

- [x] **Step 3: Verificar que fallan**

Run: `bash ./scripts/compose.sh exec -T app npx tsx --test src/db/factories.test.ts`
Expected: FAIL — `Cannot find module './factories.js'`.

- [x] **Step 4: Implementar `api/src/db/factories.ts`**

Un helper privado de insert:

```ts
function insert(db: Database.Database, table: string, row: Record<string, unknown>): void
// columnas = Object.keys(row); placeholders = columnas.map(() => "?"); INSERT INTO table (cols) VALUES (...)
```

Cada factory construye su default completo, aplica `{ ...defaults, ...overrides }`, inserta y devuelve el objeto tipado. Sin `await`, sin transacciones explícitas (una fila por factory; el cascade de `line_items` no aplica acá).

- [x] **Step 5: Verificar que pasan**

Run: `bash ./scripts/compose.sh exec -T app npx tsx --test src/db/factories.test.ts`
Expected: PASS, 0 fallos.

- [x] **Step 6: Typecheck + formato + commit**

```bash
bash ./scripts/compose.sh exec -T app npm run typecheck -w api
bash ./scripts/compose.sh exec -T app npx prettier --write src/db/factories.ts src/db/factories.test.ts -w api
git add api/src/db/factories.ts api/src/db/factories.test.ts api/package.json
git commit -m "feat(api): add row factories for sqlite test data"
```

---

### Task 2: Seeders por perfil

**Files:**
- Create: `api/src/db/seeders.ts`
- Create: `api/src/db/seeders.test.ts`
- Modify: `api/package.json` (script `test`)

**Interfaces:**
- Consumes: `seed(db)` de `./seed.js`, `seedDemoSet(db)` de `./demoSeed.js`.
- Produces:
  ```ts
  // api/src/db/seeders.ts
  export type SeedProfile = "reference" | "demo";
  export const SEED_PROFILES: readonly SeedProfile[];          // ["reference", "demo"]
  export const TABLES: readonly string[];                     // las 12 tablas, en orden de FK
  export type TableCounts = Record<string, number>;
  export interface SeedResult {
    profile: SeedProfile;
    counts: TableCounts;
    verdicts: Record<string, string>;      // {} para "reference"
    approvals_pending: number;
  }
  export function tableCounts(db: Database.Database): TableCounts;
  export function runSeedProfile(db: Database.Database, profile: SeedProfile): SeedResult;
  ```

**Comportamiento fijado:**

- `reference` → vuelve a correr `seed(db)` (idempotente por `INSERT OR IGNORE`; además valida conteos) y devuelve `counts`. `verdicts` = `{}`.
- `demo` → `seedDemoSet(db)` y devuelve su `verdicts` + `approvals_pending` (`SELECT COUNT(*) FROM approvals WHERE status='PENDIENTE'`).
- `TABLES` = `categories, vendors, policies, policy_category_budgets, fx_rates, invoices, ingest_attempts, line_items, decisions, approvals, ledger_entries, notifications`.
- Perfil desconocido → `throw new Error(\`seed_profile_invalido: ${profile}\`)`.

- [x] **Step 1: Registrar el test en `api/package.json`**

Agregar `src/db/seeders.test.ts`.

- [x] **Step 2: Escribir los tests que fallan**

```ts
test("reference deja 8 vendors y ninguna factura", () => {
  const result = runSeedProfile(db, "reference");
  assert.equal(result.counts.vendors, 8);
  assert.equal(result.counts.invoices, 0);
  assert.equal(result.counts.policies, 1);
  assert.deepEqual(result.verdicts, {});
});

test("demo siembra los 12 TC y deja 4 aprobaciones pendientes", () => {
  const result = runSeedProfile(db, "demo");
  assert.equal(Object.keys(result.verdicts).length, 12);
  assert.equal(result.approvals_pending, 4);
  assert.ok(result.counts.invoices >= 11);
});
```

Tercer test: `runSeedProfile(db, "demo")` dos veces seguidas no duplica (`counts.invoices` idéntico). Cuarto: perfil inválido lanza con `/seed_profile_invalido/`.

- [x] **Step 3: Verificar que fallan**

Run: `bash ./scripts/compose.sh exec -T app npx tsx --test src/db/seeders.test.ts`
Expected: FAIL — `Cannot find module './seeders.js'`.

- [x] **Step 4: Implementar `api/src/db/seeders.ts`**

`tableCounts` recorre `TABLES` con `SELECT COUNT(*) AS n FROM <tabla>` (nombres vienen de la constante, no de input externo). `runSeedProfile` es un `switch` sobre el perfil.

- [x] **Step 5: Verificar que pasan**

Run: `bash ./scripts/compose.sh exec -T app npx tsx --test src/db/seeders.test.ts`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add api/src/db/seeders.ts api/src/db/seeders.test.ts api/package.json
git commit -m "feat(api): add seed profiles for reference and demo data"
```

---

### Task 3: Servicio de reset

**Files:**
- Modify: `api/src/db/index.ts` (guardar y exponer la ruta de la base)
- Create: `api/src/db/reset.ts`
- Create: `api/src/db/reset.test.ts`
- Modify: `api/src/db/index.test.ts` (test de `getDbPath`)
- Modify: `api/package.json` (script `test`)

**Interfaces:**
- Consumes: `closeDb`, `loadDb` de `./index.js`; `runSeedProfile`, `SeedProfile`, `SeedResult` de `./seeders.js`.
- Produces:
  ```ts
  // api/src/db/index.ts
  export function getDbPath(): string;   // ruta con la que se abrió la base actual

  // api/src/db/reset.ts
  export interface ResetOptions { dbPath: string; profile: SeedProfile }
  export interface ResetResult extends SeedResult {
    deleted_files: string[];      // rutas realmente borradas
    cleared_uploads: number;      // entradas borradas de <dir(dbPath)>/uploads
    duration_ms: number;
  }
  export function resetDatabase(options: ResetOptions): ResetResult;
  export function removeDbFiles(dbPath: string): string[];   // ["", "-wal", "-shm"] existentes
  export function clearUploads(dir: string): number;         // entradas borradas
  ```

**Comportamiento fijado:**

- `getDbPath()` lanza el mismo error que `getDb()` si no hay base cargada (`DB no inicializada…`).
- `resetDatabase` es **totalmente síncrono**: `closeDb()` → `removeDbFiles` → `clearUploads(dirname(dbPath))` → `loadDb(dbPath)` (reaplica schema + `seed()`) → `runSeedProfile(db, profile)`. Nunca hay `await` en el medio.
- `removeDbFiles` borra `dbPath`, `dbPath + "-wal"`, `dbPath + "-shm"` con `rmSync(..., { force: true })` y devuelve solo los que existían.
- `clearUploads` hace `mkdirSync(dir, { recursive: true })` y borra cada entrada con `rmSync(..., { recursive: true, force: true })`; devuelve cuántas borró.
- `dbPath === ":memory:"` → `throw new Error("reset_no_soportado_en_memoria")`. Si no, borraría el archivo `./:memory:`.

- [x] **Step 1: Registrar los tests en `api/package.json`**

Agregar `src/db/reset.test.ts`.

- [x] **Step 2: Escribir los tests que fallan**

Setup de cada test: `dataDir = mkdtempSync(join(tmpdir(), "faktur-reset-"))`, `dbPath = join(dataDir, "faktur.db")`, `loadDb(dbPath)`.

```ts
test("reset con reference deja la base vacía de facturas y vendors re-sembrados", () => {
  invoiceFactory(db, {});                       // ensucia
  const result = resetDatabase({ dbPath, profile: "reference" });
  assert.equal(result.counts.invoices, 0);
  assert.equal(result.counts.vendors, 8);
  assert.equal((getDb().prepare("SELECT COUNT(*) AS n FROM invoices").get() as { n: number }).n, 0);
});

test("reset borra -wal y -shm", () => {
  writeFileSync(dbPath + "-wal", "");
  writeFileSync(dbPath + "-shm", "");
  const removed = removeDbFiles(dbPath);
  assert.ok(removed.some((p) => p.endsWith("-wal")));
  assert.ok(removed.some((p) => p.endsWith("-shm")));
});

test("reset vacía uploads/ y cuenta las entradas", () => {
  writeFileSync(join(dataDir, "uploads", "hash-abc"), "x");
  assert.equal(clearUploads(join(dataDir, "uploads")), 1);
});

test("reset con demo siembra los fixtures y es idempotente", () => {
  const first = resetDatabase({ dbPath, profile: "demo" });
  const second = resetDatabase({ dbPath, profile: "demo" });
  assert.equal(first.counts.invoices, second.counts.invoices);
  assert.equal(second.approvals_pending, 4);
});

test("reset rechaza :memory:", () => {
  assert.throws(() => resetDatabase({ dbPath: ":memory:", profile: "reference" }), /reset_no_soportado_en_memoria/);
});
```

- [x] **Step 3: Verificar que fallan**

Run: `bash ./scripts/compose.sh exec -T app npx tsx --test src/db/reset.test.ts`
Expected: FAIL — `Cannot find module './reset.js'`.

- [x] **Step 4: Implementar `getDbPath` en `api/src/db/index.ts`**

Guardar `dbPath` en una variable module-level junto a `db`; setearla en `loadDb` y limpiarla en `closeDb`.

- [x] **Step 5: Implementar `api/src/db/reset.ts`**

Como se describió arriba. Contar `duration_ms` con `Date.now()` alrededor del bloque.

- [x] **Step 6: Verificar que pasan**

Run: `bash ./scripts/compose.sh exec -T app npx tsx --test src/db/reset.test.ts src/db/index.test.ts`
Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add api/src/db/index.ts api/src/db/index.test.ts api/src/db/reset.ts api/src/db/reset.test.ts api/package.json
git commit -m "feat(api): add database reset service"
```

---

### Task 4: Flags de entorno y rutas de administración

**Files:**
- Modify: `api/src/config/env.ts` (dos variables nuevas)
- Modify: `api/src/config/env.test.ts` (defaults y parseo)
- Modify: `api/src/app.ts` (`BuildAppOptions.admin` + registro)
- Modify: `api/src/server.ts` (mapear env → opciones)
- Create: `api/src/routes/admin.ts`
- Create: `api/src/routes/admin.test.ts`
- Modify: `api/package.json` (script `test`)

**Interfaces:**
- Produces:
  ```ts
  // api/src/config/env.ts  (agregados al schema zod)
  ALLOW_DB_RESET: boolean;        // z.enum(["true","false"]).default("false").transform(v => v === "true")
  ADMIN_TOKEN?: string;           // opcional; agregar "ADMIN_TOKEN" a BLANK_IS_UNDEFINED

  // api/src/app.ts
  export interface BuildAppOptions {
    webDist?: string;
    logLevel?: string;
    admin?: { enabled: boolean; token?: string; production: boolean };
  }

  // api/src/routes/admin.ts
  export interface AdminOptions { enabled: boolean; token?: string; production: boolean }
  export async function registerAdminRoutes(app: FastifyInstance, options: AdminOptions): Promise<void>;
  ```

**Contrato HTTP fijado:**

- `GET /api/admin/db` → `200 { enabled, reason, profiles, counts, policy_version }`
  - `reason`: `"disabled"` si `!enabled`; `"missing_token"` si `production && token === undefined`; si no, `null`.
  - `enabled` es el valor efectivo (el mismo que decide si el POST funciona).
  - `policy_version` sale de `SELECT version FROM policies WHERE is_active = 1`.
- `POST /api/admin/db/reset`, body `{ profile: "reference" | "demo", confirm: "REINICIAR" }` →
  - `403 { error: "db_reset_disabled" }` si `!options.enabled`
  - `403 { error: "db_reset_token_missing" }` si `production && token === undefined`
  - `401 { error: "admin_token_invalid" }` si hay token configurado y el header `x-admin-token` no coincide
  - `422 { error: "invalid_reset_request" }` si `profile` no está en `SEED_PROFILES` o `confirm !== "REINICIAR"`
  - `200` con `ResetResult` si todo bien
- `dbPath` = `getDbPath()`; `profile` se pasa tal cual al servicio. El único acceso a `process.env` sigue siendo `config/env.ts` y `server.ts`.

- [x] **Step 1: Registrar el test en `api/package.json`**

Agregar `src/routes/admin.test.ts`.

- [x] **Step 2: Escribir los tests que fallan**

Setup igual al de `routes/invoices.test.ts` pero con base **en archivo**: `dataDir = mkdtempSync(...)`, `dbPath = join(dataDir, "faktur.db")`, `db = loadDb(dbPath)`. **Cada test crea su propia app** con las opciones de admin que quiere probar (las rutas se registran en `buildApp`), y un `afterEach` hace `await app.close()` + `closeDb()` + `rmSync(dataDir, { recursive: true, force: true })`.

```ts
test("sin ALLOW_DB_RESET el reset responde 403", async () => {
  app = await buildApp({ logLevel: "silent", admin: { enabled: false, production: false } });
  const res = await app.inject({ method: "POST", url: "/api/admin/db/reset", payload: { profile: "reference", confirm: "REINICIAR" } });
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.json(), { error: "db_reset_disabled" });
});

test("en producción sin ADMIN_TOKEN responde 403 fail-closed", async () => {
  app = await buildApp({ logLevel: "silent", admin: { enabled: true, production: true } });
  const res = await app.inject({ method: "POST", url: "/api/admin/db/reset", payload: { profile: "reference", confirm: "REINICIAR" } });
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.json(), { error: "db_reset_token_missing" });
});

test("token incorrecto responde 401 y correcto 200", async () => {
  app = await buildApp({ logLevel: "silent", admin: { enabled: true, production: true, token: "s3cret" } });
  const bad = await app.inject({ method: "POST", url: "/api/admin/db/reset", headers: { "x-admin-token": "nope" }, payload: { profile: "reference", confirm: "REINICIAR" } });
  assert.equal(bad.statusCode, 401);
  const ok = await app.inject({ method: "POST", url: "/api/admin/db/reset", headers: { "x-admin-token": "s3cret" }, payload: { profile: "demo", confirm: "REINICIAR" } });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().approvals_pending, 4);
});

test("confirm distinto de REINICIAR responde 422", async () => {
  const res = await app.inject({ method: "POST", url: "/api/admin/db/reset", payload: { profile: "demo", confirm: "si" } });
  assert.equal(res.statusCode, 422);
});

test("GET /api/admin/db devuelve perfiles y conteos", async () => {
  const res = await app.inject({ method: "GET", url: "/api/admin/db" });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().profiles, ["reference", "demo"]);
  assert.equal(res.json().counts.vendors, 8);
});
```

- [x] **Step 3: Verificar que fallan**

Run: `bash ./scripts/compose.sh exec -T app npx tsx --test src/routes/admin.test.ts`
Expected: FAIL — `Cannot find module './admin.js'`.

- [x] **Step 4: Implementar env + rutas + wiring**

`server.ts` pasa `admin: { enabled: env.ALLOW_DB_RESET, token: env.ADMIN_TOKEN, production: env.NODE_ENV === "production" }`. `app.ts` registra `registerAdminRoutes(app, options.admin ?? { enabled: false, production: false })` — sin opciones, las rutas quedan apagadas. `GET` calcula `reason` con la misma función que usa el POST para decidir.

- [x] **Step 5: Verificar que pasan**

Run: `bash ./scripts/compose.sh exec -T app npx tsx --test src/routes/admin.test.ts src/config/env.test.ts`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add api/src/config api/src/app.ts api/src/server.ts api/src/routes/admin.ts api/src/routes/admin.test.ts api/package.json
git commit -m "feat(api): add admin endpoints to reset and reseed the database"
```

---

### Task 5: Pantalla `/datos` en la web

**Files:**
- Create: `web/src/types/admin.ts`
- Create: `web/src/pages/Datos.tsx`
- Modify: `web/src/router.tsx` (ruta `datos`)
- Modify: `web/src/components/layout/AppShell.tsx` (ítem de nav, icono `Database` de `lucide-react`)

**Interfaces:**
- Consumes: `GET /api/admin/db`, `POST /api/admin/db/reset` (contrato de Task 4).
- Produces: `web/src/types/admin.ts`
  ```ts
  export type SeedProfile = "reference" | "demo";
  export interface DbStatus { enabled: boolean; reason: "disabled" | "missing_token" | null;
    profiles: SeedProfile[]; counts: Record<string, number>; policy_version: string }
  export interface ResetResult { profile: SeedProfile; counts: Record<string, number>;
    verdicts: Record<string, string>; approvals_pending: number; deleted_files: string[];
    cleared_uploads: number; duration_ms: number }
  ```

**Comportamiento fijado (la web no tiene tests: se verifica a mano en Step 5):**

- La página carga el estado al montar; mientras carga, `Skeleton` (`components/ui/skeleton.tsx`).
- Muestra los 12 conteos en tarjetas (`BentoGrid`/`Card`), agrupados en "Catálogo" (categories, vendors, policies, policy_category_budgets, fx_rates) y "Movimiento" (invoices, ingest_attempts, line_items, decisions, approvals, ledger_entries, notifications).
- Selector de perfil: dos `Card` clickeables con descripción ("Base como recién instalada" / "Base con los 12 casos demo").
- Botón `Reiniciar base` (`Button variant="destructive"`) abre un `Dialog` que:
  - lista qué se borra (base SQLite + `uploads/`) y qué se siembra (perfil elegido);
  - exige escribir `REINICIAR` en un `Input` para habilitar el confirmar;
  - si el server respondió `401 admin_token_invalid`, muestra un `Input` de token y lo guarda en `sessionStorage` (`faktur.admin_token`) para reintentar.
- Si `status.enabled === false`: el botón queda `disabled` y se explica el motivo (`reason === "disabled"` → "Falta ALLOW_DB_RESET=true"; `"missing_token"` → "Falta configurar ADMIN_TOKEN").
- Tras el reset: toast/`Card` con `verdicts` contados por valor (PAGAR/FRENAR/ESCALAR), `approvals_pending`, `duration_ms` y un link a `/bandeja` y `/`.

- [x] **Step 1: Tipos y cliente**

`web/src/types/admin.ts` con las interfaces de arriba; helpers `fetchDbStatus()` y `resetDb(profile, token?)` dentro de la página (patrón `fetch` inline como `Bandeja.tsx`).

- [x] **Step 2: Página `Datos.tsx`**

Implementar el comportamiento fijado usando los componentes existentes (`card.tsx`, `button.tsx`, `dialog.tsx`, `input.tsx`, `skeleton.tsx`). Nada de librerías nuevas.

- [x] **Step 3: Router + nav**

`router.tsx`: `{ path: "datos", element: <Datos /> }` antes del catch-all. `AppShell.tsx`: `{ to: "/datos", label: "Datos de demo", icon: Database }` al final de `navItems`.

- [x] **Step 4: Typecheck**

Run: `bash ./scripts/compose.sh exec -T app npm run typecheck -w web`
Expected: sin errores.

- [x] **Step 5: Prueba manual**

Con el dev arriba (`bash ./scripts/compose.sh up -d --build`) y `ALLOW_DB_RESET=true`: abrir `http://localhost:5173/datos`, verificar (a) conteos, (b) que el botón no se habilita sin escribir `REINICIAR`, (c) reset `reference` → invoices 0, (d) reset `demo` → 11+ facturas y 4 pendientes, (e) `/bandeja` muestra los pendientes.
Expected: los cinco puntos OK.

- [x] **Step 6: Formato + commit**

```bash
bash ./scripts/compose.sh exec -T app npx prettier --write src/pages/Datos.tsx src/types/admin.ts src/router.tsx src/components/layout/AppShell.tsx -w web
git add web/src
git commit -m "feat(web): add database reset page"
```

---

### Task 6: Configuración de despliegue y documentación

**Files:**
- Modify: `compose.dev.yml` (`ALLOW_DB_RESET: "true"` en `environment`)
- Modify: `render.yaml` (`ALLOW_DB_RESET` = `"true"`, `ADMIN_TOKEN` con `sync: false`)
- Create: `docs/datos-demo.md`
- Modify: `README.md` (una línea enlazando el doc)

- [x] **Step 1: `compose.dev.yml`**

Agregar `ALLOW_DB_RESET: "true"` al bloque `environment` del servicio (junto a `NODE_ENV`). Sin `ADMIN_TOKEN`: en desarrollo el POST no pide token.

- [x] **Step 2: `render.yaml`**

Bajo `envVars`:
```yaml
      - key: ALLOW_DB_RESET
        value: "true"
      - key: ADMIN_TOKEN
        sync: false
```
`sync: false` deja el valor a cargo del usuario en el dashboard. Sin token, el endpoint queda apagado (403), que es el comportamiento seguro esperado.

- [x] **Step 3: Escribir `docs/datos-demo.md`**

Contenido mínimo: qué hace cada perfil, qué borra el reset (base + uploads, irreversible), cómo se habilita (`ALLOW_DB_RESET`, `ADMIN_TOKEN`), la tabla de códigos de error del endpoint, y la receta `db-demo` vs el botón de la UI.

- [x] **Step 4: Verificar el arranque con el flag**

Run: `bash ./scripts/compose.sh exec -T app sh -c 'echo $ALLOW_DB_RESET'`
Expected: `true`. Y contra la API: `curl -s localhost:3000/api/admin/db | head -c 200` muestra `"enabled":true`.

- [x] **Step 5: Commit**

```bash
git add compose.dev.yml render.yaml docs/datos-demo.md README.md
git commit -m "chore(infra): enable database reset flag in dev and render"
```

---

## Fuera de alcance

- Perfil `bulk` con facturas aleatorias para volumen.
- Migraciones o versionado de schema (sigue siendo borrar-y-recrear).
- Autenticación de usuarios: el único control es `ADMIN_TOKEN`.
- Factories para `policies`, `fx_rates` y `categories`: esas filas las pone `seed()` y los tests las reciben ya cargadas.
