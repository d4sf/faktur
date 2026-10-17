# API MVP end-to-end — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar el backend del MVP (T6–T17, T24, T25) sobre el código ya mergeado, de modo que una factura entre por HTTP, se decida con el motor determinista, deje auditoría reproducible, abra bandeja HITL cuando corresponde y salga en CSV y métricas.

**Architecture:** Fastify 5 + `better-sqlite3` síncrono con el schema de `api/src/db/schema.ts` (SQL plano, sin ORM). Tres capas nuevas: `repositories/` (SQL y mapeo de filas), `services/` (orquestación, transacciones y reglas de aplicación), `routes/` (HTTP y validación Zod). El motor (`domain/ruleEngine.ts`) sigue siendo una función pura: ningún route decide dinero.

**Tech Stack:** Node 22 · TypeScript ESM (`NodeNext`, imports con `.js`) · Fastify 5 · `better-sqlite3` · Zod 4 · `@google/genai` · `node:test` + `tsx --test`.

**Spec:** `docs/backlog_implementacion_mvp.md` (T6–T17, T24, T25) + `docs/PRD_Faktur.md` + `docs/propuesta_modelo_ER_faktur.md`. Este plan no reemplaza esas fuentes: las ejecuta.

## Nota de reconciliación (leer antes de empezar)

`origin/main` ya trae T3 mergeada con **SQL plano** (`api/src/db/schema.ts`, `index.ts`, `seed.ts`). El trabajo local con Drizzle quedó guardado en `stash@{0}` (`wip: drizzle sqlite T3 (local)`) y **no** se usa en este plan. Si se decide descartarlo, `git stash drop stash@{0}`; si se quiere conservar, queda como referencia. Nada de este plan depende de Drizzle ni de `api/drizzle/`.

## Global Constraints

- ESM + `module: NodeNext`: todo import relativo termina en `.js`, aunque el archivo sea `.ts`.
- Tests con `node:test` y `assert/strict`. **Cada archivo de test nuevo se agrega a mano** al script `test` de `api/package.json` (está hardcodeado).
- Los tests HTTP usan `loadDb(":memory:")` + `closeDb()` en `beforeEach`/`afterEach`; nunca escriben en `DATA_DIR` real.
- Money: `REAL` con redondeo a 2 decimales (`Math.round(n * 100) / 100`) en cada frontera.
- Fechas: `YYYY-MM-DD` para fechas de factura, ISO-8601 UTC (`new Date().toISOString()`) para timestamps.
- IDs: `randomUUID()` de `node:crypto`.
- snake_case en DB, en las filas de repositorio y en el JSON de la API (el dominio Zod ya lo usa).
- Errores de API: `{ "error": "<code>" }` con `code` en snake_case; nunca stack ni mensaje de SQLite al cliente.
- La API no mueve dinero: `ledger_entries` es compromiso, no pago.
- El LLM no decide: `extract` solo persiste `extraction_json` validado; `decide` llama a `evaluate`.
- Antes de cerrar cada task: `just fmt`, `just check` (typecheck + lint + test) en verde.
- Commits en inglés, Conventional Commits, un commit por task, mensaje el del backlog.
- Los `git commit -am` del plan asumen un árbol sin cambios ajenos; si hay otros cambios, usar `git add <archivos>` en su lugar.

## Review Focus

Estos son los casos que el spec implica pero ningún test de tarea obvio cubre. Cada uno tiene su test en la tarea que lo posee.

1. **Dos uploads concurrentes del mismo archivo** — el segundo debe terminar en `FRENAR` por `ERR_DUPLICATE_INVOICE`, no en 500 por `UNIQUE constraint failed` (T9).
2. **Gemini devuelve JSON válido sin `vendor_tax_id`** — la factura debe frenar por `ERR_INVALID_DATA`, no romper el endpoint ni pagar (T10/T12).
3. **Doble clic en "Autorizar"** — una sola fila en `ledger_entries` y la segunda respuesta 200 idempotente (T15/T16).
4. **`motivo_legible` con coma, comilla doble o salto de línea** — el CSV debe seguir siendo parseable con 14 columnas (T8).
5. **Base vacía en `/api/audit-trail`** — `touchless_rate` 0 y `budget_remaining` igual al presupuesto, sin `NaN` ni división por cero (T25).

