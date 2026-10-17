# T5 · Motor de reglas como función pura — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar `evaluate(invoice, policy, context) → { verdict, reason_code, explanation }` con las 8 reglas / 10 condiciones de la tabla de precedencia. Función pura, sin I/O. Primero que dispara gana.

**Architecture:** Un solo módulo `api/src/domain/ruleEngine.ts` con los tipos `EvaluableInvoice`, `EvaluationContext`, `EvaluationResult` y la función `evaluate`. Las reglas se evalúan en orden explícito (hardcoded, mismo orden que `precedence.ts` de T2). Los templates de explanation usan interpolación con formateo español ($1.200). El motor importa `ExtractedInvoice`, `Verdict`, `ReasonCode`, `PolicySpec` y `Category` de los módulos existentes.

**Tech Stack:** TypeScript 5.9, Zod 4.6.7, `node:test` vía tsx. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-10-17-t5-rule-engine-design.md` — el plan implementa ese spec; los dos viajan juntos.

## Global Constraints

- Todo corre dentro del contenedor. `just` no está instalado en el host: usar `bash ./scripts/compose.sh <args>`. El cwd de `compose exec` es `/app`.
- Imports relativos llevan extensión `.js` (`module: NodeNext`).
- **El script `test` de `api/package.json` es una lista explícita y hay que editarla a mano** para cada `.test.ts` nuevo.
- Prettier: 100 columnas, comillas dobles, semicolons. `just check` no corre Prettier.
- Commits: Conventional Commits, mensajes en inglés, un commit = un cambio lógico.
- **Pureza:** sin `import` de `better-sqlite3`, `fs`, `fetch`, ni ningún módulo con side effects. Solo `zod` y los módulos de dominio.
- Los tipos se derivan con `z.infer`. No escribir interfaces a mano.

## Review Focus

Cinco formas de falla que el spec implica y que ningún test del camino feliz toca.

1. **Un `.test.ts` nuevo que no está en el script `test`.** Typecheck, lint y `npm test` pasan en verde y el test nunca corrió. Es la falla más silenciosa del repo y ya pasó dos veces.
2. **Drift con `historical_avg_usd = 0`.** Si un proveedor ALLOWLISTED tiene promedio 0, la división por cero o un falso positivo. Mitigación: se salta la regla 5 si avg === 0.
3. **Categoría ausente en `policy.category_budgets`.** Si la categoría del proveedor no está en los budgets, el motor podría crashear al acceder a `categorySpent[category]`. Mitigación: verificar `category in policy.category_budgets` antes de comparar.
4. **`field_confidence` ausente.** Los 11 TCs que no son TC-12 no tienen `field_confidence`. El motor debe usar `undefined` y saltar la rama de confianza, no crashear ni disparar ERR_INVALID_DATA.
5. **`vendor_id = null` en la dedup por tupla.** Si el motor intenta comparar `(null, invoice_number)` contra existingInvoices, podría dar falsos positivos. Mitigación: salta la tupla si `vendor_id` es null.

---

### Task 1: Tipos + evaluate con las reglas 1-4

**Files:**
- Create: `api/src/domain/ruleEngine.ts`
- Create: `api/src/domain/ruleEngine.test.ts`
- Modify: `api/package.json` (script `test`)

**Interfaces:**
- Consumes: `ExtractedInvoice`, `Verdict`, `ReasonCode` de `./extraction.js` y `./decision.js`; `PolicySpec` de `./policy.js`.
- Produces:
  ```ts
  // api/src/domain/ruleEngine.ts
  export type EvaluableInvoice = ExtractedInvoice & {
    file_hash: string;
    vendor_id: string | null;
    total_usd: number;
    fx_rate_used: number;
    extraction_confidence: number | undefined;
  };
  export type VendorInfo = { status: "ALLOWLISTED" | "BLOCKLISTED"; historical_avg_usd: number; category: string };
  export type ExistingInvoice = { file_hash: string; vendor_id: string | null; invoice_number: string };
  export type BudgetState = { monthlySpent: number; monthlyBudget: number; categorySpent: Record<string, number> };
  export type EvaluationContext = { vendor: VendorInfo | null; existingInvoices: ExistingInvoice[]; budgetState: BudgetState };
  export type EvaluationResult = { verdict: Verdict; reason_code: ReasonCode; explanation: string };
  export function evaluate(invoice: EvaluableInvoice, policy: PolicySpec, context: EvaluationContext): EvaluationResult;
  ```

- [ ] **Step 1: Agregar el test al script `test`**

En `api/package.json`, añadir `src/domain/ruleEngine.test.ts`.

- [ ] **Step 2: Escribir los tests de las reglas 1-4**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { evaluate } from "./ruleEngine.js";
import type { EvaluableInvoice, EvaluationContext } from "./ruleEngine.js";
import { PolicySpec } from "./policy.js";

const policy = PolicySpec.parse({
  version: "v1",
  created_at: "2026-10-17",
  created_by: "test",
  comment: "test",
  auto_approval_threshold_usd: 1000,
  monthly_budget_usd: 5000,
  vendor_drift_factor: 1.4,
  min_extraction_confidence: 0.7,
  allowed_currencies: ["USD", "MXN", "COP", "EUR"],
  category_budgets: {
    Infraestructura: 1500,
    Diseno: 1000,
    Marketing: 4000,
    Legal: 3000,
    Software: 500,
    Retail: 0,
  },
});

function inv(overrides: Partial<EvaluableInvoice> = {}): EvaluableInvoice {
  return {
    invoice_number: "INV-001",
    total_amount: 420,
    currency: "USD",
    vendor_name: "CloudServers Inc",
    vendor_tax_id: "CLOUD-SERVERS-INC",
    due_date: "2026-10-15",
    subtotal: 400,
    tax_amount: 20,
    line_items: [{ description: "hosting", quantity: 1, unit_price: 400, total: 400 }],
    file_hash: "a".repeat(64),
    vendor_id: "v1",
    total_usd: 420,
    fx_rate_used: 1.0,
    extraction_confidence: undefined,
    ...overrides,
  };
}

function ctx(overrides: Partial<EvaluationContext> = {}): EvaluationContext {
  return {
    vendor: { status: "ALLOWLISTED", historical_avg_usd: 420, category: "Infraestructura" },
    existingInvoices: [],
    budgetState: { monthlySpent: 0, monthlyBudget: 5000, categorySpent: {} },
    ...overrides,
  };
}

test("regla 1a: sin tax_id → FRENAR ERR_INVALID_DATA", () => {
  const r = evaluate(inv({ vendor_tax_id: undefined }), policy, ctx());
  assert.equal(r.verdict, "FRENAR");
  assert.equal(r.reason_code, "ERR_INVALID_DATA");
  assert.match(r.explanation, /identificador fiscal/);
});

test("regla 1a: moneda no permitida → FRENAR ERR_INVALID_DATA", () => {
  const p = { ...policy, allowed_currencies: ["USD", "MXN"] };
  const r = evaluate(inv({ currency: "EUR" }), p, ctx());
  assert.equal(r.verdict, "FRENAR");
  assert.equal(r.reason_code, "ERR_INVALID_DATA");
  assert.match(r.explanation, /moneda/);
});

test("regla 1b: confianza baja → ESCALAR ALERT_LOW_CONFIDENCE", () => {
  const r = evaluate(
    inv({ extraction_confidence: 0.5, field_confidence: { invoice_number: 0.95, vendor_tax_id: 0.98, total_amount: 0.99, currency: 1, due_date: 0.5 } }),
    policy,
    ctx(),
  );
  assert.equal(r.verdict, "ESCALAR");
  assert.equal(r.reason_code, "ALERT_LOW_CONFIDENCE");
  assert.match(r.explanation, /due_date/);
  assert.match(r.explanation, /0\.5/);
});

test("regla 1b: sin field_confidence → no dispara confianza", () => {
  const r = evaluate(inv({ extraction_confidence: undefined }), policy, ctx());
  assert.notEqual(r.reason_code, "ALERT_LOW_CONFIDENCE");
});

test("regla 2: hash duplicado → FRENAR ERR_DUPLICATE_INVOICE", () => {
  const r = evaluate(inv(), policy, ctx({ existingInvoices: [{ file_hash: "a".repeat(64), vendor_id: "v1", invoice_number: "INV-001" }] }));
  assert.equal(r.verdict, "FRENAR");
  assert.equal(r.reason_code, "ERR_DUPLICATE_INVOICE");
});

test("regla 2: tupla duplicada → FRENAR ERR_DUPLICATE_INVOICE", () => {
  const r = evaluate(inv(), policy, ctx({ existingInvoices: [{ file_hash: "b".repeat(64), vendor_id: "v1", invoice_number: "INV-001" }] }));
  assert.equal(r.verdict, "FRENAR");
  assert.equal(r.reason_code, "ERR_DUPLICATE_INVOICE");
});

test("regla 2: vendor_id null → salta tupla, solo hash", () => {
  const r = evaluate(inv({ vendor_id: null }), policy, ctx({ existingInvoices: [{ file_hash: "b".repeat(64), vendor_id: null, invoice_number: "INV-001" }] }));
  assert.notEqual(r.reason_code, "ERR_DUPLICATE_INVOICE");
});

test("regla 3: bloqueado → FRENAR ERR_BLACKLISTED_VENDOR", () => {
  const r = evaluate(inv(), policy, ctx({ vendor: { status: "BLOCKLISTED", historical_avg_usd: 0, category: "Retail" } }));
  assert.equal(r.verdict, "FRENAR");
  assert.equal(r.reason_code, "ERR_BLACKLISTED_VENDOR");
});

test("regla 4: proveedor nuevo → ESCALAR ALERT_NEW_VENDOR", () => {
  const r = evaluate(inv(), policy, ctx({ vendor: null }));
  assert.equal(r.verdict, "ESCALAR");
  assert.equal(r.reason_code, "ALERT_NEW_VENDOR");
});

test("regla 4: precedencia sobre regla 5 (desconocido no tiene drift)", () => {
  const r = evaluate(inv({ total_usd: 99999 }), policy, ctx({ vendor: null }));
  assert.equal(r.reason_code, "ALERT_NEW_VENDOR");
});
```

