# T5 · Motor de reglas como función pura — Design

**Fecha:** 2026-10-17
**Estado:** aprobado, pendiente de plan e implementación
**Backlog:** `docs/backlog_implementacion_mvp.md` §T5, §5
**Depende de:** T2 (mergeado), T3 (mergeado)

## 1. Intent y por qué

El motor es la pieza que hace verificable la promesa de "cero pagos fuera de reglas". Implementa la tabla de precedencia de §5 como una función pura: `evaluate(invoice, policy, context) → { verdict, reason_code, explanation }`. Se evalúa de arriba hacia abajo y **el primero que dispara gana**. Sin I/O, sin base, sin red: si el motor toca disco o red, el criterio "es un hecho, no una promesa" se rompe.

## 2. Goals

- Función pura `evaluate(invoice, policy, context)` que devuelve `{ verdict, reason_code, explanation }`.
- Las 8 reglas / 10 condiciones de la tabla de precedencia (T2 `precedence.ts`), en orden, sin código especial por caso.
- `explanation` redactado en lenguaje natural con los números concretos, nunca como código de error.
- Tipos `EvaluableInvoice` y `EvaluationContext` exportados para que T6, T8 y T9 los usen.
- Tests unitarios para cada regla y para los edge cases (drift con avg 0, budget 0, categoría ausente, etc.).
- `just check` y `just fmt` limpios.

## 3. Non-goals (explícito)

- **No se conecta a la base.** El motor es puro. La ingesta (T9) consulta la base y arma el `context`.
- **No se llama al LLM.** El motor solo evalúa datos ya extraídos.
- **No se escribe en la base.** El motor devuelve una decisión; el caller (T8/T9/T6) la persiste.
- **No se genera `policy_version` ni `amount_usd_evaluated`.** Esos campos del `Decision` (T2) los añade el caller.
- **No se implementa el runner.** El runner es T6. T5 solo proporciona `evaluate`.

## 4. Constraints

- **Pureza.** Sin `import` de `better-sqlite3`, `fs`, `fetch`, ni ningún módulo con side effects. Solo `zod` (para tipos) y los módulos de dominio (`extraction`, `decision`, `policy`, `precedence`).
- **Sin I/O.** El motor no lee archivos, no consulta la base, no hace red.
- **Determinista.** Dado el mismo input, siempre devuelve el mismo output. Sin `Date.now()`, sin `Math.random()`.
- **El primer que dispara gana.** Se evalúan las 10 condiciones en el orden de `precedence.ts`. La primera que se cumple determina el veredicto.
- **`explanation` siempre presente.** String no vacío, en español, con los números concretos del caso.

## 5. Decisiones tomadas en esta sesión

| Decisión | Elegido | Por qué |
|:---|:---|:---|
| Input del motor | `EvaluableInvoice` (richer type con campos calculados) | El motor es puro y no puede hacer I/O para calcular total_usd, vendor_id, etc. |
| `context` | `{ vendor, existingInvoices, budgetState }` | Cubre las reglas 2-6 sin I/O. |
| `vendor === null` | Significa "no visto antes" → regla 4 | Los proveedores desconocidos no se persisten (ER §2.1). |
| Drift | Solo montos mayores al promedio × factor. Si avg = 0, se salta. | Evita falsos positivos y división por cero. |
| Presupuesto | Comparación estricta (`>`). Budget = 0 se verifica (cualquier monto positivo excede). Categoría ausente en policy → se salta la verificación de categoría. | Retail tiene budget 0 por diseño; categoría ausente es error de config, no de la factura. |
| Moneda | Verificar `invoice.currency ∈ policy.allowed_currencies` como parte de la regla 1 → `ERR_INVALID_DATA` | Consistente con "moneda fuera ⇒ FRENAR" del ER. |
| Dedup con `vendor_id = null` | Se salta la tupla, solo se verifica el hash | Un proveedor desconocido no puede deduplicarse por tupla. |
| `explanation` | Templates fijos con números interpolados | Pureza, testabilidad, la rúbrica lo penaliza si falta. |
| Tipo de `policy` | `PolicySpec` completo (de T4) | El motor no sabe qué campos necesitará en el futuro. |
| Return del motor | `{ verdict, reason_code, explanation }` | El caller arma el `Decision` completo con invoice_id, policy_version, etc. |
| `decided_by` | Siempre `"AGENTE"` (el caller lo añade) | El motor es el agente. |
| `amount_usd_evaluated` | El caller lo añade (`invoice.total_usd`) | El motor no construye `Decision`. |