---

### Task 1: T6 — Runner del motor contra `ground_truth.json`

**Files:**
- Create: `api/src/domain/ruleEngine.fixtures.test.ts`
- Modify: `api/package.json` (script `test`)

**Interfaces:**
- Consumes: `evaluate(invoice: EvaluableInvoice, policy: PolicySpec, ctx: EvaluationContext): EvaluationResult`, `loadPolicySpec(): PolicySpec`, `globalConfidence(f): number | undefined`.
- Produces: nada de runtime; es la red de seguridad del motor.

- [ ] **Step 1: Escribir el test que falla**

Carga `fixtures/TC-*.json` y `fixtures/ground_truth.json`, ordena por `dependsOn` (topológico), y para cada TC arma el contexto acumulando los TC previos. Tasas FX locales `{ USD: 1, MXN: 0.055, COP: 0.00024, EUR: 1.08 }` (espejo de `fx_rates`). `total_usd = round(total_amount * rate, 2)`; `vendor` se busca en `api/src/db/seed.ts` por `tax_id`; `budgetState` acumula montos de los TC ya procesados con veredicto `PAGAR`.

```ts
for (const tc of ordered) {
  const result = evaluate(invoiceOf(tc), policy, contextFor(tc));
  assert.deepEqual(
    { verdict: result.verdict, reason_code: result.reason_code },
    { verdict: groundTruth[tc].expected_verdict, reason_code: groundTruth[tc].expected_reason_code },
    `${tc}: ${result.explanation}`,
  );
}
```

- [ ] **Step 2: Correr y ver el fallo**

Run: `bash ./scripts/compose.sh exec -T app npx tsx --test src/domain/ruleEngine.fixtures.test.ts` (workdir `/app/api`).
Expected: FAIL si el orden de precedencia o algún mapeo de fixture está mal; PASS si el motor ya es correcto.

- [ ] **Step 3: Corregir el arnés, no el motor**

Si un TC falla, el bug está en cómo el test arma el contexto (vendor, presupuesto, dependencias), salvo que `expected_reason_code` contradiga el spec: en ese caso se corrige el fixture en un commit aparte y se anota por qué.

- [ ] **Step 4: Agregar el archivo al script `test` y verificar**

Modificar `api/package.json` → `"test": "tsx --test src/app.test.ts ... src/domain/ruleEngine.fixtures.test.ts"`.
Run: `bash ./scripts/compose.sh exec -T app npm test` → 100% pass, sin `GEMINI_API_KEY` y sin red.

- [ ] **Step 5: Commit**

```bash
git add api/src/domain/ruleEngine.fixtures.test.ts api/package.json
git commit -m "test(api): run rule engine against ground truth fixtures"
```

---

### Task 2: T7 — `policy_version` congelada al persistir decisiones

**Files:**
- Create: `api/src/repositories/decisions.ts`, `api/src/repositories/decisions.test.ts`
- Modify: `api/package.json`

**Interfaces:**
- Produces:
  - `insertDecision(row: NewDecision): string` — escribe `decisions` y devuelve el `id`.
  - `getDecision(id: string): DecisionRow | null`
  - `listDecisionsByInvoice(invoiceId: string): DecisionRow[]` (orden `decided_at DESC`)
  - `NewDecision = Omit<Decision, "id"> & { id?: string }` con `policy_version` obligatoria.
- Invariante: nunca `UPDATE` sobre `decisions` (RI-8). Una re-evaluación inserta fila nueva.

- [ ] **Step 1: Test que falla**

```ts
it("congela la version y no reescribe la decision vieja", () => {
  const first = insertDecision({ ...base, policy_version: "v1", verdict: "PAGAR" });
  // crear v2 y desactivar v1 con SQL directo en el test
  const second = insertDecision({ ...base, policy_version: "v2", verdict: "ESCALAR" });
  assert.equal(getDecision(first)?.verdict, "PAGAR");
  assert.equal(getDecision(second)?.policy_version, "v2");
  assert.equal(listDecisionsByInvoice(base.invoice_id).length, 2);
});
```