- [ ] **Step 3: Correr y ver que falla**

Expected: FAIL con `Cannot find module './ruleEngine.js'`.

- [ ] **Step 4: Implementar `ruleEngine.ts` (reglas 1-4)**

Implementar los tipos y la función `evaluate` con las reglas 1-4. Las reglas 5-8 se añaden en Task 2.

Un helper `fmt(n)` para formatear números con punto de miles.

La estructura de `evaluate`:
```ts
export function evaluate(invoice, policy, context): EvaluationResult {
  // Regla 1a: datos críticos
  if (!invoice.vendor_tax_id || invoice.vendor_tax_id.trim() === "") {
    return { verdict: "FRENAR", reason_code: "ERR_INVALID_DATA", explanation: "Falta el identificador fiscal del beneficiario" };
  }
  if (!policy.allowed_currencies.includes(invoice.currency)) {
    return { verdict: "FRENAR", reason_code: "ERR_INVALID_DATA", explanation: `La moneda ${invoice.currency} no está permitida por la política` };
  }
  // Regla 1b: confianza baja
  if (invoice.extraction_confidence !== undefined && invoice.extraction_confidence < policy.min_extraction_confidence) {
    const field = invoice.field_confidence ? lowestConfidenceField(invoice.field_confidence) : "desconocido";
    const value = invoice.field_confidence ? invoice.field_confidence[field as keyof typeof invoice.field_confidence] : invoice.extraction_confidence;
    return { verdict: "ESCALAR", reason_code: "ALERT_LOW_CONFIDENCE", explanation: `No se pudo leer ${field} con confianza (${value} < ${policy.min_extraction_confidence})` };
  }
  // Regla 2: duplicado
  if (context.existingInvoices.some((e) => e.file_hash === invoice.file_hash)) {
    return { verdict: "FRENAR", reason_code: "ERR_DUPLICATE_INVOICE", explanation: `La factura ${invoice.invoice_number} de ${invoice.vendor_name ?? "desconocido"} ya fue registrada` };
  }
  if (invoice.vendor_id !== null && context.existingInvoices.some((e) => e.vendor_id === invoice.vendor_id && e.invoice_number === invoice.invoice_number)) {
    return { verdict: "FRENAR", reason_code: "ERR_DUPLICATE_INVOICE", explanation: `La factura ${invoice.invoice_number} de ${invoice.vendor_name ?? "desconocido"} ya fue registrada` };
  }
  // Regla 3: bloqueado
  if (context.vendor?.status === "BLOCKLISTED") {
    return { verdict: "FRENAR", reason_code: "ERR_BLACKLISTED_VENDOR", explanation: `El beneficiario está en la lista bloqueada (policy ${policy.version})` };
  }
  // Regla 4: nuevo
  if (context.vendor === null) {
    return { verdict: "ESCALAR", reason_code: "ALERT_NEW_VENDOR", explanation: `El proveedor no está en la lista permitida (policy ${policy.version})` };
  }
  // Reglas 5-8 se añaden en Task 2
  return { verdict: "PAGAR", reason_code: "SUCCESS_TOUCHLESS_STP", explanation: `Dentro de política: ${fmt(invoice.total_usd)} < umbral ${fmt(policy.auto_approval_threshold_usd)}` };
}
```

