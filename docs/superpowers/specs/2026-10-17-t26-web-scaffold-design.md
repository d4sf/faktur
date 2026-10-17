# T26 · Scaffold web: Tailwind, Shadcn, router y Bento Grid — Design

**Fecha:** 2026-10-17
**Estado:** aprobado, pendiente de plan e implementación
**Backlog:** `docs/backlog_implementacion_mvp.md` §T26
**Depende de:** T1 (mergeado)

## 1. Intent y por qué

El frontend hoy es un `App.tsx` de 20 líneas que solo comprueba el health de la API. T18-T22 (tablero, subir, detalle, reglas, bandeja, aprobación, reporte) se escribirían contra estilos inline y habría que rehacer todo el layout cuando se quiera aplicar el Bento Grid del PRD §5. T26 es el cimiento: Tailwind, Shadcn/ui, router con las rutas del mapa de navegación y el layout Bento Grid responsive en dark theme neutro. Sin este scaffold, cada tarea de UI reinventa la rueda y el resultado final no tiene coherencia visual.

## 2. Goals

- Tailwind CSS v4 instalado y funcionando con Vite (plugin `@tailwindcss/vite`, CSS-first, sin `postcss.config` ni `tailwind.config.js`).
- Shadcn/ui inicializado con los primitivos que el layout y las tareas posteriores necesitan: `Button`, `Card`, `Badge`, `Sidebar`, `Sheet`, `Dialog`.
- Router (`react-router-dom`) con las 8 rutas del diagrama de navegación, cada una respondiendo con una caja vacía que lleva el nombre de la ruta.
- Layout Bento Grid responsive de 1 a 4 columnas (mobile → tablet → desktop).
- Dark theme neutro por defecto, con toggle que persiste la preferencia en `localStorage`.
- Badges con ícono + texto, nunca solo color (accesibilidad, PRD §5).
- `just check` y `just fmt` limpios (typecheck + lint + tests; web no tiene tests aún, así que el check del web es typecheck + lint).

## 3. Non-goals (explícito)

- **No se implementa ninguna pantalla real.** T18-T22 construyen sobre este scaffold. Acá solo cajas vacías con el nombre de la ruta.
- **No se conecta la API.** El health check actual se mantiene como está o se mueve a una ruta; no se añaden llamadas a `/api/invoices/*`.
- **No se añaden tests al web.** El web no tiene tests hoy; añadirlos es una tarea aparte (y el `just check` del web no los corre).
- **No se publica ni se despliega.** El `Containerfile` ya construye el web; este scaffold solo asegura que el build siga funcionando.
- **No se añade estado global** (Zustand, Redux, etc.). El toggle de tema vive en un context/hook mínimo; el resto de estado es local por ruta.

## 4. Constraints

- **Stack fijo** (ADR 0001): React 19 + Vite. No se cambia.
- **Tailwind v4** (decisión de esta sesión): más sencilla que v3, CSS-first, plugin de Vite.
- **Shadcn/ui**: componentes copiados al repo (`src/components/ui/`), no dependencia npm. El estilo base es `new-york` (el default actual de Shadcn).
- **Dark theme neutro**: paleta slate/zinc, sin acentos saturados. Badges con ícono + texto.
- **Responsive**: mobile (1 col) → tablet (2 col) → desktop (4 col). Breakpoints de Tailwind (`sm`, `md`, `lg`).
- **Accesibilidad**: `aria-label` en el toggle de tema, focus visible, contraste suficiente.
- **Imports relativos con extensión `.js`** en el web: el web usa `moduleResolution: Bundler` y Vite, así que las extensiones no son estrictamente obligatorias como en el api, pero se mantienen por consistencia.
- **Prettier**: 100 columnas, comillas dobles, semicolons. `just fmt` al final.

## 5. Decisiones tomadas en esta sesión