- [ ] **Step 2: Correr y ver el fallo**

Run: `npx tsx --test src/repositories/decisions.test.ts` → FAIL `Cannot find module './decisions.js'`.

- [ ] **Step 3: Implementar con SQL parametrizado**

`db.prepare(...).run(...)` con columnas explícitas; `id = row.id ?? randomUUID()`. La fila debe respetar el `CHECK` de RI-11 (exactamente uno de `invoice_id` / `ingest_attempt_id`): validar en TS y lanzar `Error("decision_anchor_invalid")` antes de tocar SQLite.

- [ ] **Step 4: Test verde + script + commit**

Run: `npx tsx --test src/repositories/decisions.test.ts` → PASS. Agregar al script `test`.
```bash
git add api/src/repositories/decisions.ts api/src/repositories/decisions.test.ts api/package.json
git commit -m "feat(api): stamp decisions with frozen policy version"
```

---

### Task 3: T8 — CSV reproducible y `GET /api/report.csv`

**Files:**
- Create: `api/src/services/report.ts`, `api/src/services/report.test.ts`, `api/src/routes/report.ts`
- Modify: `api/src/app.ts`, `api/package.json`

**Interfaces:**
- Produces: `buildReportCsv(db: Database.Database): string` y `registerReportRoutes(app: FastifyInstance): Promise<void>`.
- Columnas exactas (MVP §7): `invoice_id, archivo, proveedor, beneficiario_id, monto, moneda, fecha_vencimiento, estado, regla_disparada, motivo_legible, requirio_humano, decidido_por, policy_version, timestamp`.
- `estado` colapsa `invoices.status` a `PAGADA | FRENADA | ESCALADA | PENDIENTE`.

- [ ] **Step 1: Test de contenido y de escapado (Review Focus 4)**

```ts
it("una fila por decision, 14 columnas y motivo entre comillas", () => {
  const csv = buildReportCsv(db);
  assert.equal(csv.split("\r\n")[0].split(",").length, 14);
  assert.match(csv, /"Presupuesto insuficiente, saldo \$0"/);
  assert.equal(buildReportCsv(db), csv); // determinista
});
```

- [ ] **Step 2: Correr → FAIL**

Run: `npx tsx --test src/services/report.test.ts`.

- [ ] **Step 3: Implementar**

JOIN `invoices + ingest_attempts + vendors + decisions + approvals + policies`; una fila por `decisions.id`; escapar con `"` duplicada y envolver todo campo en comillas; `\r\n` como fin de línea; orden `decided_at ASC, id ASC` para que sea determinista. Para TC-03, `motivo_legible` cita la fecha del registro original (`invoices.ingested_at` de la canónica).

- [ ] **Step 4: Ruta + test HTTP**

`GET /api/report.csv` responde `200`, `content-type: text/csv; charset=utf-8`, `content-disposition: attachment; filename="faktur-report.csv"`.
```ts
const res = await app.inject({ method: "GET", url: "/api/report.csv" });
assert.equal(res.statusCode, 200);
assert.match(res.headers["content-type"]!, /text\/csv/);
assert.notMatch(res.body, /<html/i);
```

- [ ] **Step 5: `just check` + commit**

```bash
git commit -am "feat(api): add reproducible decision report csv endpoint"
```

---

### Task 4: T9 — Upload multipart, SHA-256 e intentos de ingesta

**Files:**
- Create: `api/src/repositories/ingest.ts`, `api/src/services/ingest.ts`, `api/src/services/ingest.test.ts`, `api/src/routes/invoices.ts`, `api/src/routes/invoices.test.ts`
- Modify: `api/src/app.ts`, `api/src/server.ts`, `api/src/config/env.ts` (si falta `MAX_UPLOAD_BYTES`), `api/package.json`

**Interfaces:**
- Produces:
  - `createAttempt(row: NewIngestAttempt): string`
  - `findInvoiceByHash(hash: string): { id: string; ingested_at: string } | null`
  - `findAttemptByHash(hash: string): { id: string; invoice_id: string | null } | null`
  - `linkAttemptToInvoice(attemptId: string, invoiceId: string): void`
  - `ingestFile(input: { buffer: Buffer; fileName: string; mimeType: string }): IngestResult`
  - `IngestResult = { attempt_id: string; invoice_id: string | null; status: "RECIBIDA" | "DUPLICADA" | "RECHAZADA"; decision?: EvaluationResult }`