- [ ] **Step 5: Correr y ver que pasa**

Expected: PASS, 10 tests.

- [ ] **Step 6: Commitear**

```bash
git add api/src/domain/ruleEngine.ts api/src/domain/ruleEngine.test.ts api/package.json
git commit -m "feat(api): add rule engine rules 1-4 (validation, dedup, blacklist, new vendor)"
```

---

### Task 2: Reglas 5-8 + edge cases

**Files:**
- Modify: `api/src/domain/ruleEngine.ts`
- Modify: `api/src/domain/ruleEngine.test.ts`

**Interfaces:**
- Consumes: tipos de Task 1.
- Produces: `evaluate` completo con las 8 reglas.

- [ ] **Step 1: Escribir los tests de las reglas 5-8 y edge cases**

```ts
test("regla 5: drift → ESCALAR ALERT_VENDOR_DRIFT", () => {
  const r = evaluate(inv({ total_usd: 1200 }), policy, ctx({ vendor: { status: "ALLOWLISTED", historical_avg_usd: 480, category: "Diseno" } }));
  assert.equal(r.verdict, "ESCALAR");
  assert.equal(r.reason_code, "ALERT_VENDOR_DRIFT");
  assert.match(r.explanation, /480/);
  assert.match(r.explanation, /1\.200/);
});

test("regla 5: sin drift → no dispara", () => {
  const r = evaluate(inv({ total_usd: 500 }), policy, ctx({ vendor: { status: "ALLOWLISTED", historical_avg_usd: 480, category: "Diseno" } }));
  assert.notEqual(r.reason_code, "ALERT_VENDOR_DRIFT");
});

test("regla 5: avg = 0 → se salta", () => {
  const r = evaluate(inv({ total_usd: 100 }), policy, ctx({ vendor: { status: "ALLOWLISTED", historical_avg_usd: 0, category: "Diseno" } }));
  assert.notEqual(r.reason_code, "ALERT_VENDOR_DRIFT");
});

test("regla 5: monto menor al promedio → no dispara", () => {
  const r = evaluate(inv({ total_usd: 100 }), policy, ctx({ vendor: { status: "ALLOWLISTED", historical_avg_usd: 480, category: "Diseno" } }));
  assert.notEqual(r.reason_code, "ALERT_VENDOR_DRIFT");
});

test("regla 6a: presupuesto mensual excedido → ESCALAR ALERT_BUDGET_OVERRUN", () => {
  const r = evaluate(inv({ total_usd: 100 }), policy, ctx({ budgetState: { monthlySpent: 4950, monthlyBudget: 5000, categorySpent: {} } }));
  assert.equal(r.verdict, "ESCALAR");
  assert.equal(r.reason_code, "ALERT_BUDGET_OVERRUN");
});

test("regla 6b: presupuesto categoría excedido → ESCALAR ALERT_BUDGET_TIGHT", () => {
  const r = evaluate(inv({ total_usd: 950 }), policy, ctx({ vendor: { status: "ALLOWLISTED", historical_avg_usd: 850, category: "Diseno" }, budgetState: { monthlySpent: 0, monthlyBudget: 5000, categorySpent: { Diseno: 850 } } }));
  assert.equal(r.verdict, "ESCALAR");
  assert.equal(r.reason_code, "ALERT_BUDGET_TIGHT");
  assert.match(r.explanation, /Diseño/);
});

test("regla 6a precedencia sobre 6b", () => {
  const r = evaluate(inv({ total_usd: 100 }), policy, ctx({ budgetState: { monthlySpent: 4950, monthlyBudget: 5000, categorySpent: { Diseno: 850 } } }));
  assert.equal(r.reason_code, "ALERT_BUDGET_OVERRUN");
});

test("regla 6b: categoría ausente en policy → se salta", () => {
  const r = evaluate(inv({ total_usd: 100 }), policy, ctx({ vendor: { status: "ALLOWLISTED", historical_avg_usd: 480, category: "Inexistente" }, budgetState: { monthlySpent: 0, monthlyBudget: 5000, categorySpent: {} } }));
  assert.notEqual(r.reason_code, "ALERT_BUDGET_TIGHT");
});

test("regla 6: budget = 0 → cualquier monto positivo excede", () => {
  const r = evaluate(inv({ total_usd: 10 }), policy, ctx({ vendor: { status: "ALLOWLISTED", historical_avg_usd: 480, category: "Retail" }, budgetState: { monthlySpent: 0, monthlyBudget: 5000, categorySpent: { Retail: 0 } } }));
  assert.equal(r.reason_code, "ALERT_BUDGET_TIGHT");
});

test("regla 7: umbral superado → ESCALAR ALERT_THRESHOLD_EXCEEDED", () => {
  const r = evaluate(inv({ total_usd: 3500 }), policy, ctx());
  assert.equal(r.verdict, "ESCALAR");
  assert.equal(r.reason_code, "ALERT_THRESHOLD_EXCEEDED");
});

test("regla 7: monto en el umbral exacto → no dispara", () => {
  const r = evaluate(inv({ total_usd: 1000 }), policy, ctx());
  assert.notEqual(r.reason_code, "ALERT_THRESHOLD_EXCEEDED");
});

test("regla 8: pasa todo → PAGAR SUCCESS_TOUCHLESS_STP", () => {
  const r = evaluate(inv({ total_usd: 420 }), policy, ctx());
  assert.equal(r.verdict, "PAGAR");
  assert.equal(r.reason_code, "SUCCESS_TOUCHLESS_STP");
});

test("umbral alto + duplicado → FRENAR (regla 2 precede a la 7)", () => {
  const r = evaluate(inv({ total_usd: 3500 }), policy, ctx({ existingInvoices: [{ file_hash: "a".repeat(64), vendor_id: "v1", invoice_number: "INV-001" }] }));
  assert.equal(r.verdict, "FRENAR");
  assert.equal(r.reason_code, "ERR_DUPLICATE_INVOICE");
});

test("moneda no permitida → FRENAR ERR_INVALID_DATA", () => {
  const p = { ...policy, allowed_currencies: ["USD", "MXN"] };
  const r = evaluate(inv({ currency: "EUR" }), p, ctx());
  assert.equal(r.verdict, "FRENAR");
  assert.equal(r.reason_code, "ERR_INVALID_DATA");
});

test("proveedor bloqueado precede a drift", () => {
  const r = evaluate(inv({ total_usd: 99999 }), policy, ctx({ vendor: { status: "BLOCKLISTED", historical_avg_usd: 0, category: "Retail" } }));
  assert.equal(r.reason_code, "ERR_BLACKLISTED_VENDOR");
});

test("proveedor nuevo precede a drift", () => {
  const r = evaluate(inv({ total_usd: 99999 }), policy, ctx({ vendor: null }));
  assert.equal(r.reason_code, "ALERT_NEW_VENDOR");
});
```

