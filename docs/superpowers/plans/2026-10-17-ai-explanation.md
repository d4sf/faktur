# Explicación con IA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un botón "Explicar con IA" en el sheet de detalle de una factura no aprobada/escalada que llama a Gemini y genera una explicación en lenguaje natural, persistida y cacheada, sin alterar el veredicto determinista.

**Architecture:** Un servicio `api/src/services/aiExplanation.ts` que valida precondiciones (factura + decisión FRENAR/ESCALAR), arma el prompt con la política congelada y los datos del caso, llama a Gemini con salida JSON validada por Zod, aplica defensas contra prompt injection, persiste en `ai_explanations` y cachea por `decision_id`. Un endpoint `POST /api/invoices/:id/explain`. En la UI, el botón vive en `InvoiceInspector` y muestra el texto con spinner y regeneración.

**Tech Stack:** TypeScript 5.9, Fastify 5, Zod 4.6.7, `@google/genai`, `better-sqlite3`, React 19, `node:test` vía tsx. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-10-17-ai-explanation-design.md`.

## Global Constraints

- Todo corre dentro del contenedor. `just` no está instalado en el host: usar `bash ./scripts/compose.sh <args>`. El cwd de `compose exec` es `/app`.
- Imports relativos llevan extensión `.js` (`module: NodeNext`).
- **El script `test` de `api/package.json` y `web/package.json` es una lista explícita y hay que editarla a mano** para cada archivo de test nuevo.
- Prettier: 100 columnas, comillas dobles, semicolons. `just check` no corre Prettier.
- Commits: Conventional Commits, mensajes en inglés, un commit = un cambio lógico.
- El motor determinista no se toca: la IA explica, no decide.
- Los tests de API corren contra `DATA_DIR` temporal; nunca contra la base de demo.

## Review Focus

Cinco formas de falla que el spec implica y que ningún test del camino feliz toca.

1. **Un `.test.ts` nuevo que no está en el script `test`.** Typecheck, lint y `npm test` pasan en verde y el test nunca corrió. Es la falla más silenciosa del repo.
2. **Prompt injection a través de campos de la factura.** Un `vendor_name` o `invoice_number` con texto adversarial no debe alterar el alcance ni el formato del output. Verificar que el output siga siendo un único campo string y que el filtro rechace code fences/URLs.
3. **Caché por `decision_id` vs. por `invoice_id`.** Si una factura se re-evalúa (nueva decisión), la explicación vieja no debe servirse. El cache se ancla a la decisión.
4. **Factura sin decisión o con veredicto PAGAR.** El endpoint debe responder 409 `not_explainable`, no 500 ni generar texto.
5. **Sin `GEMINI_API_KEY`.** El endpoint responde 503 `explanation_not_configured`, no un 500 opaco, y la UI muestra un mensaje accionable.

---

## Task 1: Tabla `ai_explanations` en el schema

**Files:**
- Modify: `api/src/db/schema.ts`

- [ ] **Step 1: Agregar el DDL de `ai_explanations`**

En `SCHEMA_SQL`, después de la tabla `notifications`, agregar:

```sql
CREATE TABLE IF NOT EXISTS ai_explanations (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  policy_version TEXT NOT NULL REFERENCES policies(version),
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL DEFAULT 'v1',
  explanation TEXT NOT NULL CHECK (length(explanation) <= 1500),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_explanations_decision_id ON ai_explanations(decision_id);
CREATE INDEX IF NOT EXISTS idx_ai_explanations_invoice_id ON ai_explanations(invoice_id);
```

- [ ] **Step 2: Correr typecheck y un test de schema**

Run: `bash ./scripts/compose.sh exec app npx tsx --test src/db/schema.test.ts`
Expected: PASS (la base in-memory se crea con la nueva tabla).

- [ ] **Step 3: Commitear**

```bash
git add api/src/db/schema.ts
git commit -m "feat(api): add ai_explanations table to schema"
```

---

## Task 2: Repositorio `aiExplanations`

**Files:**
- Create: `api/src/repositories/aiExplanations.ts`
- Create: `api/src/repositories/aiExplanations.test.ts`
- Modify: `api/package.json` (script `test`)

**Interfaces:**

```ts
// api/src/repositories/aiExplanations.ts
export type AiExplanationRow = {
  id: string;
  invoice_id: string;
  decision_id: string;
  policy_version: string;
  model: string;
  prompt_version: string;
  explanation: string;
  created_at: string;
};

export type NewAiExplanation = Omit<AiExplanationRow, "id"> & { id?: string };

export function insertAiExplanation(row: NewAiExplanation, db: Database.Database): string;
export function getLatestAiExplanationByDecision(decisionId: string, db: Database.Database): AiExplanationRow | null;
export function getLatestAiExplanationByInvoice(invoiceId: string, db: Database.Database): AiExplanationRow | null;
```

- [ ] **Step 1: Agregar el test al script `test`**

En `api/package.json`, añadir `src/repositories/aiExplanations.test.ts`.

- [ ] **Step 2: Escribir los tests del repositorio**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { closeDb, loadDb } from "../db/index.js";
import { insertAiExplanation, getLatestAiExplanationByDecision } from "./aiExplanations.js";

test("inserta y recupera la última explicación por decisión", () => {
  const db = loadDb(":memory:");
  try {
    const id = insertAiExplanation(
      {
        invoice_id: "inv-1",
        decision_id: "dec-1",
        policy_version: "v1",
        model: "gemini-3.8-flash",
        prompt_version: "v1",
        explanation: "Texto de prueba",
        created_at: "2026-10-17T10:00:00.000Z",
      },
      db,
    );
    assert.ok(id);
    const row = getLatestAiExplanationByDecision("dec-1", db);
    assert.equal(row?.explanation, "Texto de prueba");
    assert.equal(row?.decision_id, "dec-1");
  } finally {
    closeDb();
  }
});

test("devuelve null si no hay explicación para la decisión", () => {
  const db = loadDb(":memory:");
  try {
    assert.equal(getLatestAiExplanationByDecision("no-existe", db), null);
  } finally {
    closeDb();
  }
});
```

- [ ] **Step 3: Correr y ver que falla**

Run: `bash ./scripts/compose.sh exec app npx tsx --test src/repositories/aiExplanations.test.ts`
Expected: FAIL con `Cannot find module './aiExplanations.js'`.

- [ ] **Step 4: Implementar `aiExplanations.ts`**

```ts
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export type AiExplanationRow = {
  id: string;
  invoice_id: string;
  decision_id: string;
  policy_version: string;
  model: string;
  prompt_version: string;
  explanation: string;
  created_at: string;
};

export type NewAiExplanation = Omit<AiExplanationRow, "id"> & { id?: string };

const COLUMNS = `id, invoice_id, decision_id, policy_version, model, prompt_version, explanation, created_at`;

export function insertAiExplanation(row: NewAiExplanation, db: Database.Database): string {
  const id = row.id ?? randomUUID();
  db.prepare(
    `INSERT INTO ai_explanations (${COLUMNS}) VALUES (?,?,?,?,?,?,?,?)`,
  ).run(
    id,
    row.invoice_id,
    row.decision_id,
    row.policy_version,
    row.model,
    row.prompt_version,
    row.explanation,
    row.created_at,
  );
  return id;
}

export function getLatestAiExplanationByDecision(
  decisionId: string,
  db: Database.Database,
): AiExplanationRow | null {
  const row = db
    .prepare(`SELECT ${COLUMNS} FROM ai_explanations WHERE decision_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`)
    .get(decisionId);
  return (row as AiExplanationRow | undefined) ?? null;
}

export function getLatestAiExplanationByInvoice(
  invoiceId: string,
  db: Database.Database,
): AiExplanationRow | null {
  const row = db
    .prepare(`SELECT ${COLUMNS} FROM ai_explanations WHERE invoice_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`)
    .get(invoiceId);
  return (row as AiExplanationRow | undefined) ?? null;
}
```

- [ ] **Step 5: Correr y ver que pasa**

Run: `bash ./scripts/compose.sh exec app npx tsx --test src/repositories/aiExplanations.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commitear**

```bash
git add api/src/repositories/aiExplanations.ts api/src/repositories/aiExplanations.test.ts api/package.json
git commit -m "feat(api): add ai_explanations repository"
```

---

## Task 3: Servicio `aiExplanation.ts`

**Files:**
- Create: `api/src/services/aiExplanation.ts`
- Create: `api/src/services/aiExplanation.test.ts`
- Modify: `api/package.json` (script `test`)

**Interfaces:**

```ts
// api/src/services/aiExplanation.ts
export type ExplanationCaller = (request: {
  model: string;
  contents: unknown;
  config: unknown;
}) => Promise<unknown>;

export class ExplanationNotConfiguredError extends Error { ... }
export class ExplanationUnavailableError extends Error { ... }
export class ExplanationInvalidError extends Error { ... }

export type ExplainOptions = { regenerate?: boolean };

export type ExplainResult = {
  id: string;
  decision_id: string;
  policy_version: string;
  explanation: string;
  model: string;
  cached: boolean;
  created_at: string;
};

export const AiExplanationOutput = z.object({
  explanation: z.string().trim().min(1).max(1500),
});

export async function explainInvoice(
  invoiceId: string,
  db: Database.Database,
  options?: ExplainOptions,
  caller?: ExplanationCaller,
): Promise<ExplainResult>;
```

- [ ] **Step 1: Agregar el test al script `test`**

En `api/package.json`, añadir `src/services/aiExplanation.test.ts`.

- [ ] **Step 2: Escribir los tests del servicio (con caller inyectado)**

Casos mínimos:
- factura inexistente → lanza `Error("invoice_not_found")`.
- factura PAGAR → lanza `Error("not_explainable")`.
- sin API key y sin caller → `ExplanationNotConfiguredError`.
- respuesta válida → persiste, devuelve `cached: false`, texto trimado.
- segunda llamada sin `regenerate` → devuelve `cached: true` y no llama al modelo.
- `regenerate: true` → llama al modelo de nuevo y crea fila nueva.
- respuesta inválida (sin campo `explanation`) → `ExplanationInvalidError`.
- output con code fence o URL → `ExplanationInvalidError`.
- prompt injection en `vendor_name` → el output sigue validándose como string único (test con caller que devuelve texto limpio; la defensa está en el prompt, pero el test verifica que no se rompa).

- [ ] **Step 3: Correr y ver que falla**

Run: `bash ./scripts/compose.sh exec app npx tsx --test src/services/aiExplanation.test.ts`
Expected: FAIL con `Cannot find module './aiExplanation.js'`.

- [ ] **Step 4: Implementar `aiExplanation.ts`**

Implementar siguiendo el patrón de `extract.ts`:
- `defaultCaller` usa `loadEnv().GEMINI_API_KEY` (BLANK_IS_UNDEFINED ya lo deja `undefined` si está vacío) y lanza `ExplanationNotConfiguredError` si falta.
- `responseBody` helper igual que en `extract.ts`.
- Precondiciones: `getInvoiceRow`, `listDecisionsByInvoice` → última; si ninguna o veredicto no es FRENAR/ESCALAR → `Error("not_explainable")`.
- Caché si `!options?.regenerate`: `getLatestAiExplanationByDecision(decision.id, db)`.
- Armar `data` con invoice extraída, decisión, vendor, política congelada (`getPolicySpecByVersion`).
- Prompt: `systemInstruction` con reglas estrictas; `contents` con delimitadores `<datos_factura>` + JSON.stringify(data).
- `config`: `temperature: 0`, `responseMimeType: "application/json"`, `responseSchema: toGeminiResponseSchema(AiExplanationOutput)`.
- Validar con `AiExplanationOutput.safeParse`; si falla → `ExplanationInvalidError`.
- Filtro post-hoc `looksUnsafe`: code fence, `<script`, URL → `ExplanationInvalidError`.
- Persistir con `insertAiExplanation`.
- Devolver `ExplainResult`.

- [ ] **Step 5: Correr y ver que pasa**

Run: `bash ./scripts/compose.sh exec app npx tsx --test src/services/aiExplanation.test.ts`
Expected: PASS.

- [ ] **Step 6: Commitear**

```bash
git add api/src/services/aiExplanation.ts api/src/services/aiExplanation.test.ts api/package.json
git commit -m "feat(api): add ai explanation service with gemini and injection defenses"
```

---

## Task 4: Endpoint `POST /api/invoices/:id/explain`

**Files:**
- Create: `api/src/routes/explanations.ts`
- Create: `api/src/routes/explanations.test.ts`
- Modify: `api/src/app.ts` (registrar la ruta)
- Modify: `api/package.json` (script `test`)

- [ ] **Step 1: Agregar el test al script `test`**

En `api/package.json`, añadir `src/routes/explanations.test.ts`.

- [ ] **Step 2: Escribir los tests de la ruta**

Casos:
- 404 si la factura no existe.
- 409 `not_explainable` si el veredicto es PAGAR.
- 503 `explanation_not_configured` sin API key (PDF/JSON con veredicto FRENAR).
- 200/201 con `cached` y `explanation` cuando hay caller (test de servicio ya cubre; la ruta test puede verificar 503 y 409 y 404).
- 400 `invalid_body` si `regenerate` no es boolean.

- [ ] **Step 3: Correr y ver que falla**

Run: `bash ./scripts/compose.sh exec app npx tsx --test src/routes/explanations.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implementar la ruta y registrarla**

`api/src/routes/explanations.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { getDb } from "../db/index.js";
import {
  ExplanationInvalidError,
  ExplanationNotConfiguredError,
  ExplanationUnavailableError,
  explainInvoice,
} from "../services/aiExplanation.js";

export async function registerExplanationRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string }; Body: { regenerate?: unknown } }>(
    "/api/invoices/:id/explain",
    async (request, reply) => {
      const body = (request.body ?? {}) as { regenerate?: unknown };
      if (body.regenerate !== undefined && typeof body.regenerate !== "boolean") {
        return reply.code(400).send({ error: "invalid_body" });
      }
      try {
        const result = await explainInvoice(request.params.id, getDb(), {
          regenerate: body.regenerate === true,
        });
        return reply.code(result.cached ? 200 : 201).send(result);
      } catch (error) {
        if (error instanceof ExplanationNotConfiguredError) {
          return reply.code(503).send({ error: "explanation_not_configured" });
        }
        if (error instanceof ExplanationUnavailableError) {
          return reply.code(503).send({ error: "explanation_unavailable" });
        }
        if (error instanceof ExplanationInvalidError) {
          return reply.code(422).send({ error: "explanation_invalid" });
        }
        const msg = (error as Error).message;
        if (msg === "invoice_not_found") {
          return reply.code(404).send({ error: "not_found" });
        }
        if (msg === "not_explainable") {
          return reply.code(409).send({ error: "not_explainable" });
        }
        throw error;
      }
    },
  );
}
```

En `app.ts`: importar `registerExplanationRoutes` y llamar `await app.register(registerExplanationRoutes);` junto a las otras.

- [ ] **Step 5: Correr y ver que pasa**

Run: `bash ./scripts/compose.sh exec app npx tsx --test src/routes/explanations.test.ts`
Expected: PASS.

- [ ] **Step 6: Commitear**

```bash
git add api/src/routes/explanations.ts api/src/routes/explanations.test.ts api/src/app.ts api/package.json
git commit -m "feat(api): add invoice ai explanation endpoint"
```

---

## Task 5: UI — botón y resultado en `InvoiceInspector`

**Files:**
- Modify: `web/src/components/audit/InvoiceInspector.tsx`
- Modify: `web/src/types/audit.ts` (agregar `AiExplanationResult`)
- (Opcional) Create: `web/src/components/audit/InvoiceInspector.test.tsx` + Modify `web/package.json`

- [ ] **Step 1: Agregar el tipo `AiExplanationResult`**

En `web/src/types/audit.ts`:

```ts
export interface AiExplanationResult {
  id: string;
  decision_id: string;
  policy_version: string;
  explanation: string;
  model: string;
  cached: boolean;
  created_at: string;
}
```

- [ ] **Step 2: Implementar el botón y el resultado**

En `InvoiceInspector.tsx`:
- Estados: `aiExplanation`, `aiCached`, `explaining`, `explainError`.
- Resetearlos cuando cambia `record`.
- `handleExplain(regenerate)` que hace POST y actualiza estado.
- Mostrar botón "Explicar con IA" solo si `record.verdict === "FRENAR" || record.verdict === "ESCALAR"`.
- Mostrar spinner mientras `explaining`.
- Renderizar el texto en un bloque con borde, y un botón "Regenerar".
- Mostrar `explainError` si existe.

- [ ] **Step 3: (Opcional) Test de render del botón**

Crear `web/src/components/audit/InvoiceInspector.test.tsx` que renderiza con `renderToStaticMarkup` y verifica:
- Con veredicto FRENAR, aparece "Explicar con IA".
- Con veredicto PAGAR, no aparece.

Nota: `InvoiceInspector` dispara `fetch` en su `useEffect` solo cuando `open === true`. Para el test de render del botón, renderizar con `open={false}` para evitar la llamada de red; el botón vive en el cuerpo del componente. Si el `Sheet` (Radix) no renderiza hijos con `open={false}`, mockear `fetch` globalmente y renderizar con `open={true}`.

Agregarlo al script `test` de `web/package.json`.

- [ ] **Step 4: Typecheck web**

Run: `bash ./scripts/compose.sh exec app npm run typecheck -w web`
Expected: limpio.

- [ ] **Step 5: Commitear**

```bash
git add web/src/components/audit/InvoiceInspector.tsx web/src/types/audit.ts web/package.json web/src/components/audit/InvoiceInspector.test.tsx
git commit -m "feat(web): add ai explanation button to invoice inspector"
```

---

## Task 6: Documentación y diagramas (Q3/Q11)

**Files:**
- Modify: `diagramas/er.dbml`
- Modify: `diagramas/er.mmd`
- Modify: `docs/propuesta_modelo_ER_faktur.md`
- Create: `docs/decisiones/0003-ai-explanation.md`

- [ ] **Step 1: Agregar `ai_explanations` a `er.dbml` y `er.mmd`**

Tabla con campos: id (pk), invoice_id (fk), decision_id (fk), policy_version (fk), model, prompt_version, explanation, created_at. Índices por decision_id e invoice_id.

- [ ] **Step 2: Documentar la tabla en `propuesta_modelo_ER_faktur.md`**

Sección nueva (o apéndice) describiendo `ai_explanations`, su relación con `decisions` (cache por decisión) y el motivo de persistir (auditoría + costo).

- [ ] **Step 3: Crear ADR `0003-ai-explanation.md`**

Decisión: la IA explica pero no decide; persistencia y caché por decisión; defensa contra prompt injection. Reutiliza `GEMINI_MODEL`.

- [ ] **Step 4: Commitear**

```bash
git add diagramas/er.dbml diagramas/er.mmd docs/propuesta_modelo_ER_faktur.md docs/decisiones/0003-ai-explanation.md
git commit -m "docs: document ai_explanations table and ai explanation adr"
```

---

## Task 7: Verificación final

- [ ] **Step 1: `just check` (typecheck + lint + test) en ambos workspaces**

Run: `bash ./scripts/compose.sh exec app npm run typecheck && bash ./scripts/compose.sh exec app npm run lint && bash ./scripts/compose.sh exec app npm test`
Expected: limpio y tests pasando.

- [ ] **Step 2: Typecheck web**

Run: `bash ./scripts/compose.sh exec app npm run typecheck -w web`
Expected: limpio.

- [ ] **Step 3: Prettier**

Run: `bash ./scripts/compose.sh exec app npx prettier --check .` (o `just fmt` si disponible)
Expected: sin diferencias (correr `just fmt` si hay).

- [ ] **Step 4: Smoke manual**

Levantar dev, subir un TC FRENAR/ESCALAR, abrir el sheet, clic en "Explicar con IA", verificar texto en español y que el veredicto no cambia. Verificar 503 sin API key.

---

## Self-Review

1. **Spec coverage:** botón en sheet (Task 5), POST endpoint (Task 4), persistencia/caché (Tasks 1-3), política congelada (Task 3), defensa injection (Task 3), docs/diagramas/ADR (Task 6). Cubierto.
2. **Step scan:** cada paso tiene comando y expected. Sin "TBD".
3. **Type consistency:** `ExplainResult`, `ExplainOptions`, `ExplanationCaller`, `AiExplanationRow`, `AiExplanationResult` usados consistentemente. `getLatestAiExplanationByDecision` y `listDecisionsByInvoice` existentes.
4. **Review Focus:** los cinco puntos tienen verificación en Tasks 3 y 4.
5. **Proportion:** el plan es largo por los tests; el código de implementación es ~200 líneas de servicio + ~80 de UI.

## Execution Handoff

Plan completo y guardado en `docs/superpowers/plans/2026-10-17-ai-explanation.md`. Revisalo. ¿Captura lo que quieres?

La ejecución será con el método que ya elegiste (**Native**): yo implemento cada paso en esta sesión y un revisor final revisa toda la rama. ¿Procedo con la implementación?