- `POST /api/invoices` acepta multipart (`file`), límite 5 MB, MIME `application/pdf | image/png | image/jpeg | application/json`.

**Decisión cerrada (el schema manda sobre la redacción del backlog):** `invoices.currency`, `total_amount`, `fx_rate_used`, `total_usd` y `extraction_json` son `NOT NULL` con FK a `fx_rates`, así que una fila de `invoices` incompleta no puede existir. Por eso **el upload crea solo el intento** (y la decisión `FRENAR` si el hash ya se vio); la factura nace en la extracción, ya completa, y el intento se enlaza con `UPDATE ingest_attempts SET invoice_id = ?`. La ruta de reenvío sigue respondiendo veredicto, no 409.

- [ ] **Step 1: Test de hash y dedup (sin HTTP)**

```ts
it("el mismo buffer dos veces: segunda DUPLICADA y decision FRENAR anclada al intento", () => {
  const a = ingestFile({ buffer, fileName: "tc-01.json", mimeType: "application/json" });
  const b = ingestFile({ buffer, fileName: "tc-01-copia.json", mimeType: "application/json" });
  assert.equal(a.status, "RECIBIDA");
  assert.equal(b.status, "DUPLICADA");
  assert.equal(getDecisionForAttempt(b.attempt_id)?.reason_code, "ERR_DUPLICATE_INVOICE");
});
```

- [ ] **Step 2: Test HTTP de reenvío (Review Focus 1)**

Dos `app.inject` con el mismo payload: el segundo responde `200` con `verdict: "FRENAR"` (no 500), y hay exactamente 2 filas en `ingest_attempts` y 0 en `invoices` (la factura todavía no se extrajo).

- [ ] **Step 3: Implementar el servicio**

`sha256(buffer).digest("hex")` **antes** de cualquier llamada externa; guardar el buffer en `${DATA_DIR}/uploads/${hash}`; insertar el intento siempre. Dedup = `invoices.file_hash` **o** un intento previo con el mismo hash. Si es duplicado → `DUPLICADA` + decisión `FRENAR` con `policy_version` activa y `amount_usd_evaluated: 0`; si no → `RECIBIDA`.

- [ ] **Step 4: Registrar multipart y wiring de arranque**

En `app.ts`: `await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1 } })` y `registerInvoiceRoutes(app)`.
En `server.ts`: `loadDb(join(env.DATA_DIR, "faktur.db"))` antes de `buildApp`, y `closeDb()` en `SIGTERM`.

- [ ] **Step 5: `just check` + commit**

```bash
git commit -am "feat(api): add multipart upload with sha-256 dedup and ingest attempts"
```

---

### Task 5: T10 + T11 — Extracción, normalización FX y persistencia

**Files:**
- Create: `api/src/services/extract.ts`, `api/src/services/extract.test.ts`, `api/src/services/fx.ts`, `api/src/services/fx.test.ts`, `api/src/routes/ingest.ts`
- Modify: `api/src/app.ts`, `api/package.json`

**Interfaces:**
- Produces:
  - `extractInvoice(input: { buffer: Buffer; mimeType: string }, caller?: GeminiCaller): Promise<ExtractedInvoice>`
  - `toUsd(amount: number, currency: string, db: Database.Database): { total_usd: number; fx_rate_used: number }`
  - `persistExtraction(attemptId: string, extracted: ExtractedInvoice, db): { invoice_id: string }`
  - `POST /api/ingest-attempts/:id/extract`
- Consumes: `toGeminiResponseSchema` (T2), `ExtractedInvoice.safeParse`, `globalConfidence`, `linkAttemptToInvoice` (Task 4).
- Errores: `400 invalid_file_type`, `404 not_found`, `503 extraction_unavailable` (sin key o cuota), `422 extraction_invalid` (Zod falla; el intento queda `RECHAZADA`), `409 already_processed`.

