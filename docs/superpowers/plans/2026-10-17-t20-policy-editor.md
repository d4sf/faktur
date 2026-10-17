# T20 · Editor de reglas con simulación en vivo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir `Reglas.tsx` en un editor interactivo con sliders para parámetros globales, tabla editable de budgets por categoría, simulación previa (before/after) y botones "Simular", "Aplicar" y "Volver a la versión base".

**Architecture:** React 19 + Vite + Tailwind v4 + Shadcn/ui. El editor se compone de: `PolicySliders` (4 sliders), `CategoryBudgetTable` (6 inputs), `SimulationResults` (reutiliza `AuditTable` con columnas "Antes"/"Después"), y `PolicyEditor` (contenedor que gestiona estado). El hook `usePolicy` carga la política activa + facturas al montar. La tabla de reglas de solo lectura se mantiene arriba del editor.

**Tech Stack:** React 19, Vite 7, Tailwind v4, Shadcn/ui (Slider, Input, Button, Card, Table), `react-router-dom`, `node:test` (web tiene tests ahora, pero T20 no añade tests nuevos).

**Spec:** `docs/superpowers/specs/2026-10-17-t20-policy-editor-design.md` — el plan implementa ese spec; los dos viajan juntos.

## Global Constraints

- Todo corre dentro del contenedor. `just` no está instalado en el host: usar `bash ./scripts/compose.sh <args>`. El cwd de `compose exec` es `/app`.
- El web tiene tests ahora (node:test + tsx, sin DOM). La verificación de T20 es `npm run typecheck -w web` + `npm run lint` + `npm run build -w web`.
- Imports relativos llevan extensión `.js` por consistencia.
- Prettier: 100 columnas, comillas dobles, semicolons.
- Commits: Conventional Commits, mensajes en inglés, un commit = un cambio lógico.
- `node_modules` es un volumen nombrado en dev: al cambiar `package.json`, correr `just install`.
- El `Containerfile` de producción construye el web con `npm run build`; cualquier cambio que rompa el build rompe también la imagen de prod.
- Shadcn `Slider` requiere `@radix-ui/react-slider`. Se añade como dependencia.

## Review Focus

Cinco formas de falla que el spec implica y que ningún test toca.

1. **Un slider que no se actualiza.** Si el estado del editor no se sincroniza con los sliders, el usuario mueve el slider pero el valor no cambia. Mitigación: estado controlado con `value` y `onValueChange`.
2. **La simulación que no se invalida.** Si el usuario cambia un parámetro después de simular y el resultado no se borra, el usuario ve un resultado desactualizado. Mitigación: `useEffect` que resetea `simulation` cuando cambian los parámetros editados.
3. **El botón "Aplicar" que se habilita sin simular.** Si el usuario aplica sin ver el impacto, puede cambiar la política sin saber qué facturas se afectan. Mitigación: `disabled={!hasSimulated}`.
4. **La tabla de simulación que no se actualiza.** Si `AuditTable` no recibe los `affected` correctamente, las columnas "Antes"/"Después" no se muestran. Mitigación: pasar `affected` como prop y renderizar condicionalmente.
5. **El build que rompe por una dependencia nueva.** Si `@radix-ui/react-slider` no está en `package-lock.json`, el build de prod falla. Mitigación: correr `npm run build` localmente y `COMPOSE_ENV=prod bash ./scripts/compose.sh build`.

---

### Task 1: Dependencias + tipos + hook

**Files:**
- Modify: `web/package.json`
- Create: `web/src/types/policy.ts`
- Create: `web/src/hooks/usePolicy.ts`

**Interfaces:**
- Consumes: nada de tareas anteriores (el web es independiente del api en compilación).
- Produces:
  ```ts
  // web/src/types/policy.ts
  export interface PolicySpec { version, auto_approval_threshold_usd, monthly_budget_usd, vendor_drift_factor, min_extraction_confidence, allowed_currencies, category_budgets, created_at, created_by, comment }
  export interface AffectedInvoice { invoice_id, before, after, reason_code }
  export interface CandidatePolicy { auto_approval_threshold_usd, monthly_budget_usd, vendor_drift_factor, min_extraction_confidence, allowed_currencies, category_budgets, created_at, created_by, comment }

  // web/src/hooks/usePolicy.ts
  export function usePolicy(): { policy, records, loading, error, refresh }
  ```

