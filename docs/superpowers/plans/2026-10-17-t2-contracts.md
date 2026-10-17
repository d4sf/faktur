# T2 · Contratos de dominio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Congelar el contrato de datos del agente y la política v1: schemas Zod para extracción, decisión, auditoría e ingesta; la tabla de precedencia como dato validado; y `specs/policy.spec.json` que la aplicación carga y valida al arrancar.

**Architecture:** Seis módulos en `api/src/domain/`, uno por responsabilidad, con los tipos derivados del schema por `z.infer`. La precedencia es una constante Zod-validada al importarse, no un `switch`. El JSON de política vive en `specs/` y se importa con `with { type: "json" }`; el `Containerfile` de producción lo copia, porque `tsc` no lo lleva a `dist/`. `geminiSchema.ts` emite el JSON Schema que T10 le mandará a la API de Google.

**Tech Stack:** TypeScript 5.9, Node 22.23.3, Zod 4.6.7, Fastify 5.6, `node:test` vía tsx.

**Spec:** `docs/superpowers/specs/2026-10-17-t2-contracts-design.md` — el plan implementa ese spec; los dos viajan juntos.

## Global Constraints

- Todo corre dentro del contenedor. En el host `just` **no está instalado**: usá `bash ./scripts/compose.sh <args>`. Ninguna receta del `justfile` se corre directo.
- Rutas relativas dentro del contenedor, y **el cwd de `compose exec` es `/app`**, no `/app/api`. Para correr un test suelto: `bash ./scripts/compose.sh exec app npx tsx --test api/src/domain/decision.test.ts`.
- Imports relativos llevan extensión `.js` aunque el archivo sea `.ts` (`module: NodeNext`).
- **El script `test` de `api/package.json` es una lista explícita y hay que editarla a mano** para cada `.test.ts` nuevo. Se ha olvidado en este repo. Después de editarla, el conteo de tests tiene que coincidir con lo que el plan dice.
- Todo el dominio es `snake_case`: `reason_code`, `policy_version`, `field_confidence`, `line_items`. Los valores de enum son `MAYÚSCULAS_SIN_TILDE`. La única excepción de casing es `display_name`-style, que no existe todavía.
- Los tipos se derivan con `z.infer`. **No** escribir interfaces a mano: ya se probó en T1 que la interfaz explícita no compila contra el tipo inferido.
- Idiomas de Zod 4, no de Zod 3: `z.url()`, `z.enum(ARRAY)` sobre un `as const`.
- Prettier: 100 columnas, comillas dobles, semicolons. `just check` no corre Prettier, así que hay que correrlo aparte.
- Commits: Conventional Commits, **mensajes en inglés**, un commit = un cambio lógico.
- El `Containerfile` de producción necesita `python3 make g++` en su etapa `deps`: verificado por experimento que sin esas tres líneas `npm ci` aborta. **No tocar esa línea.**
- `data/` está gitignored salvo `data/.gitkeep`. `.superpowers` está gitignored.

## Review Focus

Cinco formas de falla que el spec implica y que ningún test del camino feliz toca. Cada una tiene su prueba en la tarea que tiene el código.

1. **Un `.test.ts` nuevo que no está en el script `test`.** Typecheck, lint y `npm test` pasan en verde y el test nunca corrió. Es la falla más silenciosa del repo y ya pasó dos veces.
2. **`specs/policy.spec.json` no llega a la imagen de producción.** Todo pasa en dev —el bind mount pone `/app/specs` ahí— y revienta en prod, donde el stage runtime copia rutas específicas. Nadie lo ve hasta el deploy.
3. **Un default del JSON cambiado sin que nadie mire el veredicto de un caso.** El número de `Marketing` es el que sostiene TC-04: si vuelve a 2500, la regla 6 dispara antes que la 7 y el motivo sale `ALERT_BUDGET_TIGHT` sin que ningún test de motor grite, porque el motor todavía no existe.
4. **`field_confidence` con un campo faltante se acepta.** El motor no puede decir *cuál* campo el modelo no leyó, y el motivo del registro pierde el único detalle que la rúbrica premia.
5. **La moneda no normalizada.** El modelo devuelve `"usd"` y la regla 7 frena una factura perfectamente válida. En el demo se ve como un fallo del agente.

---

## Estructura de archivos

