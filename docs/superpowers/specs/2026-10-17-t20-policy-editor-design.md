# T20 · Editor de reglas con simulación en vivo — Design

**Fecha:** 2026-10-17
**Estado:** aprobado, pendiente de plan e implementación
**Backlog:** `docs/backlog_implementacion_mvp.md` §T20
**Depende de:** T14 (mergeado), T26 (mergeado)

## 1. Intent y por qué

El `Reglas.tsx` actual muestra las 8 reglas y los 6 budgets como datos estáticos (hardcoded). T20 lo convierte en un editor interactivo: sliders para umbral, presupuesto mensual, drift y confianza mínima; tabla editable para budgets por categoría; simulación previa contra `POST /api/policy/preview` que muestra las facturas afectadas (before/after) sin escribir nada; botón "Aplicar" que crea una nueva versión; botón "Volver a la versión base" que resetea la UI. Es el diferenciador de demo del Policy Controller.

## 2. Goals

- **Tabla de reglas de solo lectura** (las 8 reglas con salida canónica y condición de disparo) en la parte superior.
- **Parámetros globales editables** con sliders: umbral autónomo ($0–$5.000, step $100), presupuesto mensual ($0–$10.000, step $500), tolerancia de desvío (1.0x–3.0x, step 0.1, mostrado como +X%), confianza mínima (0.0–1.0, step 0.05, mostrado como %).
- **Budgets por categoría** como tabla editable con inputs numéricos (6 categorías).
- **Input de texto libre** para `comment` (valor por defecto "Ajuste manual de parámetros").
- **Botón "Simular"** que llama a `POST /api/policy/preview` y muestra las facturas afectadas (veredicto actual → hipotético) en una tabla reutilizando `AuditTable`.
- **Botón "Aplicar"** (deshabilitado hasta simular) que llama a `PUT /api/policy`, crea una nueva versión, muestra badge "vN activa" y resetea los sliders.
- **Botón "Volver a la versión base"** que resetea todos los valores (sliders + comment) a los de la política activa.
- **Simulación invalidada** automáticamente cuando un parámetro cambia después de simular (se borra el resultado + mensaje "Los parámetros cambiaron, presiona Simular de nuevo").
- **Carga manual** de facturas al montar (GET /api/audit-trail), con skeleton para controles y tabla de simulación.
- **Error de carga** solo en la sección de parámetros/simulación (la tabla de reglas es estática y siempre se muestra).
- **`just check` y `just fmt` limpios.**

## 3. Non-goals (explícito)

- **No se modifica el backend.** T20 solo consume `GET /api/policy`, `PUT /api/policy`, `POST /api/policy/preview`.
- **No se implementa el chat de auditoría** (RF-6.5). Posterior.
- **No se añaden tests al web.** El web no tiene tests hoy (aunque T19 añadió tests de AuditTable).
- **No se implementa tiempo real.** La simulación es manual (botón "Simular").
- **No se implementa paginación.** Se cargan todas las facturas.

## 4. Constraints

- **Stack fijo** (ADR 0001): React 19 + Vite + Tailwind v4 + Shadcn/ui.
- **Diseño existente:** paleta slate/zinc, badges sólidos, dark theme con toggle, responsive 1→4 columnas. Ver `DESIGN.md`.
- **API existente:**
  - `GET /api/policy` → `PolicySpec` (umbral, presupuesto, drift, confianza, monedas, budgets por categoría).
  - `PUT /api/policy` → body = `CandidatePolicySchema` (PolicySpec sin version). Retorna `{ ...policy, version }` con código 201.
  - `POST /api/policy/preview` → body = `CandidatePolicySchema`. Retorna `{ affected: AffectedInvoice[] }` donde `AffectedInvoice = { invoice_id, before, after, reason_code }`.
- **Tipos existentes:** `PolicySpec` (T2), `CandidatePolicySchema` (T4 backend, no disponible en frontend — se define localmente o se infiere).
- **Componentes existentes:** `AuditTable` (T19), `RoiCard`, `Card`, `Button`, `Input`, `Slider` (Shadcn), `Badge`, `VerdictBadge`.
- **Prettier:** 100 columnas, comillas dobles, semicolons.

## 5. Decisiones tomadas en esta sesión

