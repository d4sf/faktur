# T19 · Tabla de decisiones, detalle de factura y card de ROI — Design

**Fecha:** 2026-10-17
**Estado:** aprobado, pendiente de plan e implementación
**Backlog:** `docs/backlog_implementacion_mvp.md` §T19
**Depende de:** T13 (mergeado), T25 (mergeado), T26 (mergeado)

## 1. Intent y por qué

El Tablero actual tiene una tabla de auditoría inline con 4 facturas hardcoded, un modal de detalle (Dialog) y 4 cards de KPI con datos estáticos. T19 extrae eso en componentes reutilizables conectados a la API real (`GET /api/audit-trail`), de modo que el jurado vea las facturas reales con estado, motivo y regla, y el motivo se entienda sin contexto previo. La explicabilidad es la mitad del puntaje de la rúbrica Blinka.

## 2. Goals

- **Tabla de decisiones reutilizable** (`AuditTable`) con columnas: Folio, Proveedor, Fecha, Monto USD, Veredicto (badge), Motivo (reason_code + texto), Acción (botón "Revisar" solo si ESCALAR, "Ver detalle" para el resto).
- **Orden LIFO** (más reciente primero), provisto por el backend.
- **Inspector lateral** (`InvoiceInspector`) como `Sheet` (drawer) con fetch on demand a `GET /api/invoices/:id` para la línea de tiempo.
- **Card Health & ROI** (`RoiCard`) con touchless rate, presupuesto restante y total procesadas, conectada a las métricas del API.
- **Conexión a `/api/audit-trail`** para datos reales (reemplaza los datos hardcoded).
- **Badges con ícono + texto**, nunca solo color (accesibilidad).
- **Estados vacío, carga y error** manejados en la tabla.
- **`just check` y `just fmt` limpios.**
- **`DESIGN.md`** creado en la raíz, basado en los estilos y componentes ya implementados.

## 3. Non-goals (explícito)

- **No se implementa el chat de auditoría** (RF-6.5 "Ask Auditor"). Eso es posterior.
- **No se implementa el simulador de política** (RF-6.2). Eso es T20.
- **No se implementa la bandeja HITL.** Eso es T21.
- **No se añaden tests al web.** El web no tiene tests hoy.
- **No se modifica el backend.** T19 solo consume endpoints existentes.

## 4. Constraints

- **Stack fijo** (ADR 0001): React 19 + Vite + Tailwind v4 + Shadcn/ui.
- **Diseño existente:** paleta slate/zinc, badges sólidos (emerald/rose/amber), dark theme con toggle, responsive 1→4 columnas. Ver `DESIGN.md`.
- **API existente:** `GET /api/audit-trail` retorna `{ metrics: { budget_remaining, threshold_limit, total_processed, touchless_rate }, records: AuditRecordView[] }`. `GET /api/invoices/:id` retorna `{ record, timeline, resolution }`.
- **Tipos existentes:** `AuditRecordView` (backend) tiene `id`, `invoice` (anidado), `document_hash`, `amount_usd`, `verdict`, `reason_code`, `explanation`, `created_at`, `human_approved`, `estado`.
- **Componentes existentes:** `VerdictBadge`, `Card`, `Dialog`, `Button`, `Sheet`, `Badge` (Shadcn). Se reutilizan, no se duplican.
- **Prettier:** 100 columnas, comillas dobles, semicolons.

## 5. Decisiones tomadas en esta sesión

| Decisión | Elegido | Por qué |
|:---|:---|:---|
| Inspector de factura | `Sheet` (drawer lateral) | Más espacio para la línea de tiempo; no bloquea la tabla. En mobile, Sheet se comporta como modal. |
| Card de ROI | 3 cards en el Bento Grid (touchless rate, presupuesto restante, total procesadas) | Consistente con el layout Bento existente. |
| Fuente de datos | `GET /api/audit-trail` con carga manual + botón "Refrescar" | Tiempo real opcional; carga manual es más simple y suficiente para demo. |
| Tabla de decisiones | Extraer de `Tablero.tsx` a `AuditTable.tsx` | Reutilizable en otras pantallas (bandeja, reporte). |
| Badge de estado | `VerdictBadge` existente (muestra `verdict`) + `estado` como texto secundario | Consistente con el resto de la UI. |
| Línea de tiempo | Lista vertical con ícono por tipo, `detail` completo | Más espacio para texto largo; el motivo legible es lo que la rúbrica premia. |
| Fetch on demand | El inspector llama a `GET /api/invoices/:id` al abrir | Mantiene el audit-trail ligero. |
| Estados vacío/carga/error | Skeleton rows (carga), "Sin registros" con link a `/subir` (vacío), error con botón "Reintentar" | Cubre los tres estados sin sorpresas. |
| Botón en tabla | "Ver detalle" para todos, "Revisar" (amber) solo para ESCALADA | El usuario puede inspeccionar cualquier factura; la acción de revisar solo donde tiene sentido. |
| Resolución humana | Mostrar quién, cuándo y comentario completo (o "Pendiente de aprobación") | Información de auditoría que el jurado quiere ver. |
| RoiCard formato | `AuditFeed` formatea valores y pasa strings a `RoiCard` | `RoiCard` es genérico, no sabe qué KPI muestra. |
| Inspector read-only | Solo mostrar datos, no editar | La resolución (aprobar/rechazar) es T21. |
| Paginación | No (carga todos, limit 200) | 12 facturas en demo; suficiente. |