| Archivo | Acción | Responsabilidad única |
|:---|:---|:---|
| `api/src/domain/extraction.ts` | Crear | Lo que devuelve el modelo: `ExtractedInvoice`, `LineItem`, `Currency`, `field_confidence` y la confianza global derivada. |
| `api/src/domain/decision.ts` | Crear | `Verdict`, `ReasonCode`, `InvoiceStatus` y el registro `Decision`. |
| `api/src/domain/audit.ts` | Crear | `AuditRecord` y `Approval`, lo que se muestra y lo que un humano resuelve. |
| `api/src/domain/ingestion.ts` | Crear | `IngestAttempt` y su estado, la puerta de entrada. |
| `api/src/domain/precedence.ts` | Crear | Las 8 reglas / 10 condiciones como dato validado al importar. |
| `api/src/domain/policy.ts` | Crear | `Category`, `PolicySpec` y la carga validada del JSON. |
| `api/src/domain/geminiSchema.ts` | Crear | Emitir el JSON Schema que T10 le manda a la API de Google. |
| `api/src/domain/index.ts` | Crear | Barrel: reexporta schemas y tipos. |
| `specs/policy.spec.json` | Crear | La política v1 congelada. |
| `Containerfile` | Modificar | `COPY specs` al stage runtime. |
| `api/package.json` | Modificar | Los seis `.test.ts` nuevos en el script `test`. |
| `docs/backlog_implementacion_mvp.md` | Modificar | Las dos afirmaciones falsas de §0. |
| `docs/propuesta_modelo_ER_faktur.md` | Modificar | `Marketing 2500` → `4000`, `Diseño` → `Diseno`, y la cobertura de casos pasa a 12. |

`api/src/config/` no se toca. T2 no cambia el arranque.

---

### Task 1: Los contratos de decisión y auditoría

**Files:**
- Create: `api/src/domain/decision.ts`
- Create: `api/src/domain/decision.test.ts`
- Create: `api/src/domain/audit.ts`
- Create: `api/src/domain/audit.test.ts`
- Modify: `api/package.json` (script `test`)

**Interfaces:**
- Consumes: nada.
- Produces:
  ```ts
  // api/src/domain/decision.ts
  export const VERDICTS = ["PAGAR", "FRENAR", "ESCALAR"] as const;
  export const Verdict = z.enum(VERDICTS);
  export type Verdict = z.infer<typeof Verdict>;

  export const REASON_CODES = [
    "SUCCESS_TOUCHLESS_STP",
    "ERR_INVALID_DATA",
    "ALERT_LOW_CONFIDENCE",
    "ERR_DUPLICATE_INVOICE",
    "ERR_BLACKLISTED_VENDOR",
    "ALERT_NEW_VENDOR",
    "ALERT_VENDOR_DRIFT",
    "ALERT_BUDGET_OVERRUN",
    "ALERT_BUDGET_TIGHT",
    "ALERT_THRESHOLD_EXCEEDED",
  ] as const;
  export const ReasonCode = z.enum(REASON_CODES);
  export type ReasonCode = z.infer<typeof ReasonCode>;

  export const INVOICE_STATUSES = [
    "RECIBIDA", "EXTRAIDA", "DECIDIDA", "PENDIENTE_APROBACION",
    "APROBADA", "NEGADA", "FRENADA",
  ] as const;
  export const InvoiceStatus = z.enum(INVOICE_STATUSES);
  export type InvoiceStatus = z.infer<typeof InvoiceStatus>;

  export const Decision = z.object({
    invoice_id: z.string().min(1),
    ingest_attempt_id: z.string().min(1).nullable(),
    verdict: Verdict,
    reason_code: ReasonCode,
    explanation: z.string().min(1),
    policy_version: z.string().min(1),
    amount_usd_evaluated: z.number().nonnegative(),
    decided_by: z.enum(["AGENTE", "HUMANO"]),
  });
  export type Decision = z.infer<typeof Decision>;
  ```

  `AuditRecord` **no** va acá: depende de `ExtractedInvoice`, que es de la Task 2, y un tipo que no compila hasta otra tarea es un task mal partido. Va en la Task 2, al lado de lo que lo alimenta.

- [ ] **Step 1: Agregar los dos archivos de test al script**

En `api/package.json`, la lista de `test` pasa a incluir `src/domain/decision.test.ts` y `src/domain/audit.test.ts`.

- [ ] **Step 2: Escribir `decision.test.ts`**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  Decision,
  INVOICE_STATUSES,
  InvoiceStatus,
  REASON_CODES,
} from "./decision.js";

test("el enum de reason_code tiene diez entradas", () => {
  assert.equal(REASON_CODES.length, 10);
});

test("ERR_BUDGET_OVERRUN no esta en el enum", () => {
  assert.ok(!REASON_CODES.includes("ERR_BUDGET_OVERRUN"));
});

test("InvoiceStatus tiene los siete estados sin tilde", () => {
  assert.equal(INVOICE_STATUSES.length, 7);
  assert.deepEqual(INVOICE_STATUSES, [
    "RECIBIDA", "EXTRAIDA", "DECIDIDA", "PENDIENTE_APROBACION",
    "APROBADA", "NEGADA", "FRENADA",
  ]);
});

test("un motivo vacio se rechaza", () => {
  const base = {
    invoice_id: "i1",
    ingest_attempt_id: null,
    verdict: "PAGAR",
    reason_code: "SUCCESS_TOUCHLESS_STP",
    policy_version: "v1",
    amount_usd_evaluated: 100,
    decided_by: "AGENTE",
  };
  assert.equal(Decision.safeParse({ ...base, explanation: "dentro de politica" }).success, true);
  assert.equal(Decision.safeParse({ ...base, explanation: "" }).success, false);
});