| Decisión | Elegido | Por qué |
|:---|:---|:---|
| Tailwind | v4 (`@tailwindcss/vite`) | Más sencilla: sin PostCSS, sin config JS. |
| Shadcn style | `new-york` | Default actual de Shadcn; más denso, encaja con Bento. |
| Componentes Shadcn iniciales | Button, Card, Badge, Sidebar, Sheet, Dialog | Los que el layout y las tareas posteriores (T18-T22) van a necesitar. |
| Router | `react-router-dom` v6 (o v7 en modo declarativo) | Estándar del ecosistema React; soporta layouts anidados con `<Outlet>`. |
| Tema | Toggle claro/oscuro persistido en `localStorage` | Decisión del dueño del producto. |
| Contenido de rutas | Cajas vacías con el nombre de la ruta | Scaffold, no implementación. |
| Rutas | 8 (incluyendo `/procesando`) | Cumple el diagrama de navegación literalmente. |

## 6. Estructura de archivos

| Archivo | Acción | Responsabilidad |
|:---|:---|:---|
| `web/vite.config.ts` | Modificar | Añadir plugin `@tailwindcss/vite`. |
| `web/src/index.css` (o `globals.css`) | Crear | `@import "tailwindcss"`, variables de tema (light/dark), base styles. |
| `web/components.json` | Crear | Config de Shadcn (style, rsc, tsx, tailwind, aliases). |
| `web/src/lib/utils.ts` | Crear | `cn()` helper (clsx + tailwind-merge). |
| `web/src/components/ui/*.tsx` | Crear | Button, Card, Badge, Sidebar, Sheet, Dialog (generados por Shadcn CLI o escritos a mano). |
| `web/src/components/layout/AppShell.tsx` | Crear | Layout con Sidebar + main + theme toggle. |
| `web/src/components/layout/BentoGrid.tsx` | Crear | Grid responsive 1→4 columnas. |
| `web/src/components/ThemeToggle.tsx` | Crear | Toggle claro/oscuro con persistencia. |
| `web/src/hooks/useTheme.ts` | Crear | Hook que lee/escribe `localStorage` y aplica clase `dark` al `<html>`. |
| `web/src/pages/*.tsx` | Crear | 8 páginas vacías (Tablero, Subir, Procesando, Detalle, Reglas, Bandeja, Aprobación, Reporte). |
| `web/src/router.tsx` (o en `App.tsx`) | Crear/Modificar | Definición de rutas con `<Outlet>` en el layout. |
| `web/src/App.tsx` | Modificar | Reemplazar el health-check por el router + layout. |
| `web/src/main.tsx` | Modificar | Envolver con `BrowserRouter` (o `RouterProvider`). |
| `web/package.json` | Modificar | Añadir dependencias: tailwindcss v4, @tailwindcss/vite, react-router-dom, clsx, tailwind-merge, lucide-react, y los primitivos de Radix que Shadcn use. |
| `web/tsconfig.json` | Modificar | Añadir `baseUrl` y `paths` para el alias `@/` que Shadcn espera. |
| `web/index.html` | Modificar | Añadir clase `dark` inicial según preferencia (o dejar que el hook la aplique antes del render para evitar FOUC). |

## 7. Rutas del mapa de navegación

| Ruta | Página | Notas |
|:---|:---|:---|
| `/` | `Tablero` | Hub principal (Bento con cards de métricas). |
| `/subir` | `Subir` | Dropzone (placeholder). |
| `/procesando` | `Procesando` | Estado transitorio (placeholder). |
| `/factura/:id` | `Detalle` | Detalle de factura (placeholder). |
| `/reglas` | `Reglas` | Policy controller (placeholder). |
| `/bandeja` | `Bandeja` | Lista de aprobaciones (placeholder). |
| `/aprobacion/:id` | `Aprobacion` | Detalle de aprobación (placeholder). |
| `/reporte` | `Reporte` | Export CSV (placeholder). |

Todas las rutas comparten el layout `AppShell` (sidebar + main). La ruta activa se resalta en el sidebar.

## 8. Bento Grid

Componente `BentoGrid` que envuelve children en un CSS grid:

```css
grid-template-columns: repeat(1, minmax(0, 1fr));   /* mobile */
@media (min-width: 640px)  { repeat(2, ...) }       /* tablet */
@media (min-width: 1024px) { repeat(4, ...) }       /* desktop */
```