## 6. Estructura de archivos

| Archivo | Acción | Responsabilidad |
|:---|:---|:---|
| `web/src/components/audit/AuditTable.tsx` | Crear | Tabla de auditoría reutilizable |
| `web/src/components/audit/InvoiceInspector.tsx` | Crear | Inspector lateral (Sheet) con línea de tiempo |
| `web/src/components/audit/RoiCard.tsx` | Crear | Card individual de KPI |
| `web/src/components/audit/AuditFeed.tsx` | Crear | Contenedor que carga datos de `/api/audit-trail` |
| `web/src/types/audit.ts` | Crear | Tipos del frontend para `AuditRecordView`, `AuditMetrics`, `AuditTrail`, `TimelineEvent` |
| `web/src/pages/Tablero.tsx` | Modificar | Reemplazar tabla inline y KPIs hardcoded por `AuditFeed` + `RoiCard` |
| `DESIGN.md` (raíz) | Crear | Política de estilos y UX (analizada de componentes existentes) |

## 7. Componentes

### 7.1 `AuditTable`

```tsx
interface AuditTableProps {
  records: AuditRecordView[];
  onSelectRecord: (record: AuditRecordView) => void;
  loading?: boolean;
}
```

- Tabla HTML con `<thead>` y `<tbody>`.
- Columnas: Folio, Proveedor, Fecha, Monto USD, Veredicto (VerdictBadge), Motivo (reason_code + texto truncado), Acción.
- Acción: botón "Ver detalle" (ghost) para todos; botón "Revisar" (outline, amber) solo si `estado === "ESCALADA"`.
- Orden LIFO: el array viene ordenado del backend.
- Click en fila abre el inspector.
- Responsive: en mobile, ocultar Fecha y Monto USD; mostrar Folio + Veredicto + Acción.
- Loading: skeleton rows (Shadcn `Skeleton`).
- Empty: mensaje "Sin registros" con link a `/subir`.
- Error: mensaje de error con botón "Reintentar".

### 7.2 `InvoiceInspector`

```tsx
interface InvoiceInspectorProps {
  record: AuditRecordView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

- `Sheet` (drawer lateral) con ancho `sm:max-w-lg`.
- Header: folio + `VerdictBadge`.
- Sección de datos: proveedor, tax_id, monto original, monto USD, moneda, fechas (issue, due).
- Sección de decisión: reason_code (monospace), explanation, policy_version, decided_by, decided_at.
- Línea de tiempo vertical: INGESTA → EXTRACCIÓN → DECISIÓN → RESOLUCIÓN (si hay approval).
- Resolución: quién, cuándo, comentario (o "Pendiente de aprobación").
- Footer: botón "Cerrar".
- Fetch on demand: al abrir, llama a `GET /api/invoices/:id` para obtener timeline.

### 7.3 `RoiCard`

```tsx
interface RoiCardProps {
  title: string;
  value: string;
  subtitle: string;
}
```

- Card de Shadcn con título (uppercase, tracking-wide, text-xs, muted), valor (text-2xl/3xl, bold), subtítulo (text-xs, muted).
- `value` es string (formateado por `AuditFeed`).

### 7.4 `AuditFeed`

```tsx
// Contenedor que carga datos y renderiza
```

- Usa `useEffect` + `fetch("/api/audit-trail")` para cargar datos.
- Estado: `loading`, `error`, `data`.
- Formatea métricas y pasa strings a `RoiCard`.
- Renderiza `RoiCard` × 3 + `AuditTable` + `InvoiceInspector`.
- Botón "Refrescar" para recargar manualmente.

## 8. Tipos del frontend (`web/src/types/audit.ts`)

```ts
export type Verdict = "PAGAR" | "FRENAR" | "ESCALAR";