test("un veredicto fuera del enum se rechaza", () => {
  assert.equal(InvoiceStatus.safeParse("EXTRAÍDA").success, false);
  assert.equal(InvoiceStatus.safeParse("EXTRAIDA").success, true);
});
```

- [ ] **Step 3: Correr y ver que falla**

```bash
bash ./scripts/compose.sh exec app npx tsx --test api/src/domain/decision.test.ts
```

Expected: FAIL con `Cannot find module './decision.js'`.

- [ ] **Step 4: Implementar `decision.ts`**

Los cuatro enums y `Decision` con la firma del bloque Interfaces. `ingest_attempt_id` es **anulable y sin default**: una decisión normal no lo tiene, la de un reenvío duplicado sí. Un `.default(null)` acá escondería el error de forgetting de pasarlo.

- [ ] **Step 5: Correr y ver que pasa**

Expected: PASS, 5 tests.

- [ ] **Step 6: Escribir `audit.test.ts`**

```ts
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
  const base = { decision_id: "d1", invoice_id: "i1", status: "APROBADA" };
  assert.equal(
    Approval.safeParse({
      ...base,
      resolved_by: "cfo-demo",
      resolved_at: "2026-10-17T00:00:00Z",
      comment: "autorizada con sobrecupo",
    }).success,
    true,
  );
  assert.equal(Approval.safeParse(base).success, false);
});
```

- [ ] **Step 7: Correr y ver que falla, después implementar `audit.ts`**

`resolved_by`, `resolved_at` y `comment` son anulables pero **no tienen default**: si faltan, el objeto es inválido en vez de incompleto en silencio. Un `.default("")` convertiría "nadie lo resolvió" en "lo resolvió alguien sin nombre".

Expected: FAIL primero, PASS después, 3 tests.

- [ ] **Step 8: Verificar y commitear**

```bash
bash ./scripts/compose.sh exec app npm run typecheck
bash ./scripts/compose.sh exec app npm test
bash ./scripts/compose.sh exec app npx prettier --check api/src/domain api/package.json
```

Expected: limpio; el conteo de tests sube en 8 (5 + 3).

```bash
git add api/src/domain/decision.ts api/src/domain/decision.test.ts api/src/domain/audit.ts api/src/domain/audit.test.ts api/package.json
git commit -m "feat(api): add verdict and audit contracts"
```

---

### Task 2: El contrato de ingesta y el de extracción

**Files:**
- Create: `api/src/domain/ingestion.ts`
- Create: `api/src/domain/ingestion.test.ts`
- Create: `api/src/domain/extraction.ts`
- Create: `api/src/domain/extraction.test.ts`
- Modify: `api/package.json`

**Interfaces:**
- Consumes: `Verdict` y `ReasonCode` de la Task 1 — `AuditRecord` los usa en su firma, así que Task 2 **no** compila sin la Task 1.
- Produces:
  ```ts
  // api/src/domain/ingestion.ts
  export const AttemptStatus = z.enum(["RECIBIDA", "DUPLICADA", "RECHAZADA"]);
  export const IngestAttempt = z.object({
    file_name: z.string().min(1),
    mime_type: z.string().min(1),
    byte_size: z.number().int().nonnegative(),
    file_hash: z.string().regex(/^[0-9a-f]{64}$/),
    attempt_status: AttemptStatus,
    invoice_id: z.string().min(1).nullable(),
    duplicate_of_invoice_id: z.string().min(1).nullable(),
  });

  // api/src/domain/extraction.ts
  export const CURRENCIES = ["USD", "MXN", "COP", "EUR"] as const;
  export const Currency = z.string().trim().toUpperCase().pipe(z.enum(CURRENCIES));

  export const CONFIDENCE_FIELDS = ["invoice_number", "vendor_tax_id",
    "total_amount", "currency", "due_date"] as const;
  export const FieldConfidence = z.object({
    invoice_number: Confidence, vendor_tax_id: Confidence,
    total_amount: Confidence, currency: Confidence, due_date: Confidence,
  });                       // Confidence = z.number().min(0).max(1)

  export const ExtractedInvoice = z.object({ /* §spec 7.3 */ });
  export function globalConfidence(f: FieldConfidence | undefined): number | undefined;

  // api/src/domain/audit.ts — se completa en esta tarea porque necesita ExtractedInvoice.
  // Es la proyección que devuelven T13 y T25, NO una segunda fila: es la decisión
  // con la factura y el detalle humano pegados, para que la API no obligue al
  // cliente a dos consultas. `Approval` y `ApprovalStatus` ya vinieron de la Task 1.
  export const AuditRecord = z.object({
    id: z.string().min(1),
    invoice: ExtractedInvoice,
    document_hash: z.string().regex(/^[0-9a-f]{64}$/),
    amount_usd: z.number().nonnegative(),
    verdict: Verdict,
    reason_code: ReasonCode,
    explanation: z.string().min(1),
    created_at: z.iso.datetime(),
    human_approved: z.boolean().nullable(),
  });
  export type AuditRecord = z.infer<typeof AuditRecord>;
  ```

  `globalConfidence` devuelve el **mínimo** de los cinco, o `undefined` si no hay `field_confidence`. No lanza: la decisión de confianza baja la toma el motor en T5, no el parser.

- [ ] **Step 1: Agregar los dos tests al script `test`**

- [ ] **Step 2: Escribir `ingestion.test.ts`**

```ts
test("un hash que no es sha-256 de 64 hex se rechaza", () => {
  assert.equal(IngestAttempt.safeParse({ ...base, file_hash: "abc" }).success, false);
  assert.equal(IngestAttempt.safeParse({ ...base, file_hash: "a".repeat(64) }).success, true);
});