**Desvío registrado:** el backlog nombra `POST /api/invoices/{id}/extract`, pero en este schema la factura todavía no existe cuando hace falta extraer. La ruta usa el id del intento; una ruta `/api/invoices/:id/extract` puede agregarse luego como re-extracción reutilizando el mismo servicio.

- [ ] **Step 1: Test de extracción con cliente inyectado (sin red)**

Definir `type GeminiCaller = (req: { model: string; contents: unknown; config: unknown }) => Promise<unknown>` y pasarlo como dependencia. Casos: respuesta válida → `ExtractedInvoice`; campo extra → se descarta; respuesta inválida → `422`.

- [ ] **Step 2: Test de FX (`fx.test.ts`)**

```ts
it("EUR 5000 -> 5400.00 y la tasa queda congelada", () => {
  const { total_usd, fx_rate_used } = toUsd(5000, "EUR", db);
  assert.equal(total_usd, 5400);
  assert.equal(fx_rate_used, 1.08);
  // cambiar fx_rates después no altera la factura ya escrita
});
```

Moneda fuera de `fx_rates` o de `allowed_currencies` → lanza `currency_not_allowed` (deriva en `FRENAR` en Task 6, no en 500).

- [ ] **Step 3: Test de persistencia**

Un JSON mock sin `vendor_tax_id` → se crea `invoices` con `status: "EXTRAIDA"`, `extraction_json` guardado y `line_items` de la factura; el intento queda enlazado.

- [ ] **Step 4: Implementar la transacción**

`INSERT INTO invoices` (con `currency`, `total_amount`, `fx_rate_used`, `total_usd`, `extraction_json`, `extraction_confidence`, `file_hash`, `ingested_at`) + `line_items` + `linkAttemptToInvoice`, todo dentro de `db.transaction()`. `extraction_confidence = globalConfidence(field_confidence)`.

- [ ] **Step 5: Ruta + commit de T10**

```bash
git add api/src/services/extract.ts api/src/services/extract.test.ts api/src/routes/ingest.ts api/src/app.ts api/package.json
git commit -m "feat(api): add structured invoice extraction with gemini"
```

- [ ] **Step 6: Commit de T11**

```bash
git add api/src/services/fx.ts api/src/services/fx.test.ts
git commit -m "feat(api): normalize invoice amounts to usd"
```

---

### Task 6: T12 — Decisión, transiciones de estado y endpoints

**Files:**
- Create: `api/src/services/decide.ts`, `api/src/services/decide.test.ts`
- Modify: `api/src/routes/invoices.ts`, `api/src/routes/ingest.ts`, `api/package.json`

**Interfaces:**
- Produces:
  - `decideInvoice(invoiceId: string, db): DecisionRow` — arma `EvaluableInvoice` + `EvaluationContext` (vendor, facturas existentes, `budgetState` desde `ledger_entries`) y llama a `evaluate`.
  - `POST /api/invoices/:id/decide` → `{ verdict, reason_code, explanation, policy_version, decision_id }`.
  - `POST /api/invoices` (upload) encadena `ingestFile → extractAttempt → persistExtraction → decideInvoice` y responde el veredicto en una sola llamada; los endpoints sueltos quedan para la demo de "LLM caído".
- Transiciones: `PAGAR` → `DECIDIDA`; `ESCALAR` → `PENDIENTE_APROBACION` + fila `PENDIENTE` en `approvals`; `FRENAR` → `FRENADA` y **ninguna** fila en `approvals` (RI-3).

- [ ] **Step 1: Test de decisión y transiciones**

Tres facturas (PAGAR, ESCALAR, FRENAR) → estado final correcto; la ESCALAR deja exactamente una `approval` `PENDIENTE`; la FRENAR no deja ninguna.

- [ ] **Step 2: Test de re-evaluación y Review Focus 2**

Una factura sin `vendor_tax_id` (creada en Task 5) decide `FRENAR` por `ERR_INVALID_DATA`. Re-evaluar la misma factura inserta una **segunda** fila en `decisions` y no muta la primera (RI-8).

- [ ] **Step 3: Implementar `decideInvoice` como transacción**