| Decisión | Elegido | Por qué |
|:---|:---|:---|
| Simulación | Manual (botón "Simular") | Menos código, más predecible, flujo narrativo claro para demo |
| Flujo de "Aplicar" | Resetear sliders a valores de nueva versión, limpiar simulación, badge "vN activa" | Deja claro que la política cambió |
| "Volver a la versión base" | Resetear todo (sliders + comment) a valores de política activa | "Deshacer todos los cambios" |
| Controles globales | 3 sliders (umbral, presupuesto, drift) + 1 slider (confianza) | Visual e impresionante para demo |
| Budgets por categoría | Tabla editable con inputs numéricos | Compacto; 6 sliders serían densos |
| Simulación muestra | Todas las facturas con veredicto actual + hipotético (before → after) | Más contexto que solo las afectadas |
| Sliders de umbral | 0–$5.000, step $100, mostrado como $1,000.00 | Consistente con backlog |
| Sliders de presupuesto | 0–$10.000, step $500, mostrado como $5,000.00 | Consistente con backlog |
| Sliders de drift | 1.0–3.0, step 0.1, mostrado como +40% | Consistente con backlog ("Máximo +40%") |
| Sliders de confianza | 0.0–1.0, step 0.05, mostrado como 70% | Consistente con backlog ("Confianza mínima IA: 70%") |
| Validación de budgets | Al presionar "Simular" o "Aplicar" (no en tiempo real) | Menos estado, menos confusión |
| `comment` | Input de texto libre, default "Ajuste manual de parámetros" | Flexible, auditable |
| Confirmación de "Aplicar" | Sin confirmación (acción explícita) | Flujo más rápido para demo |
| "Aplicar" habilitado | Solo después de simular al menos una vez | Fuerza a ver el impacto antes de aplicar |
| Simulación invalidada | Borrar silenciosamente + mensaje "Los parámetros cambiaron..." | Simple, evita confusión |
| Estado de carga | Tabla de reglas (estática) inmediata; skeleton para controles y tabla de simulación | Más responsive |
| Error de carga | Tabla de reglas siempre visible; error solo en sección de parámetros | La tabla de reglas no depende de la API |
| Estado "aplicado" | Badge "vN activa" + reset sliders a valores de vN | Mantiene al usuario en el editor |
| Reutilización de tabla | `AuditTable` con columnas "Antes"/"Después" condicionales | Evita duplicar código |
| Carga de facturas | Al montar la página (junto con la política activa) | Más rápido al simular |
| `AuditTable` columnas extra | "Antes" y "Después" solo en modo simulación | Condicionales, no cambia la tabla normal |

## 6. Estructura de archivos

| Archivo | Acción | Responsabilidad |
|:---|:---|:---|
| `web/src/components/reglas/PolicyEditor.tsx` | Crear | Contenedor del editor (sliders + tabla de budgets + botones) |
| `web/src/components/reglas/PolicySliders.tsx` | Crear | 4 sliders (umbral, presupuesto, drift, confianza) |
| `web/src/components/reglas/CategoryBudgetTable.tsx` | Crear | Tabla editable de budgets por categoría |
| `web/src/components/reglas/SimulationResults.tsx` | Crear | Tabla de facturas con before/after (reutiliza AuditTable) |
| `web/src/hooks/usePolicy.ts` | Crear | Hook que carga política activa + facturas, gestiona estado del editor |
| `web/src/types/policy.ts` | Crear | Tipos del frontend para PolicySpec, AffectedInvoice, CandidatePolicy |
| `web/src/pages/Reglas.tsx` | Modificar | Añadir editor interactivo debajo de la tabla de reglas |

## 7. Tipos del frontend (`web/src/types/policy.ts`)

```ts
export interface PolicySpec {
  version: string;
  auto_approval_threshold_usd: number;
  monthly_budget_usd: number;
  vendor_drift_factor: number;
  min_extraction_confidence: number;
  allowed_currencies: string[];
  category_budgets: Record<string, number>;
  created_at: string;
  created_by: string;
  comment: string;
}

export interface AffectedInvoice {
  invoice_id: string;
  before: "PAGAR" | "FRENAR" | "ESCALAR";
  after: "PAGAR" | "FRENAR" | "ESCALAR";
  reason_code: string;
}

export interface CandidatePolicy {
  auto_approval_threshold_usd: number;
  monthly_budget_usd: number;
  vendor_drift_factor: number;
  min_extraction_confidence: number;
  allowed_currencies: string[];
  category_budgets: Record<string, number>;
  created_at: string;
  created_by: string;
  comment: string;
}
```

## 8. Componentes

### 8.1 `PolicySliders`

```tsx
interface PolicySlidersProps {
  threshold: number;
  onThresholdChange: (v: number) => void;
  monthlyBudget: number;
  onMonthlyBudgetChange: (v: number) => void;
  driftFactor: number;
  onDriftFactorChange: (v: number) => void;
  minConfidence: number;
  onMinConfidenceChange: (v: number) => void;
  disabled?: boolean;
}
```