test("un intento duplicado referencia la factura canonica", () => {
  const r = IngestAttempt.safeParse({
    ...base, attempt_status: "DUPLICADA", invoice_id: "i1", duplicate_of_invoice_id: "i1",
  });
  assert.equal(r.success, true);
});

test("un intento recibido no apunta a ninguna canonica", () => {
  assert.equal(IngestAttempt.safeParse({ ...base, attempt_status: "RECIBIDA" }).success, true);
});
```

- [ ] **Step 3: Correr, ver que falla, implementar `ingestion.ts`, correr y ver que pasa**

Expected: 3 tests.

El `regex` del hash es deliberado: es la primera barrera contra un archivo con el hash mal formado, y `file_hash` es la clave del dedup de la regla 2.

- [ ] **Step 4: Escribir `extraction.test.ts`**

```ts
const full = {
  invoice_number: "INV-9022", vendor_name: "CloudServers Inc",
  vendor_tax_id: "CLOUD-SERVERS-INC", issue_date: "2026-10-01",
  due_date: "2026-10-15", currency: "USD", subtotal: 400, tax_amount: 20,
  total_amount: 420,
  line_items: [{ description: "servidor", quantity: 1, unit_price: 400, total: 400 }],
  field_confidence: {
    invoice_number: 0.95, vendor_tax_id: 0.98, total_amount: 0.99,
    currency: 1, due_date: 0.9,
  },
};

test("una factura completa valida", () => {
  assert.equal(ExtractedInvoice.safeParse(full).success, true);
});

test("sin folio, monto o moneda se rechaza", () => {
  for (const key of ["invoice_number", "total_amount", "currency"]) {
    const { [key]: _drop, ...rest } = full;
    assert.equal(ExtractedInvoice.safeParse(rest).success, false, key);
  }
});

test("sin tax_id valida: TC-08 lo frena el motor, no el parser", () => {
  const { vendor_tax_id: _d, ...rest } = full;
  assert.equal(ExtractedInvoice.safeParse(rest).success, true);
});

test("field_confidence exige los cinco campos", () => {
  for (const key of CONFIDENCE_FIELDS) {
    const fc = { ...full.field_confidence };
    delete fc[key];
    assert.equal(ExtractedInvoice.safeParse({ ...full, field_confidence: fc }).success, false, key);
  }
});

test("la confianza global es el minimo de los cinco", () => {
  const fc = { invoice_number: 0.95, vendor_tax_id: 0.6, total_amount: 0.99,
               currency: 1, due_date: 0.9 };
  assert.equal(globalConfidence(fc), 0.6);
});

test("sin field_confidence la confianza no lanza, devuelve undefined", () => {
  const { field_confidence: _d, ...rest } = full;
  assert.equal(globalConfidence(ExtractedInvoice.parse(rest).field_confidence), undefined);
});

test("la moneda se normaliza", () => {
  for (const raw of ["usd", " USD ", "USD"]) {
    const r = ExtractedInvoice.safeParse({ ...full, currency: raw });
    assert.equal(r.success, true, raw);
    assert.equal(r.data?.currency, "USD", raw);
  }
  assert.equal(ExtractedInvoice.safeParse({ ...full, currency: "BTC" }).success, false);
});

test("las fechas son ISO estrictas", () => {
  assert.equal(ExtractedInvoice.safeParse({ ...full, due_date: "2026-10-15" }).success, true);
  assert.equal(ExtractedInvoice.safeParse({ ...full, due_date: "15/10/2026" }).success, false);
});