`db.transaction(() => { insertDecision(...); updateInvoiceStatus(...); if (verdict === "ESCALAR") insertApproval(...); })()`. `policy_version` sale de `policies WHERE is_active = 1`; `amount_usd_evaluated = invoices.total_usd`; `decided_by = "AGENTE"`.

- [ ] **Step 4: Endpoint + encadenado del upload**

`404 not_found` si la factura no existe; `409 status_transition_invalid` si no está `EXTRAIDA` (o `RECIBIDA` con extracción ya hecha). El upload responde `201` con `{ attempt_id, invoice_id, verdict, reason_code, explanation }`.

- [ ] **Step 5: `just check` + commit**

```bash
git add api/src/services/decide.ts api/src/services/decide.test.ts api/src/routes/invoices.ts api/src/routes/ingest.ts api/package.json
git commit -m "feat(api): add invoice upload, extract and decide endpoints"
```

---

### Task 7: T16 — Ledger: solo PAGAR imputa

**Files:**
- Create: `api/src/repositories/ledger.ts`, `api/src/services/ledger.test.ts`
- Modify: `api/src/services/decide.ts` (PAGAR), `api/src/repositories/decisions.ts`, `api/package.json`

**Interfaces:**
- Produces:
  - `insertLedgerEntry(input: { invoice_id; decision_id; policy_version; amount_usd }): string | null`
  - `getBudgetState(db): BudgetState` — `monthlySpent = SUM(amount_usd)` del período; `categorySpent` por `vendors.category`.
  - `budgetRemaining(db): number`
- Invariante: idempotente por `decision_id`: si ya existe fila, devuelve `null` sin insertar.

- [ ] **Step 1: Test de "solo PAGAR" y doble clic**

```ts
it("dos llamadas para la misma decision dejan una sola fila", () => {
  const a = insertLedgerEntry({ ..., decision_id });
  const b = insertLedgerEntry({ ..., decision_id });
  assert.ok(a);
  assert.equal(b, null);
  assert.equal(countLedger(), 1);
  assert.equal(budgetRemaining(db), 5000 - 420);
});
```

- [ ] **Step 2: Test de reversión transaccional**

Forzar un fallo después del insert (mock que lanza en `updateStatus`) → `ledger_entries` queda vacío. El insert ocurre **dentro** de la transacción que cierra la decisión.

- [ ] **Step 3: Implementar y conectar a `decideInvoice`**

Solo si `verdict === "PAGAR"`. `amount_usd = decision.amount_usd_evaluated`, `policy_version` copiada, `entry_type = "COMPROMISO_PAGAR"`.

- [ ] **Step 4: `just check` + commit**

```bash
git commit -am "feat(api): write ledger entries only for pay verdicts"
```

---

### Task 8: T15 — Bandeja HITL y regla de excepción

**Files:**
- Create: `api/src/repositories/approvals.ts`, `api/src/services/approvals.ts`, `api/src/routes/approvals.ts`, `api/src/routes/approvals.test.ts`
- Modify: `api/src/app.ts`, `api/src/services/decide.ts` (crear approval), `api/package.json`

**Interfaces:**
- Produces:
  - `GET /api/approvals?status=pendiente` → lista con `{ id, invoice_id, vendor_name, amount_usd, reason_code, explanation, requested_at }`.
  - `POST /api/approvals/:id` body `{ approve: boolean, resolved_by: string, comment?: string }`.
  - `resolveApproval(id, input, db): { status: "APROBADA" | "NEGADA"; ledger?: string }`.
- Códigos: `409 rules_block_approval` (reglas 1–3 disparan con la `policy_version` del caso), `409 invoice_not_escalated`, `404 not_found`, `200` idempotente si ya estaba resuelta.

- [ ] **Step 1: Test de re-chequeo**

Aprobación sobre una decisión cuyo `vendor_tax_id` está vacío → `409 rules_block_approval` y `invoices.status` sigue `PENDIENTE_APROBACION`.

- [ ] **Step 2: Test Review Focus 3**

Dos `POST` seguidos con `approve: true`: primero `200` + `APROBADA` + 1 ledger; segundo `200` con el mismo body, sin segundo ledger y sin cambiar `resolved_at`.