- [ ] **Step 1: Añadir `@radix-ui/react-slider` a `web/package.json`**

Añadir a `dependencies`: `"@radix-ui/react-slider": "^1.2.0"`.

- [ ] **Step 2: Instalar dependencias**

Run: `bash ./scripts/compose.sh exec app sh -c "cd /app/web && npm install"`

Expected: `node_modules` actualizado sin errores.

- [ ] **Step 3: Crear `web/src/types/policy.ts`**

Tipos del frontend: `PolicySpec`, `AffectedInvoice`, `CandidatePolicy`. Ver spec §7.

- [ ] **Step 4: Crear `web/src/hooks/usePolicy.ts`**

Hook que carga `GET /api/policy` y `GET /api/audit-trail` al montar. Devuelve `{ policy, records, loading, error, refresh }`.

- [ ] **Step 5: Verificar typecheck**

Run: `bash ./scripts/compose.sh exec app npm run typecheck -w web`

Expected: sin errores.

- [ ] **Step 6: Commitear**

```bash
git add web/package.json web/src/types/policy.ts web/src/hooks/usePolicy.ts
git commit -m "feat(web): add policy types and usePolicy hook"
```

---

### Task 2: Componentes del editor (PolicySliders, CategoryBudgetTable, SimulationResults)

**Files:**
- Create: `web/src/components/reglas/PolicySliders.tsx`
- Create: `web/src/components/reglas/CategoryBudgetTable.tsx`
- Create: `web/src/components/reglas/SimulationResults.tsx`

**Interfaces:**
- Consumes: `PolicySpec`, `AffectedInvoice`, `AuditRecordView` de `@/types/*`. `AuditTable` de `@/components/audit/AuditTable`. `Slider`, `Input`, `Card` de Shadcn. `cn` de `@/lib/utils`.
- Produces: `PolicySliders`, `CategoryBudgetTable`, `SimulationResults`.

- [ ] **Step 1: Crear `PolicySliders.tsx`**

4 sliders de Shadcn con labels, valores formateados y descripciones. Props: `threshold`, `onThresholdChange`, `monthlyBudget`, `onMonthlyBudgetChange`, `driftFactor`, `onDriftFactorChange`, `minConfidence`, `onMinConfidenceChange`, `disabled`.

- [ ] **Step 2: Crear `CategoryBudgetTable.tsx`**

Tabla con 2 columnas (Categoría, Presupuesto) y 6 filas con inputs numéricos. Props: `budgets`, `onChange`, `disabled`.

- [ ] **Step 3: Crear `SimulationResults.tsx`**

Reutiliza `AuditTable` con columnas "Antes" y "Después" condicionales. Props: `records`, `affected`, `stale`. Si `stale`, muestra mensaje de invalidación. Si no hay afectadas, muestra "Ninguna factura se vería afectada".

- [ ] **Step 4: Verificar typecheck**

Run: `bash ./scripts/compose.sh exec app npm run typecheck -w web`

Expected: sin errores.

- [ ] **Step 5: Commitear**

```bash
git add web/src/components/reglas
git commit -m "feat(web): add policy sliders, category budget table and simulation results"
```

---

### Task 3: PolicyEditor + refactor de Reglas.tsx

**Files:**
- Create: `web/src/components/reglas/PolicyEditor.tsx`
- Modify: `web/src/pages/Reglas.tsx`

**Interfaces:**
- Consumes: `PolicySliders`, `CategoryBudgetTable`, `SimulationResults` de Task 2. `usePolicy` de Task 1. `PolicySpec`, `CandidatePolicy`, `AffectedInvoice` de `@/types/policy`. `AuditRecordView` de `@/types/audit`.
- Produces: `PolicyEditor` (contenedor con toda la lógica del editor).

- [ ] **Step 1: Crear `PolicyEditor.tsx`**

Contenedor que:
- Recibe `policy` y `records` como props.
- Mantiene estado editado (`editedPolicy`) inicializado con los valores de `policy`.
- `hasSimulated` (boolean) y `simulation` (AffectedInvoice[] | null) y `stale` (boolean).
- `handleSimulate`: llama a `POST /api/policy/preview` con los valores editados. Si cambian los parámetros después, `stale = true` y se borra `simulation`.
- `handleApply`: llama a `PUT /api/policy` con los valores editados. Al éxito: actualiza `policy` con la nueva versión, resetea sliders, limpia simulación, actualiza badge.
- `handleReset`: resetea todos los valores (sliders + comment) a los de `policy`.
- Renderiza: PolicySliders, CategoryBudgetTable, input de comment, botones "Simular", "Aplicar" (disabled si !hasSimulated), "Volver a la versión base", SimulationResults (si hay simulación o stale).