test("un monto negativo se rechaza", () => {
  assert.equal(ExtractedInvoice.safeParse({ ...full, total_amount: -1 }).success, false);
});
```

- [ ] **Step 5: Correr y ver que falla**

Expected: FAIL con `Cannot find module './extraction.js'`.

- [ ] **Step 6: Implementar `extraction.ts`**

- `Currency`: `z.string().trim().toUpperCase().pipe(z.enum(CURRENCIES))`. El `.pipe` **después** de la transformación es lo que hace que `"usd"` sea válido y `"BTC"` no.
- Fechas: `z.iso.date()` en `issue_date` y `due_date`.
- Montos: `z.number().nonnegative()`.
- `field_confidence`: los cinco campos **requeridos**, cada uno `z.number().min(0).max(1)`. `CONFIDENCE_FIELDS` es el `as const` del bloque Interfaces y el schema se construye con un `reduce` sobre él, para que agregar un campo al confidence no pueda olvidarse de agregarlo al tipo.
- `globalConfidence(f)`: si `f` es `undefined` devuelve `undefined`; si no, `Math.min(...Object.values(f))`.
- Todos los strings de texto con `.trim()`.

- [ ] **Step 7: Correr y ver que pasa**

Expected: PASS, 9 tests.

- [ ] **Step 8: Agregar `AuditRecord` a `audit.ts` y su caso al test**

`AuditRecord` con la firma del bloque Interfaces. En `audit.test.ts`, un caso que monte un `Decision` de la Task 1 dentro y verifique que sale con `verdict`, `reason_code` y `explanation` intactos: la proyección no puede reinterpretar nada, solo pegar la factura.

- [ ] **Step 9: Verificar y commitear**

Expected: `npm test` sube en 12 sobre el total de la Task 1.

```bash
git add api/src/domain/ingestion.ts api/src/domain/ingestion.test.ts api/src/domain/extraction.ts api/src/domain/extraction.test.ts api/package.json
git commit -m "feat(api): add ingestion and extraction contracts"
```

---

### Task 3: La precedencia como dato

**Files:**
- Create: `api/src/domain/precedence.ts`
- Create: `api/src/domain/precedence.test.ts`
- Modify: `api/package.json`

**Interfaces:**
- Consumes: `ReasonCode` y `Verdict` de la Task 1.
- Produces:
  ```ts
  export type PrecedenceCondition = {
    rule: number;
    id: string;
    verdict: Verdict;
    reason_code: ReasonCode;
    description: string;
  };
  export const PRECEDENCE: readonly PrecedenceCondition[];
  export const HARD_BRAKE_RULES: readonly number[];   // [1, 2, 3]
  ```
  `id` es estable y en `snake_case`: `datos_ilegibles`, `confianza_baja`, `duplicado`, `beneficiario_bloqueado`, `beneficiario_no_listado`, `drift`, `presupuesto_periodo`, `presupuesto_categoria`, `umbral_superado`, `dentro_de_politica`.

- [ ] **Step 1: Agregar el test al script**

- [ ] **Step 2: Escribir `precedence.test.ts`**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { HARD_BRAKE_RULES, PRECEDENCE } from "./precedence.js";
import { REASON_CODES } from "./decision.js";

test("hay ocho numeros de regla, del 1 al 8, sin huecos", () => {
  const rules = [...new Set(PRECEDENCE.map((c) => c.rule))];
  assert.deepEqual(rules, [1, 2, 3, 4, 5, 6, 7, 8]);
});

test("hay diez condiciones: la 1 y la 6 tienen dos salidas", () => {
  assert.equal(PRECEDENCE.length, 10);
  assert.equal(PRECEDENCE.filter((c) => c.rule === 1).length, 2);
  assert.equal(PRECEDENCE.filter((c) => c.rule === 6).length, 2);
});

test("las reglas 1 a 3 frenan y las 4 a 7 escalan", () => {
  for (const c of PRECEDENCE) {
    if (c.rule <= 3) assert.equal(c.verdict, "FRENAR", c.id);
    else if (c.rule <= 7) assert.equal(c.verdict, "ESCALAR", c.id);
  }
  assert.deepEqual(HARD_BRAKE_RULES, [1, 2, 3]);
});

test("la regla 8 paga y es la ultima", () => {
  const last = PRECEDENCE[PRECEDENCE.length - 1];
  assert.equal(last.rule, 8);
  assert.equal(last.verdict, "PAGAR");
  assert.equal(last.reason_code, "SUCCESS_TOUCHLESS_STP");
});

test("todo reason_code de la precedencia esta en el enum", () => {
  for (const c of PRECEDENCE) {
    assert.ok(REASON_CODES.includes(c.reason_code), c.id);
  }
});

test("los rule son ascendentes y los id son unicos", () => {
  for (let i = 1; i < PRECEDENCE.length; i++) {
    assert.ok(PRECEDENCE[i - 1].rule <= PRECEDENCE[i].rule);
  }
  assert.equal(new Set(PRECEDENCE.map((c) => c.id)).size, PRECEDENCE.length);
});
```

- [ ] **Step 3: Correr y ver que falla**

Expected: FAIL con `Cannot find module './precedence.js'`.

- [ ] **Step 4: Implementar `precedence.ts`**

Las diez condiciones en el orden de la tabla del spec §7.4, con `description` en lenguaje natural y los importes concretos ("Acordado $480, facturado $1.200"), porque es la columna que lee el jurado.

**El array se valida contra un schema de Zod al importarse** (`PrecedenceSchema.parse(PRECEDENCE)` a nivel de módulo). Si alguien agrega una condición con un `reason_code` inexistente, revienta al cargar el módulo y no tres semanas después en una factura real.

- [ ] **Step 5: Correr y ver que pasa**

Expected: PASS, 6 tests.

- [ ] **Step 6: Verificar que el módulo revienta con una condición inválida**

Agregá temporalmente una condición con `reason_code: "ERR_INVENTADO"` e importá el módulo:

```bash
bash ./scripts/compose.sh exec app npx tsx -e 'import("/app/api/src/domain/precedence.ts")' 2>&1 | tail -4
```

Expected: revienta nombrando el `reason_code` inválido. **Deshacelo antes de commitear.** Un módulo que no se valida al importar es un array decorativo.

- [ ] **Step 7: Commitear**