- [ ] **Step 3: Implementar la transacción**

`SELECT ... FOR` no existe en SQLite: usar `db.transaction()` con `UPDATE approvals SET status = ? WHERE id = ? AND status = 'PENDIENTE'` y `changes === 0` → idempotente. Si `approve` y el re-chequeo de reglas 1–3 pasa → `insertLedgerEntry` + `invoices.status = 'APROBADA'`. Si `!approve` → `NEGADA` + `invoices.status = 'FRENADA'`.

- [ ] **Step 4: `just check` + commit**

```bash
git commit -am "feat(api): add approvals inbox with exception rule"
```

---

### Task 9: T13 — Listado y detalle de facturas

**Files:**
- Create: `api/src/repositories/invoices.ts`, `api/src/routes/invoices.ts` (GET), `api/src/routes/invoices.list.test.ts`
- Modify: `api/package.json`

**Interfaces:**
- Produces:
  - `GET /api/invoices?status=&limit=50&offset=0` → `{ items: AuditRecord[], total: number }`, orden LIFO.
  - `GET /api/invoices/:id` → `{ record: AuditRecord, timeline: TimelineEvent[] }`.
  - `TimelineEvent = { type: "INGESTA" | "EXTRACCION" | "DECISION" | "RESOLUCION"; at: string; detail: string }`.

- [ ] **Step 1: Test del estado resuelto**

Una ESCALAR aprobada aparece con `estado: "PAGADA"` y `human_approved: true`, no como dos filas. El detalle incluye `resolved_by`, `resolved_at` y `comment`.

- [ ] **Step 2: Implementar consultas y mapeo**

La proyección usa `AuditRecord` de `domain/audit.ts`; no reinterpreta `verdict`/`reason_code`/`explanation` (vienen de `decisions`). `document_hash` = `invoices.file_hash`.

- [ ] **Step 3: `just check` + commit**

```bash
git commit -am "feat(api): add invoice listing and detail endpoints"
```

---

### Task 10: T25 — `GET /api/audit-trail` y touchless rate

**Files:**
- Create: `api/src/services/metrics.ts`, `api/src/services/metrics.test.ts`, `api/src/routes/audit.ts`
- Modify: `api/src/app.ts`, `api/package.json`

**Interfaces:**
- Produces: `GET /api/audit-trail` → `{ metrics: { budget_remaining, threshold_limit, total_processed, touchless_rate }, records: AuditRecord[] }`.
- `touchless_rate = round(PAGAR / total * 1000) / 10`, `0` si `total === 0`.

- [ ] **Step 1: Test Review Focus 5**

Base vacía (sin decisiones): `{ budget_remaining: 5000, threshold_limit: 1000, total_processed: 0, touchless_rate: 0 }`, sin `NaN`.

- [ ] **Step 2: Test de cuadre**

Con 6 PAGAR de 11: `touchless_rate === 54.5`; `budget_remaining === 5000 - SUM(ledger_entries)`; `total_processed` cuenta facturas, no decisiones.

- [ ] **Step 3: `just check` + commit**

```bash
git commit -am "feat(api): add audit trail and roi metrics endpoint"
```

---

### Task 11: T14 — Política versionada: GET, PUT y preview

**Files:**
- Create: `api/src/repositories/policies.ts`, `api/src/services/policy.ts`, `api/src/routes/policies.ts`, `api/src/routes/policies.test.ts`
- Modify: `api/src/app.ts`, `api/package.json`

**Interfaces:**
- Produces:
  - `GET /api/policy` → `PolicySpec` activo + `category_budgets`.
  - `PUT /api/policy` body `PolicySpec` sin `version` → crea `vN+1`, desactiva la anterior, `201`.
  - `POST /api/policy/preview` body `PolicySpec` → `{ affected: Array<{ invoice_id, before, after, reason_code }> }`, sin persistir.
- Reglas: `422 invalid_policy` sin crear versión; las aprobaciones pendientes conservan la `policy_version` de su decisión (ya está en `decisions`, no se toca).

- [ ] **Step 1: Test de versión inmutable**