## 6. Tipos

### 6.1 `EvaluableInvoice`

```ts
export type EvaluableInvoice = ExtractedInvoice & {
  file_hash: string;
  vendor_id: string | null;
  total_usd: number;
  fx_rate_used: number;
  extraction_confidence: number | undefined;
};
```

### 6.2 `EvaluationContext`

```ts
export type VendorInfo = {
  status: "ALLOWLISTED" | "BLOCKLISTED";
  historical_avg_usd: number;
  category: string;
};

export type ExistingInvoice = {
  file_hash: string;
  vendor_id: string | null;
  invoice_number: string;
};

export type BudgetState = {
  monthlySpent: number;
  monthlyBudget: number;
  categorySpent: Record<string, number>;
};

export type EvaluationContext = {
  vendor: VendorInfo | null;
  existingInvoices: ExistingInvoice[];
  budgetState: BudgetState;
};
```

### 6.3 `EvaluationResult`

```ts
export type EvaluationResult = {
  verdict: Verdict;
  reason_code: ReasonCode;
  explanation: string;
};
```

## 7. Las 8 reglas / 10 condiciones

El motor evalúa en este orden (mismo que `precedence.ts` de T2):

| # | Condición | Veredicto | reason_code | Template de explanation |
|:--|:---|:---|:---|:---|
| 1a | `vendor_tax_id` ausente/vacío O `currency ∉ policy.allowed_currencies` | FRENAR | ERR_INVALID_DATA | "Falta el identificador fiscal del beneficiario" / "La moneda {currency} no está permitida por la política" |
| 1b | `extraction_confidence` definido Y `< policy.min_extraction_confidence` | ESCALAR | ALERT_LOW_CONFIDENCE | "No se pudo leer {campo} con confianza ({valor} < {umbral})" |
| 2 | `file_hash` o `(vendor_id, invoice_number)` en `existingInvoices` | FRENAR | ERR_DUPLICATE_INVOICE | "La factura {invoice_number} de {vendor} ya fue registrada" |
| 3 | `vendor.status === "BLOCKLISTED"` | FRENAR | ERR_BLACKLISTED_VENDOR | "El beneficiario está en la lista bloqueada (policy {version})" |
| 4 | `vendor === null` | ESCALAR | ALERT_NEW_VENDOR | "El proveedor no está en la lista permitida (policy {version})" |
| 5 | `vendor` ALLOWLISTED Y `total_usd > historical_avg_usd * drift_factor` (solo si avg > 0) | ESCALAR | ALERT_VENDOR_DRIFT | "Acordado ${avg}, facturado ${amount} (+{drift}%, límite {factor}x)" |
| 6a | `budgetState.monthlySpent + total_usd > monthlyBudget` | ESCALAR | ALERT_BUDGET_OVERRUN | "Presupuesto del periodo insuficiente: saldo ${remaining}, factura ${amount}" |
| 6b | categoría en `categoryBudgets` Y `categorySpent[category] + total_usd > categoryBudget` | ESCALAR | ALERT_BUDGET_TIGHT | "Saldo de la categoría {category}: ${remaining}; factura: ${amount}" |
| 7 | `total_usd > policy.auto_approval_threshold_usd` | ESCALAR | ALERT_THRESHOLD_EXCEEDED | "Supera el umbral de aprobación autónoma de ${threshold}" |
| 8 | (fallthrough) | PAGAR | SUCCESS_TOUCHLESS_STP | "Dentro de política: ${amount} < umbral ${threshold}" |