```bash
git add api/src/domain/precedence.ts api/src/domain/precedence.test.ts api/package.json
git commit -m "feat(api): add precedence table as validated data"
```

---

### Task 4: El spec congelado y su carga

**Files:**
- Create: `specs/policy.spec.json`
- Create: `api/src/domain/policy.ts`
- Create: `api/src/domain/policy.test.ts`
- Modify: `Containerfile` (stage runtime)
- Modify: `api/package.json`

**Interfaces:**
- Consumes: `CURRENCIES` de la Task 2 — `allowed_currencies` valida contra ese enum, así que Task 4 **no** compila sin la Task 2.
- Produces:
  ```ts
  export const CATEGORIES = ["Infraestructura", "Diseno", "Marketing",
                             "Legal", "Software", "Retail"] as const;
  export const Category = z.enum(CATEGORIES);

  export const PolicySpec = z.object({
    version: z.string().regex(/^v\d+$/),
    created_at: z.iso.date(),
    created_by: z.string().min(1),
    comment: z.string().min(1),
    auto_approval_threshold_usd: z.number().nonnegative(),
    monthly_budget_usd: z.number().nonnegative(),
    vendor_drift_factor: z.number().positive(),
    min_extraction_confidence: z.number().min(0).max(1),
    allowed_currencies: z.array(z.enum(CURRENCIES)).nonempty(),
    category_budgets: z.record(Category, z.number().nonnegative()),
  });
  export type PolicySpec = z.infer<typeof PolicySpec>;

  export function parsePolicySpec(raw: unknown): PolicySpec;
  export function loadPolicySpec(): PolicySpec;   // cachea
  ```

  `parsePolicySpec` separada de `loadPolicySpec` es lo que permite probar el rechazo de una categoría desconocida **sin tocar el archivo congelado**.

- [ ] **Step 1: Escribir `specs/policy.spec.json`**

Los valores exactos del spec §7.2, incluido `"min_extraction_confidence": 0.7`. Claves en `snake_case`, categorías **sin tilde**.

- [ ] **Step 2: Escribir `policy.test.ts`**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { CATEGORIES, loadPolicySpec, parsePolicySpec } from "./policy.js";

test("el JSON congelado valida", () => {
  assert.equal(parsePolicySpec(loadPolicySpec()).success, true);
});

test("los defaults son los del spec", () => {
  const p = loadPolicySpec();
  assert.equal(p.version, "v1");
  assert.equal(p.auto_approval_threshold_usd, 1000);
  assert.equal(p.monthly_budget_usd, 5000);
  assert.equal(p.vendor_drift_factor, 1.4);
  assert.equal(p.min_extraction_confidence, 0.7);
  assert.deepEqual(p.allowed_currencies, ["USD", "MXN", "COP", "EUR"]);
});

test("Marketing sostiene TC-04 y no puede volver a 2500", () => {
  assert.ok(loadPolicySpec().category_budgets.Marketing >= 3500);
});

test("el umbral de confianza esta acotado", () => {
  const base = loadPolicySpec();
  assert.equal(parsePolicySpec({ ...base, min_extraction_confidence: 1.2 }).success, false);
  assert.equal(parsePolicySpec({ ...base, min_extraction_confidence: 0 }).success, false);
});

test("toda categoria del enum tiene presupuesto", () => {
  const b = loadPolicySpec().category_budgets;
  for (const c of CATEGORIES) assert.ok(typeof b[c] === "number", c);
});

test("una categoria desconocida se rechaza sin tocar el archivo", () => {
  const base = loadPolicySpec();
  const r = parsePolicySpec({ ...base, category_budgets: { ...base.category_budgets, Cocina: 100 } });
  assert.equal(r.success, false);
});

test("loadPolicySpec cachea", () => {
  assert.equal(loadPolicySpec(), loadPolicySpec());
});
```

- [ ] **Step 3: Correr y ver que falla**

Expected: FAIL con `Cannot find module './policy.js'`.

- [ ] **Step 4: Implementar `policy.ts`**

```ts
import raw from "../../../specs/policy.spec.json" with { type: "json" };
```

Tres niveles arriba: el archivo vive en `api/src/domain/`. **El atributo `with { type: "json" }` no es opcional** — sin él el build falla con TS1543. `loadPolicySpec()` valida y cachea; si el JSON está mal, el error nombra `specs/policy.spec.json` y el campo, con el mismo formato de listado que usa `config/env.ts`.

- [ ] **Step 5: Correr y ver que pasa**

Expected: PASS, 7 tests.

- [ ] **Step 6: Copiar `specs/` al stage runtime del `Containerfile`**

Después del `COPY ... /app/api/dist`, en el stage `runtime`:

```dockerfile
COPY --from=build --chown=app:app /app/specs ./specs
```

Sin esto, todo pasa en dev y revienta en prod. `specs/` no está en `.dockerignore`, así que llega al stage `build` por el `COPY . .` de esa etapa.

- [ ] **Step 7: Verificar que la imagen de producción tiene el archivo y que resuelve**

```bash
COMPOSE_ENV=prod bash ./scripts/compose.sh build
docker run --rm --entrypoint sh blinka-payagent:prod -c 'ls -l /app/specs'
```

Expected: el archivo está y `node` lo resuelve desde `dist/`:

```bash
docker run --rm --entrypoint node blinka-payagent:prod \
  -e 'import("/app/api/dist/domain/policy.js").then(m=>console.log(m.loadPolicySpec().version))'