`PUT` con umbral 300 → existe `v2` activa, `v1` inactiva, y las decisiones viejas siguen con `policy_version: "v1"`.

- [ ] **Step 2: Test de preview sin escritura**

`POST /api/policy/preview` con umbral 300 → facturas que eran PAGAR aparecen como ESCALAR en `affected`; contar filas de `policies` y `decisions` antes/después da igual.

- [ ] **Step 3: `just check` + commit**

```bash
git commit -am "feat(api): add versioned policy read, update and preview endpoints"
```

---

### Task 12: T24 — Seed del set demo

**Files:**
- Create: `api/src/db/demoSeed.ts`, `api/src/db/demoSeed.test.ts`, `api/src/db/demoSeed-cli.ts`
- Modify: `api/package.json` (`db:demo`), `justfile` (`db-demo`), `api/package.json` (test)

**Interfaces:**
- Produces: `seedDemoSet(db: Database.Database): { seeded: number; verdicts: Record<string, string> }`, idempotente por hash de fixture.
- Carga los `fixtures/TC-*.json` en orden de `dependsOn` usando los servicios de Task 4–6 (no SQL a mano). Deja TC-04, TC-06, TC-07 y TC-10 en `PENDIENTE_APROBACION` para la bandeja; el resto queda resuelto.

- [ ] **Step 1: Test de idempotencia y veredictos**

Correr dos veces sobre `:memory:` → mismos conteos, 1 `invoices` por hash, y el mapa de veredictos coincide con `ground_truth.json`. TC-04, TC-06, TC-07 y TC-10 quedan con `approvals` `PENDIENTE`; el resto resuelto.

- [ ] **Step 2: CLI + receta**

`npm run db:demo -w api` y `just db-demo`; imprime `{ total, pagar, frenar, escalar, pendientes }`.

- [ ] **Step 3: `just check` + commit**

```bash
git commit -am "feat(api): add demo seed script for the tc case set"
```

---

### Task 13: T17 — Notifier con outbox

**Files:**
- Create: `api/src/services/notifier.ts`, `api/src/services/notifier.test.ts`
- Modify: `api/src/services/decide.ts` (ESCALAR), `api/package.json`

**Interfaces:**
- Produces:
  - `interface Notifier { notify(input: NotificationInput): Promise<void> }`
  - `ConsoleNotifier` (default) y `WebhookNotifier(url)` (`NOTIFIER_WEBHOOK_URL`).
  - Persiste en `notifications` con `status: PENDIENTE → ENVIADA | FALLIDA`.

- [ ] **Step 1: Test sin red**

ESCALAR → 1 fila `notifications` con `channel: "CONSOLE"` y `payload_json` que incluye `reason_code` y `explanation`. Un webhook que lanza → `status: "FALLIDA"` y la decisión **no** se revierte.

- [ ] **Step 2: `just check` + commit**

```bash
git commit -am "feat(api): add notifier interface with console and webhook adapters"
```

---

## Fuera de este plan

- **T18–T22 (web)**: plan aparte, depende de que la API de este plan esté verde.
- **T23 (smoke e2e)**: se escribe cuando exista la web, porque recorre los 6 puntos del MVP §12 contra la UI y la API.
- **Drizzle / `api/drizzle/`**: no se usa; ver "Nota de reconciliación".

## Self-review del plan

- **Cobertura:** T6, T7, T8, T9, T10, T11, T12, T13, T14, T15, T16, T17, T24 y T25 tienen task propia. T18–T23 quedan explícitamente fuera con justificación.
- **Consistencia de tipos:** `DecisionRow` (Task 2), `insertLedgerEntry` (Task 7), `TimelineEvent` (Task 9) y `PolicySpec` (Task 11) se definen una sola vez y las tasks posteriores los consumen por nombre.
- **Review Focus:** cada uno de los 5 casos tiene un test asignado en su task (T9, T10/T12, T15/T16, T8, T25).
- **Decisión de producto que el plan fija:** el upload no crea una factura incompleta (el schema lo impide); la factura nace en `EXTRAIDA`. Si el equipo prefiere el texto literal del backlog, hay que relajar cinco columnas `NOT NULL` de `invoices` en un ADR antes de empezar.