- 4 sliders de Shadcn (`Slider`).
- Umbral: 0–5000, step 100, mostrado como `$1,000.00`.
- Presupuesto: 0–10000, step 500, mostrado como `$5,000.00`.
- Drift: 1.0–3.0, step 0.1, mostrado como `+40%`.
- Confianza: 0.0–1.0, step 0.05, mostrado como `70%`.
- Cada slider muestra label, valor actual y descripción.

### 8.2 `CategoryBudgetTable`

```tsx
interface CategoryBudgetTableProps {
  budgets: Record<string, number>;
  onChange: (category: string, value: number) => void;
  disabled?: boolean;
}
```

- Tabla con 2 columnas: Categoría, Presupuesto (input numérico).
- 6 filas (Infraestructura, Diseño, Marketing, Legal, Software, Retail).
- Input con `type="number"`, `min="0"`, step "1".
- Validación al presionar "Simular" o "Aplicar".

### 8.3 `SimulationResults`

```tsx
interface SimulationResultsProps {
  records: AuditRecordView[];
  affected: AffectedInvoice[];
  stale: boolean;
}
```

- Reutiliza `AuditTable` con columnas adicionales "Antes" y "Después" (solo si `affected.length > 0`).
- Las facturas afectadas se resaltan (badge amber "→ ESCALAR").
- Si `stale === true`, muestra mensaje "Los parámetros cambiaron, presiona Simular de nuevo".
- Si no hay afectadas, muestra "Ninguna factura se vería afectada con estos parámetros".

### 8.4 `PolicyEditor`

```tsx
interface PolicyEditorProps {
  policy: PolicySpec;
  records: AuditRecordView[];
  onApply: (policy: CandidatePolicy) => Promise<void>;
}
```

- Contenedor que gestiona el estado del editor (valores editados vs. originales).
- Incluye: PolicySliders, CategoryBudgetTable, input de comment, botones "Simular", "Aplicar" (deshabilitado hasta simular), "Volver a la versión base".
- Badge con versión activa (ej. "v1").
- Lógica de invalidación: si un slider/input cambia después de simular, `stale = true` y se borra el resultado.
- Al aplicar: llama `onApply`, resetea sliders a valores de la nueva versión, limpia simulación, actualiza badge.

### 8.5 `usePolicy` hook

```ts
function usePolicy(): {
  policy: PolicySpec | null;
  records: AuditRecordView[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}
```

- Carga `GET /api/policy` y `GET /api/audit-trail` al montar.
- Devuelve política activa, facturas y estado de carga.
- `refresh()` recarga ambos.

## 9. Criterio de aceptación (del backlog)

- Bajar el umbral de $1.000 a $300 muestra las facturas afectadas antes de aplicar.
- Aplicar genera una versión nueva (v2).
- La simulación no escribe nada (no crea decisiones ni modifica facturas).
- `just check` y `just fmt` limpios.

## 10. Lo que queda al builder

- Decidir el layout exacto del editor (sliders arriba, tabla de budgets debajo, simulación al final).
- Decidir si el input de comment es un `Input` de Shadcn o un `Textarea`.
- Decidir el estilo del badge "vN activa" (color, tamaño).
- Decidir si los sliders usan el componente `Slider` de Shadcn o un input range nativo. Recomendación: Shadcn `Slider`.
- Verificar que `npm run build` sigue pasando después de añadir los nuevos componentes.

## 11. Fuera de scope (explícito)

- Simulador en caliente (RF-6.2 "recálculo visual inmediato") — T20 es manual, no en tiempo real.
- Bandeja HITL (T21).
- Tests del web (no existen hoy, aunque T19 añadió tests de AuditTable).
- Modificación del backend.

## 12. Riesgos

- **El preview endpoint devuelve solo las afectadas.** La UI debe cruzar los `invoice_id` de las afectadas con los registros del audit-trail para mostrar el before/after. Si un `invoice_id` no se encuentra en el audit-trail, se ignora.
- **Los sliders de Shadcn requieren `@radix-ui/react-slider`.** Verificar que esté en `package.json` (Shadcn CLI lo añade al ejecutar `npx shadcn add slider`).
- **El estado de la simulación puede desincronizarse.** Si el usuario cambia un parámetro mientras se está simulando, la simulación anterior se invalida. Mitigación: deshabilitar el botón "Simular" mientras se simula.
- **La tabla de reglas es estática.** No se actualiza al cambiar la política. Esto es correcto (las reglas no cambian, solo los parámetros).