Los cards (Shadcn `Card`) ocupan 1 columna por defecto y pueden spanear 2 con una prop `span`. En el scaffold, el Tablero muestra un grid de 4 cards vacías para demostrar el reflow.

**Qué es una "caja vacía":** un `Card` de Shadcn con el nombre de la ruta como título (`CardTitle`) y un texto gris "Próximamente" centrado. Sin datos, sin llamadas a la API. El objetivo es que se vea el layout, no el contenido. Decisión mía.

## 9. Dark theme y toggle

- Clase `dark` en `<html>`. Tailwind v4 usa `@custom-variant dark (&:where(.dark, .dark *))` o el default con `prefers-color-scheme`. Para toggle manual, se usa el enfoque de clase.
- `useTheme` hook: lee `localStorage.getItem('theme')`, default `'dark'`, aplica clase al `<html>`, expone `theme` y `toggle`.
- `ThemeToggle` componente: botón con ícono (sol/luna de `lucide-react`) + texto ("Claro"/"Oscuro"), no solo color. Vive en el footer del sidebar (desktop) y en el header del Sheet (mobile). Decisión mía.
- Anti-FOUC: script inline en `index.html` que aplica la clase `dark` antes del primer render de React, leyendo `localStorage`. Obligatorio, no opcional: sin él, un usuario con preferencia oscura ve un flash de tema claro en cada carga. Decisión mía.

## 10. Lo que queda al builder

- Elegir entre `BrowserRouter` y `createBrowserRouter` (data router). Para este scaffold, `BrowserRouter` con `<Routes>` es más simple y suficiente.
- Decidir si el sidebar es colapsable en mobile (probablemente sí, con `Sheet`).
- Elegir la paleta exacta de dark theme (slate-900 base, slate-800 cards, etc.).
- Decidir si el BentoGrid usa CSS grid puro o un componente de Shadcn (no hay Bento en Shadcn; se escribe a mano).
- Verificar que `npm run build` (tsc + vite) sigue pasando después de añadir Tailwind v4 y las dependencias.

## 11. Criterio de aceptación (del backlog)

- Las 8 rutas del mapa de navegación existen y responden (caja vacía con nombre).
- El Bento reflowea de 1 a 4 columnas (verificable redimensionando el viewport).
- `just check` y `just fmt` limpios.
- El build de producción (`npm run build`) pasa.
- El toggle de tema persiste entre recargas.

## 12. Fuera de scope (explícito)

- Pantallas reales (T18-T22).
- Llamadas a la API.
- Tests del web (no existen hoy).
- Estado global compartido.
- Publicación/despliegue.

## 13. Dependencias a añadir (web/package.json)

- `tailwindcss` (v4)
- `@tailwindcss/vite`
- `react-router-dom`
- `clsx`
- `tailwind-merge`
- `lucide-react`
- `class-variance-authority` (usado por Shadcn)
- Primitivos de Radix según los componentes elegidos (dialog, sheet, etc. — Shadcn CLI los añade automáticamente)
- `@radix-ui/react-slot` (para Button con `asChild`)

## 14. Riesgos

- **Shadcn CLI + Tailwind v4**: la CLI de Shadcn detecta la versión de Tailwind y genera el código adecuado, pero hay que asegurarse de usar la versión más reciente de la CLI. Si la CLI no soporta v4 en el momento de implementar, instalar los componentes a mano desde el registry de Shadcn.
- **FOUC del tema**: si la clase `dark` se aplica después del primer render, el usuario ve un flash de tema claro. Mitigación: script inline en `index.html`.
- **Alias `@/`**: Shadcn espera `@/components`, `@/lib/utils`. Hay que configurar `paths` en `tsconfig.json` y `resolve.alias` en Vite. Tailwind v4 no necesita alias para el CSS.
- **`npm ci` en el contenedor**: añadir dependencias requiere `just install` o `just rebuild` (el volumen nombrado de `node_modules`). Recordar que editar `package.json` no reinstala solo.
EOF
echo "spec escrito"