- [ ] **Step 2: Correr y ver que falla**

Expected: FAIL (tests reference rules not yet implemented).

- [ ] **Step 3: Implementar reglas 5-8 en `ruleEngine.ts`**

Añadir las reglas 5-8 al `evaluate` existente. Las reglas 1-4 ya están implementadas en Task 1.

Regla 5 (drift):
```ts
if (context.vendor && context.vendor.status === "ALLOWLISTED" && context.vendor.historical_avg_usd > 0) {
  const threshold = context.vendor.historical_avg_usd * policy.vendor_drift_factor;
  if (invoice.total_usd > threshold) {
    const drift = Math.round(((invoice.total_usd - context.vendor.historical_avg_usd) / context.vendor.historical_avg_usd) * 100);
    return { verdict: "ESCALAR", reason_code: "ALERT_VENDOR_DRIFT", explanation: `Acordado ${fmt(context.vendor.historical_avg_usd)}, facturado ${fmt(invoice.total_usd)} (+${drift}%, límite ${policy.vendor_drift_factor}x)` };
  }
}
```

Regla 6a (monthly budget):
```ts
if (context.budgetState.monthlySpent + invoice.total_usd > context.budgetState.monthlyBudget) {
  const remaining = context.budgetState.monthlyBudget - context.budgetState.monthlySpent;
  return { verdict: "ESCALAR", reason_code: "ALERT_BUDGET_OVERRUN", explanation: `Presupuesto del periodo insuficiente: saldo ${fmt(remaining)}, factura ${fmt(invoice.total_usd)}` };
}
```