Nota sobre 1a: si `vendor_tax_id` falta, se dispara ERR_INVALID_DATA. Si la moneda no está en `allowed_currencies`, también. Si ambos fallan, se reporta el primero (tax_id) por orden de verificación.

Nota sobre 1b: si `extraction_confidence` es `undefined` (no hay `field_confidence`), se salta esta condición (no hay confianza que evaluar). El campo reportado en el explanation es el de menor confianza (si `field_confidence` está presente).

Nota sobre 5: si `historical_avg_usd === 0`, se salta (no hay histórico para comparar).

Nota sobre 6b: si la categoría del proveedor no está en `policy.category_budgets`, se salta la verificación de categoría.

Nota sobre 6a vs 6b: la mensual se evalúa primero. Si ambas se exceden, solo se reporta ALERT_BUDGET_OVERRUN.

## 8. Estructura de archivos

| Archivo | Acción | Responsabilidad |
|:---|:---|:---|
| `api/src/domain/ruleEngine.ts` | Crear | `evaluate()` + tipos `EvaluableInvoice`, `EvaluationContext`, `EvaluationResult` |
| `api/src/domain/ruleEngine.test.ts` | Crear | Tests unitarios para cada regla + edge cases |
| `api/package.json` | Modificar | Añadir `src/domain/ruleEngine.test.ts` al script `test` |

## 9. Criterio de aceptación (del backlog)

- Los 5 casos trampa de la tabla del MVP §6 y los 12 TC salen del mismo motor con las mismas 8 reglas, sin código "especial" por caso (verificado por el runner T6).
- Una aprobación nunca salta las reglas 1-3 (el motor no tiene concepto de "aprobación"; eso es T16).
- Umbral alto y duplicado juntos resuelven FRENAR (la regla 2 tiene precedencia sobre la 7).
- `just check` y `just fmt` limpios.

## 10. Lo que queda al builder

- Decidir el formato exacto de los números en los explanations (ej. `$1.200` con punto de miles, o `$1200` sin formato). Recomendación: usar `toLocaleString("es-AR")` o formateo manual con punto de miles y coma decimal.
- Decidir cómo identificar el campo de menor confianza en ALERT_LOW_CONFIDENCE (si `field_confidence` está presente).
- Decidir si el motor importa `PRECEDENCE` de T2 para verificar el orden, o si el orden está hardcoded. Recomendación: hardcoded (más legible), el runner (T6) verifica la consistencia.
- Verificar que `EvaluableInvoice` es compatible con los fixtures de T4 (que son `ExtractedInvoice`).

## 11. Fuera de scope (explícito)

- El runner (T6) — T5 solo proporciona `evaluate`.
- La API (T8-T10) — T5 no se conecta a la base ni a la red.
- Persistencia de decisiones — el motor devuelve una decisión; el caller la persiste.
- Notificaciones (T17).
- `decided_by`, `policy_version`, `amount_usd_evaluated` — los añade el caller.

## 12. Riesgos

- **El explanation podría no coincidir con el expected de `ground_truth.json`.** El runner (T6) compara `reason_code`, no `explanation`. Pero la rúbrica evalúa la explicabilidad. Mitigación: tests unitarios que verifican el explanation exacto para cada regla.
- **Drift con `historical_avg_usd = 0`.** Si un proveedor ALLOWLISTED tiene promedio 0, se salta la regla 5. Pero si el promedio es 0 porque no hay histórico, cualquier monto es "drift". Mitigación: solo se salta si avg === 0, que es el caso de VENTA-POS-DUO (BLOCKLISTED, así que la regla 3 lo frena antes).
- **Categoría ausente en `policy.category_budgets`.** Se salta la verificación de categoría. Si la política está mal configurada, el motor no lo detecta. Mitigación: RI-12 en el DDL (T3) previene categorías inventadas, pero no garantiza que todos los budgets existan.
- **`existingInvoices` con hash duplicado del propio invoice.** Si el caller incluye el invoice actual en `existingInvoices`, el motor dispara ERR_DUPLICATE_INVOICE. Mitigación: el caller (T9) debe excluir el invoice actual de la lista. Documentado en el spec.