```

Expected: `v1`. Si tira `ERR_MODULE_NOT_FOUND`, falta el `COPY` o la ruta del import está mal.

- [ ] **Step 8: Verificar y commitear**

```bash
bash ./scripts/compose.sh exec app npm run typecheck
bash ./scripts/compose.sh exec app npm test
bash ./scripts/compose.sh exec app npx prettier --check specs api/src/domain Containerfile
git add specs/policy.spec.json api/src/domain/policy.ts api/src/domain/policy.test.ts api/package.json Containerfile
git commit -m "feat(api): freeze policy spec v1 and load it validated"
```

---

### Task 5: El schema para Gemini y el barrel

**Files:**
- Create: `api/src/domain/geminiSchema.ts`
- Create: `api/src/domain/geminiSchema.test.ts`
- Create: `api/src/domain/index.ts`
- Modify: `api/package.json`

**Interfaces:**
- Consumes: `ExtractedInvoice` de la Task 2.
- Produces:
  ```ts
  export function toGeminiResponseSchema(schema: z.ZodType): Record<string, unknown>;
  export function toGeminiResponseSchema(): Record<string, unknown>; // sin argumento: ExtractedInvoice
  ```
  La segunda es la que usa T10. Pide el schema de Gemini sin `$schema`, sin `$defs` y sin `$ref` de reutilización, y **lanza** si el schema de entrada produce cualquiera de los dos últimos.

- [ ] **Step 1: Agregar el test al script**

- [ ] **Step 2: Escribir `geminiSchema.test.ts`**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

import { ExtractedInvoice } from "./extraction.js";
import { toGeminiResponseSchema } from "./geminiSchema.js";

const emitted = toGeminiResponseSchema();

test("la raiz no lleva $schema", () => {
  assert.equal("$schema" in emitted, false);
});

test("no hay $defs ni $ref de reutilizacion", () => {
  const text = JSON.stringify(emitted);
  assert.ok(!text.includes("$defs"), text.slice(0, 200));
  assert.ok(!text.includes("$ref"), text.slice(0, 200));
});

test("conserva line_items con sus cuatro propiedades", () => {
  const items = emitted.properties?.line_items;
  assert.equal(items.type, "array");
  assert.deepEqual(Object.keys(items.items.properties).sort(),
    ["description", "quantity", "total", "unit_price"]);
});

test("trae field_confidence y no trae extraction_confidence", () => {
  assert.ok(emitted.properties?.field_confidence);
  assert.equal("extraction_confidence" in emitted.properties, false);
});

test("currency sale como enum cerrado de las cuatro", () => {
  assert.deepEqual(emitted.properties?.currency?.enum,
    ["USD", "MXN", "COP", "EUR"]);
});

test("un schema que produce $defs hace lanzar", () => {
  const Reused = z.object({ a: z.string() });
  const conDefs = z.object({ x: Reused, y: Reused });
  assert.throws(
    () => toGeminiResponseSchema(conDefs, { reused: "ref" }),
    /\$defs/,
  );
});
```

El parámetro `options` de `toGeminiResponseSchema` se pasa a `z.toJSONSchema`. El test que dispara `$defs` **tiene** que pedir `{ reused: "ref" }`: con el default `"inline"` de Zod 4, un objeto reusado se duplica y `$defs` nunca aparece, así que el test pasaría sin ejercitar nada.

- [ ] **Step 3: Correr y ver que falla**

Expected: FAIL con `Cannot find module './geminiSchema.js'`.

- [ ] **Step 4: Implementar `geminiSchema.ts`**

`z.toJSONSchema(schema, options)`, después: borrar la clave `$schema` de la raíz, y si aparece `$defs` o un `$ref` que no sea `"#"`, lanzar nombrando el schema. Sobre el default sin argumento, delegar en `ExtractedInvoice`.

- [ ] **Step 5: Escribir `index.ts`**

Reexporta los schemas y los `type`s de los seis módulos. **No** reexporta `loadPolicySpec` desde el barrel si eso obliga a importar el JSON: T3 y T5 importan de `./policy.js` directamente para no arrastrar el archivo a cualquier consumidor del dominio.

- [ ] **Step 6: Correr y ver que pasa**

Expected: PASS, 6 tests.

- [ ] **Step 7: Verificar y commitear**

```bash
bash ./scripts/compose.sh exec app npm run typecheck
bash ./scripts/compose.sh exec app npm run lint
bash ./scripts/compose.sh exec app npm test
bash ./scripts/compose.sh exec app npx prettier --check api/src/domain
```

Expected: `npm test` corre **todos** los `.test.ts`; el conteo total tiene que ser el acumulado de las cinco tareas. Si corre menos, un archivo quedó fuera del script `test`.

