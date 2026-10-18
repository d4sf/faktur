# DESIGN.md — Política de estilos y UX

Este documento define la política de estilos y UX del proyecto Faktur/Blinka PayAgent. Se basa en los componentes y estilos ya implementados en `web/src/` y `web/src/index.css`. Es la fuente de verdad para cualquier contribución de UI.

## 1. Paleta de colores

### Tokens CSS (Tailwind v4, variables en `:root` y `.dark`)

| Token                  | Light                              | Dark                                     | Uso                              |
| :--------------------- | :--------------------------------- | :--------------------------------------- | :------------------------------- |
| `--background`         | `oklch(1 0 0)` (blanco)            | `oklch(0.145 0 0)` (negro)               | Fondo de página                  |
| `--foreground`         | `oklch(0.145 0 0)`                 | `oklch(0.985 0 0)`                       | Texto principal                  |
| `--card`               | `oklch(1 0 0)`                     | `oklch(0.19 0 0)`                        | Fondo de cards                   |
| `--card-foreground`    | `oklch(0.145 0 0)`                 | `oklch(0.985 0 0)`                       | Texto en cards                   |
| `--primary`            | `oklch(0.48 0.23 264)` (azul)      | `oklch(0.62 0.21 260)` (azul claro)      | Botones primarios, links activos |
| `--primary-foreground` | `oklch(0.99 0 0)`                  | `oklch(0.99 0 0)`                        | Texto en botones primarios       |
| `--muted`              | `oklch(0.97 0 0)`                  | `oklch(0.24 0 0)`                        | Fondos sutiles, headers de tabla |
| `--muted-foreground`   | `oklch(0.556 0 0)`                 | `oklch(0.708 0 0)`                       | Texto secundario, labels         |
| `--border`             | `oklch(0.922 0 0)`                 | `oklch(1 0 0 / 10%)`                     | Bordes de cards, tablas, inputs  |
| `--ring`               | `oklch(0.65 0.2 264)`              | `oklch(0.62 0.21 260)`                   | Focus ring                       |
| `--destructive`        | `oklch(0.577 0.245 27.325)` (rojo) | `oklch(0.704 0.191 22.216)` (rojo claro) | Botones de rechazar, errores     |

**Colores de veredicto (badges):**

- PAGAR: `bg-emerald-600` (verde esmeralda) + texto blanco
- FRENAR: `bg-rose-600` (rojo carmín) + texto blanco
- ESCALAR: `bg-amber-500` (ámbar dorado) + texto blanco

**Colores de estado (bandeja):**

- Alerta de escalación: `text-amber-700 dark:text-amber-400` (ámbar, para reason_code en bandeja)

## 2. Tipografía

| Elemento                    | Clase Tailwind                                                      | Notas                      |
| :-------------------------- | :------------------------------------------------------------------ | :------------------------- |
| Título de página            | `text-2xl font-bold tracking-tight` (sm: `text-3xl`)                | Encabezados principales    |
| Subtítulo de página         | `text-sm text-muted-foreground`                                     | Descripción bajo el título |
| Título de card              | `text-xs font-medium uppercase tracking-wide text-muted-foreground` | Headers de KPI cards       |
| Valor de KPI                | `text-2xl font-bold tracking-tight` (sm: `text-3xl`)                | Números grandes            |
| Encabezado de tabla         | `text-[10px] font-semibold uppercase tracking-wider`                | Columnas de tabla          |
| Texto de tabla              | `text-xs`                                                           | Celdas de tabla            |
| Texto secundario            | `text-[11px] text-muted-foreground`                                 | Explicaciones, motivos     |
| Código (reason_code, folio) | `font-mono text-xs` o `font-mono text-[10px]`                       | IDs, folios, códigos       |
| Botones                     | `text-xs` o `text-sm`                                               | Según tamaño del botón     |

Fuente: sistema (`font-sans` = system-ui). No se usa fuente custom, salvo el logo, que usa `Iceland` (Google Fonts) mediante la clase `.font-logo`.

## 3. Espaciado

| Patrón                          | Clase                    | Uso                                     |
| :------------------------------ | :----------------------- | :-------------------------------------- |
| Espacio entre secciones         | `space-y-8`              | Entre bloques principales de una página |
| Espacio entre cards en grid     | `gap-4` (md: `gap-5`)    | Grid de KPIs                            |
| Espacio dentro de card          | `p-4`, `p-5`, `p-6`      | Padding de card                         |
| Espacio entre elementos en card | `space-y-4`, `space-y-2` | Contenido de card                       |
| Espacio entre columnas en tabla | `px-4 py-3`              | Celdas de tabla                         |
| Espacio entre botones           | `gap-2`                  | Grupos de botones                       |

## 4. Componentes

**Card (Shadcn):**

- Borde: `border border-border/70` o `border-border/80`
- Sombra: `shadow-xs` (hover: `shadow-md`)
- Border radius: `rounded-xl`
- Transición: `transition-all`

**Badge (VerdictBadge):**