Regla 6b (category budget):
```ts
const category = context.vendor?.category;
if (category && category in policy.category_budgets) {
  const categoryBudget = policy.category_budgets[category as keyof typeof policy.category_budgets];
  const categorySpent = context.budgetState.categorySpent[category] ?? 0;
  if (categorySpent + invoice.total_usd > categoryBudget) {
    const remaining = categoryBudget - categorySpent;
    return { verdict: "ESCALAR", reason_code: "ALERT_BUDGET_TIGHT", explanation: `Saldo de la categoría ${category}: ${fmt(remaining)}; factura: ${fmt(invoice.total_usd)}` };
  }
}
```

Regla 7 (threshold):
```ts
if (invoice.total_usd > policy.auto_approval_threshold_usd) {
  return { verdict: "ESCALAR", reason_code: "ALERT_THRESHOLD_EXCEEDED", explanation: `Supera el umbral de aprobación autónoma de ${fmt(policy.auto_approval_threshold_usd)}` };
}
```

Regla 8 (pass):
```ts
return { verdict: "PAGAR", reason_code: "SUCCESS_TOUCHLESS_STP", explanation: `Dentro de política: ${fmt(invoice.total_usd)} < umbral ${fmt(policy.auto_approval_threshold_usd)}` };
```

- [ ] **Step 4: Correr y ver que pasa**