```bash
git add api/src/domain/geminiSchema.ts api/src/domain/geminiSchema.test.ts api/src/domain/index.ts api/package.json
git commit -m "feat(api): add gemini response schema and domain barrel"
```

---

### Task 6: Corregir los documentos que el spec desalineó

**Files:**
- Modify: `docs/backlog_implementacion_mvp.md` (dos lugares)
- Modify: `docs/propuesta_modelo_ER_faktur.md` (§2.1, §2.6)

**Interfaces:**
- Consumes: las decisiones de §6 del spec.
- Produces: nada que consuma código. Es el contrato que evita que T3 siembre el número o el nombre de categoría equivocados.

- [ ] **Step 1: Corregir las dos afirmaciones falsas del backlog**

`grep -rn "anyOf" docs/` las encuentra en dos lugares del backlog: la síntesis de **T10** y el **§8**. En los dos, sacá la afirmación de que `gemini-3.8-flash` no acepta `$ref` ni `anyOf`, y reemplazala por el hecho: los dos se soportan, lo que hay que evitar es `$defs`.

- [ ] **Step 2: Corregir el ER**

Tres cosas, todas en `docs/propuesta_modelo_ER_faktur.md`:

1. `Marketing 2500` → `Marketing 4000` en §2.6. Con 2500, TC-04 dispara la regla 6 antes que la 7 y el motivo sale `ALERT_BUDGET_TIGHT` en vez de `ALERT_THRESHOLD_EXCEEDED`. T3 siembra `policy_category_budgets` desde esa línea.
2. `Diseño` → `Diseno` en §2.1 y §2.6. T2 escribe las claves de categoría sin tilde, y T3 va a escribir un `CHECK` con ellas.
3. En §5, la fila de cobertura de TC-12 y el texto que dice "los 11 casos". El set es de 12 desde que `ALERT_LOW_CONFIDENCE` tiene caso.

- [ ] **Step 3: Verificar que no quedó ninguna**

```bash
grep -n "no acepta \`\$ref\`" docs/backlog_implementacion_mvp.md
grep -n "Marketing 2500\|los 11 casos\|TC-01\.\.TC-11" docs/propuesta_modelo_ER_faktur.md
grep -n "Diseño" docs/propuesta_modelo_ER_faktur.md | grep -v "Diseño lógico"
```

Expected: sin salida en los tres.

El filtro de la tercera línea no es cosmetría: el ER se titula "Diseño lógico SDD orientado a SQLite", así que un `grep "Diseño"` pelado matchea el encabezado y el paso nunca puede pasar. Lo que queda después del filtro son las cinco apariciones de la categoría.

- [ ] **Step 4: Formatear y commitear**

```bash
bash ./scripts/compose.sh exec app npx prettier --write docs/backlog_implementacion_mvp.md docs/propuesta_modelo_ER_faktur.md
git add docs/backlog_implementacion_mvp.md docs/propuesta_modelo_ER_faktur.md
git commit -m "docs: correct gemini schema claim and category budget"
```

---

## Cierre: los criterios de aceptación del spec

| # | Criterio | Dónde se comprueba |
|:--|:---|:---|
| 1 | typecheck, lint y test verdes | Task 5 Step 7 |
| 2 | Todos los `.test.ts` están en el script | Task 5 Step 7 — el conteo es la prueba |
| 3 | `specs/` está **dentro** de la imagen de runtime | Task 4 Step 7 |
| 4 | El JSON se importa desde `dist/` sin error de módulo | Task 4 Step 7 |
| 5 | `node dist/server.js` levanta y `/api/health` responde | Task 4 Step 7, extendido con `docker run` |
| 6 | Cambiar un default hace fallar el test | Task 4 Step 2 — el test de `Marketing >= 3500` |
| 7 | `git status` limpio salvo los archivos de T2 | Al final |
| 8 | Las correcciones de §0 aplicadas | Task 6 Step 3 |

Para el criterio 5, el comando completo:

```bash
COMPOSE_ENV=prod bash ./scripts/compose.sh up -d
sleep 8
curl -s http://127.0.0.1:3000/api/health
COMPOSE_ENV=prod bash ./scripts/compose.sh down
bash ./scripts/compose.sh up -d
```

`COMPOSE_ENV=prod` es obligatorio en los comandos de producción: un `compose run` pelado levanta la imagen **dev**, que no prueba el `COPY`.

## Handoff a T4, T5 y T6

El hueco de `ALERT_LOW_CONFIDENCE` quedó **decidido y cerrado** en el spec §11: se agrega **TC-12** (mismo proveedor y monto que TC-09, con `due_date` en `0.5`), más un test unitario del motor en T5 y un guard en T6 que afirma que el conjunto de `reason_code` producidos es igual al enum.

Las tres capas son de T4, T5 y T6. **Este plan no las implementa.** Lo que sí hace es dejar el contrato que las hace posibles: el umbral en el JSON (`min_extraction_confidence`) y el `field_confidence` de cinco campos requeridos. Sin esas dos piezas, TC-12 no se puede ni escribir.

El set pasó de 11 a 12 casos: ya está actualizado en S7, en la síntesis de T4 y en el §6.2 del backlog.