- PAGAR: `bg-emerald-600 text-white rounded-md`
- FRENAR: `bg-rose-600 text-white rounded-md`
- ESCALAR: `bg-amber-500 text-white rounded-md`
- Tamaños: `sm` (px-2 py-0.5 text-[10px]), `md` (px-2.5 py-0.5 text-[11px]), `lg` (px-3 py-1 text-xs font-bold)
- Siempre texto en mayúsculas, `font-bold tracking-wider`

**Button (Shadcn):**

- Variantes: `default`, `outline`, `ghost`, `secondary`
- Tamaños: `sm` (h-7, text-xs), `lg` (h-11, text-sm)
- Border radius: `rounded-md` (default de Shadcn)
- Shadow: `shadow-xs` para botones primarios

**Dialog/Sheet (Shadcn):**

- Border radius: `rounded-xl`
- Sombra: `shadow-xl`
- Backdrop: overlay oscuro con blur
- Padding: `p-6`

**Input (Shadcn):**

- Border radius: `rounded-md`
- Focus ring: `ring-2 ring-ring`
- Border: `border border-input`

**Sidebar (Shadcn):**

- Fondo: `bg-sidebar` (slate-50 light, slate-900 dark)
- Item activo: `bg-sidebar-accent text-sidebar-accent-foreground`
- Border right: `border-r border-sidebar-border`

## 5. Accesibilidad

- **Badges:** siempre ícono + texto, nunca solo color. `VerdictBadge` muestra el texto del veredicto.
- **Toggle de tema:** `aria-label="Cambiar tema"`.
- **Focus visible:** `ring-2 ring-ring` en todos los elementos interactivos.
- **Contraste:** texto principal `text-foreground` sobre `bg-background`. Texto secundario `text-muted-foreground` con contraste suficiente.
- **Responsive:** tablas con `overflow-x-auto` para scroll horizontal en mobile.
- **Navegación por teclado:** Shadcn/Radix maneja focus trap en Dialog/Sheet.

## 6. Responsive

| Breakpoint | Clase Tailwind | Ancho            | Uso                                  |
| :--------- | :------------- | :--------------- | :----------------------------------- |
| Mobile     | (default)      | < 640px          | 1 columna, sidebar colapsado (Sheet) |
| Tablet     | `sm:`          | ≥ 640px          | 2 columnas en Bento Grid             |
| Desktop    | `lg:` / `md:`  | ≥ 1024px / 768px | 4 columnas, sidebar visible          |

- Bento Grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`
- Sidebar: `hidden md:flex` (oculto en mobile, Sheet con hamburger)
- Tablas: `overflow-x-auto` para scroll horizontal

## 7. Patrones de layout

**AppShell (layout principal):**

- Sidebar izquierdo (desktop) / Sheet (mobile) + main content.
- Sidebar: header (logo), content (nav links), footer (theme toggle).
- Main: `flex-1 p-4 md:p-6`.

**Bento Grid:**

- Contenedor: `grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4`
- Cards: `rounded-xl border border-border/70 shadow-xs hover:shadow-md transition-all`
- Span: `sm:col-span-2` (2 cols), `lg:col-span-4` (4 cols, full width).

**Tabla de auditoría:**

- Contenedor: `rounded-xl border border-border/80 bg-card shadow-xs`
- Header: `bg-muted/30 text-muted-foreground`, `text-[10px] font-semibold uppercase tracking-wider`
- Filas: `hover:bg-muted/30 transition-colors`, `divide-y divide-border/60`
- Celdas: `px-4 py-3`

**Modal/Inspector:**

- `DialogContent` / `SheetContent`: `rounded-xl border border-border p-6 shadow-xl`
- Ancho: `sm:max-w-xl` (Dialog), `w-64` (Sheet mobile)

**Card de KPI:**

- `CardHeader` con `pb-1.5`, `CardTitle` con `text-xs font-medium uppercase tracking-wide text-muted-foreground`
- `CardContent` con valor grande (`text-2xl font-bold`) + subtítulo (`text-xs text-muted-foreground`)

## 8. Dark theme

- Clase `dark` en `<html>`.
- Tailwind v4: `@custom-variant dark (&:where(.dark, .dark *))`.
- Variables CSS en `:root` (light) y `.dark` (dark) en `index.css`.
- Anti-FOUC: script inline en `index.html` que aplica `dark` antes del render.
- Persistencia: `localStorage.getItem("theme")` / `localStorage.setItem("theme", theme)`.
- Default: dark (si no hay preferencia guardada y el sistema prefiere dark).

## 9. Animaciones y transiciones

- Cards: `transition-all` (hover shadow).
- Tabla: `transition-colors` (hover bg).
- Badges: `select-none` (no seleccionable).
- Processing: `animate-pulse` (indicador de carga).
- Duración: default de Tailwind (150ms para transitions, 2s para pulse).

## 10. Iconos

- Librería: `lucide-react`.
- Tamaño en botones: `size-4` o `size-5`.
- Tamaño en badges: implícito (el badge es texto).
- Tamaño en KPI cards: no se usan íconos (solo texto y números).
- Color: heredado del contexto (`text-muted-foreground`, `text-foreground`).