export type AuditEstado = "PAGADA" | "FRENADA" | "ESCALADA" | "PENDIENTE";

export interface AuditInvoice {
  invoice_number: string;
  vendor_name?: string;
  vendor_tax_id?: string;
  issue_date?: string;
  due_date?: string;
  currency: string;
  total_amount: number;
  total_usd: number;
}

export interface AuditRecordView {
  id: string;
  invoice: AuditInvoice;
  document_hash: string;
  amount_usd: number;
  verdict: Verdict;
  reason_code: string;
  explanation: string;
  created_at: string;
  human_approved: boolean | null;
  estado: AuditEstado;
}

export interface AuditMetrics {
  budget_remaining: number;
  threshold_limit: number;
  total_processed: number;
  touchless_rate: number;
}

export interface AuditTrail {
  metrics: AuditMetrics;
  records: AuditRecordView[];
}

export interface TimelineEvent {
  type: "INGESTA" | "EXTRACCION" | "DECISION" | "RESOLUCION";
  at: string;
  detail: string;
}

export interface AuditDetail {
  record: AuditRecordView;
  timeline: TimelineEvent[];
  resolution: {
    resolved_by: string;
    resolved_at: string;
    comment: string | null;
  } | null;
}
```

## 9. Card de ROI — métricas

| Card | Valor | Subtítulo | Fuente |
|:---|:---|:---|:---|
| Touchless Rate | `{touchless_rate}%` | "Facturas aprobadas sin intervención manual" | `metrics.touchless_rate` |
| Presupuesto Restante | `${budget_remaining}` | "Balance mensual disponible en USD" | `metrics.budget_remaining` |
| Total Procesadas | `{total_processed}` | "Facturas evaluadas en el ciclo actual" | `metrics.total_processed` |

## 10. Criterio de aceptación (del backlog)

- Las facturas del set se ven con estado, motivo y regla.
- El motivo se entiende sin contexto previo (explanation en español con números concretos).
- El inspector lateral responde con datos del registro y no inventa.
- `just check` y `just fmt` limpios.

## 11. Lo que queda al builder

- Decidir si el inspector es un `Sheet` (drawer) o un `Dialog` (modal). Recomendación: `Sheet`.
- Decidir si la tabla usa `<table>` nativo (ya está en `Tablero.tsx`) o un componente de Shadcn.
- Decidir el formato de la línea de tiempo (vertical con iconos, o lista simple).
- Decidir si se añade polling (cada 5s) o carga manual. Recomendación: carga manual con botón "Refrescar".
- Decidir si el inspector muestra el `extraction_json` crudo o solo los campos relevantes. Recomendación: solo campos relevantes.

## 12. Fuera de scope (explícito)

- Chat de auditoría "Ask Auditor" (RF-6.5) — posterior.
- Simulador de política en caliente (RF-6.2) — T20.
- Bandeja HITL (T21).
- Tests del web (no existen hoy).
- Modificación del backend.

## 13. Riesgos

- **Los datos hardcoded en `Tablero.tsx` no coinciden con los fixtures de T4.** Los nombres de proveedor en `RECENT_INVOICES` (Amazon Web Services, Vertex Analytics, etc.) no son los del seed de T3. Al conectar a la API real, la tabla mostrará los datos reales. Esto es esperado y correcto.
- **El inspector debe ser read-only.** No debe permitir editar la decisión. Solo mostrar datos. La resolución es T21.
- **`AuditRecordView` del backend vs. tipo del frontend.** Si el backend cambia un campo, el frontend se rompe. Mitigación: tipos estrictos en `web/src/types/audit.ts`.
- **La API puede no tener datos.** Si la base está vacía, la tabla muestra "Sin registros". El componente debe manejar el estado vacío.
- **Fetch on demand añade latencia.** Al abrir el inspector, se hace un `fetch` a `/api/invoices/:id`. Si la red es lenta, el inspector muestra un spinner. Mitigación: skeleton en el inspector mientras carga.

## 14. DESIGN.md

Se crea `DESIGN.md` en la raíz del proyecto, analizando los componentes y estilos ya implementados. El contenido completo está en el archivo `DESIGN.md` (creado en paralelo con este spec). Cubre: paleta de colores, tipografía, espaciado, componentes, dark/light theme, accesibilidad, responsive, patrones de layout, animaciones y iconos.<|end|>