- [ ] **Step 2: Refactorizar `Reglas.tsx`**

Mantener la tabla de reglas de solo lectura (8 reglas) y los 4 KPIs de parámetros. Añadir `<PolicyEditor>` debajo de la tabla de reglas, envuelto en un contenedor que carga la política activa con `usePolicy()`. Manejar estados de carga (skeleton) y error.

- [ ] **Step 3: Verificar typecheck y build**

Run: `bash ./scripts/compose.sh exec app npm run typecheck -w web && bash ./scripts/compose.sh exec app npm run build -w web`

Expected: sin errores de typecheck, build exitoso.

- [ ] **Step 4: Verificar lint y fmt**

Run: `bash ./scripts/compose.sh exec app npm run lint && bash ./scripts/compose.sh exec app npx prettier --check web/src`

Expected: limpio. Si prettier falla, correr `npx prettier --write web/src`.

- [ ] **Step 5: Commitear**

```bash
git add web/src/components/reglas web/src/hooks/usePolicy.ts web/src/types/policy.ts web/src/pages/Reglas.tsx
git commit -m "feat(web): add policy editor with live threshold simulation"
```

---

### Task 4: Verificación final

- [ ] **Step 1: Verificar que `just check` pasa**

Run: `bash ./scripts/compose.sh exec app npm run typecheck && bash ./scripts/compose.sh exec app npm run lint && bash ./scripts/compose.sh exec app npm test`

Expected: typecheck limpio, lint limpio, tests pasando (count = 212 + nuevos si hay).

- [ ] **Step 2: Verificar que el build de producción sigue pasando**

Run: `COMPOSE_ENV=prod bash ./scripts/compose.sh build`

Expected: imagen construida sin errores.

- [ ] **Step 3: Verificación visual (manual)**

Levantar dev (`bash ./scripts/compose.sh up -d`), abrir `http://localhost:5173/reglas`, verificar:
- Tabla de 8 reglas con salida canónica y condición de disparo.
- 4 KPIs de parámetros (umbral, presupuesto, drift, confianza).
- 6 budgets por categoría en tabla editable.
- Sliders funcionan y muestran valores formateados.
- Botón "Simular" deshabilitado hasta que se cambie un parámetro.
- Al simular: muestra facturas con before/after.
- Al cambiar un parámetro después de simular: simulación se invalida.
- Botón "Aplicar" deshabilitado hasta simular.
- Al aplicar: badge "v2 activa" y sliders reseteados.
- Botón "Volver a la versión base" resetea todo.
- Input de comment editable con default.

- [ ] **Step 4: Commitear cualquier ajuste**

```bash
git add -A
git commit -m "feat(web): finalize policy editor with simulation"  # si hay cambios pendientes
```

---

## Self-Review

1. **Spec coverage:** el spec tiene 12 secciones. Task 1 cubre §§6, 7 (tipos + hook + deps). Task 2 cubre §§8.1-8.3 (componentes). Task 3 cubre §§8.4-8.5 (PolicyEditor + Reglas). Task 4 cubre §9 (criterio de aceptación). Cubierto.

2. **Step scan:** cada paso tiene comando y expected. Sin "TBD".

3. **Type consistency:** `PolicySpec`, `AffectedInvoice`, `CandidatePolicy` usados consistentemente. `AuditRecordView` importado de `@/types/audit`. `PolicySliders`, `CategoryBudgetTable`, `SimulationResults` usados en `PolicyEditor`.

4. **Review Focus:** los cinco puntos tienen su verificación en las Tasks 1, 2 y 3.

5. **Proportion:** el plan es razonable para 6 archivos nuevos + 1 modificado. No incluye código de implementación (solo firmas y estructura).

## Execution Handoff

Plan completo y guardado en `docs/superpowers/plans/2026-10-17-t20-policy-editor.md`. Revisalo. ¿Captura lo que quieres?

La ejecución será con el método que ya elegiste (**Native**): yo implemento cada paso en esta sesión y un revisor final revisa toda la rama. ¿Procedo con la implementación?