Expected: PASS, 23 tests (10 de Task 1 + 13 de Task 2).

- [ ] **Step 5: Commitear**

```bash
git add api/src/domain/ruleEngine.ts api/src/domain/ruleEngine.test.ts
git commit -m "feat(api): add rule engine rules 5-8 (drift, budget, threshold, pass)"
```

---

### Task 3: Verificación final

- [ ] **Step 1: Verificar que `just check` pasa**

Run: `bash ./scripts/compose.sh exec app npm run typecheck && bash ./scripts/compose.sh exec app npm run lint && bash ./scripts/compose.sh exec app npm test`

Expected: typecheck limpio, lint limpio, tests pasando (count = 92 + nuevos de T5).

- [ ] **Step 2: Verificar que el build de producción sigue pasando**

Run: `COMPOSE_ENV=prod bash ./scripts/compose.sh build`

Expected: imagen construida sin errores.

- [ ] **Step 3: Verificar pureza del motor**

Run: `grep -E "better-sqlite3|node:fs|fetch\(" api/src/domain/ruleEngine.ts`

Expected: sin salida (el motor no importa módulos con side effects).

- [ ] **Step 4: Commitear cualquier ajuste**

```bash
git add -A
git commit -m "feat(api): add deterministic rule engine with frozen precedence"  # si hay cambios pendientes
```

---

## Self-Review

1. **Spec coverage:** el spec tiene 12 secciones. Task 1 cubre §§6.1, 6.2, 7 (tipos + reglas 1-4 + tests). Task 2 cubre §§6.3, 7 (reglas 5-8 + edge cases). Task 3 cubre §9 (criterio de aceptación). Cubierto.

2. **Step scan:** cada paso tiene comando y expected. Sin "TBD".

3. **Type consistency:** `EvaluableInvoice`, `EvaluationContext`, `EvaluationResult`, `VendorInfo`, `ExistingInvoice`, `BudgetState` usados consistentemente. `PolicySpec` importado de `./policy.js`. `Verdict`, `ReasonCode` importados de `./decision.js`. `ExtractedInvoice` importado de `./extraction.js`.

4. **Review Focus:** los cinco puntos tienen su verificación en las Tasks 1 y 2.

5. **Proportion:** el plan es largo por los tests, pero los tests son la especificación. El código de implementación es ~80 líneas.

## Execution Handoff

Plan completo y guardado en `docs/superpowers/plans/2026-10-17-t5-rule-engine.md`. Revisalo. ¿Captura lo que quieres?

La ejecución será con el método que ya elegiste (**Native**): yo implemento cada paso en esta sesión y un revisor final revisa toda la rama. ¿Procedo con la implementación?