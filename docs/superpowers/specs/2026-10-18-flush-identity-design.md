# Identidad FLUSH — Design Spec

> **Fecha:** 2026-10-18
> **Feature:** Actualización de la identidad visual de la aplicación: nombre, fuente del logo y paleta de colores.

## Decisión de producto

- **Nombre:** la app pasa a llamarse `FLUSH` (capitalizado) en toda la UI visible al usuario.
- **Fuente del logo:** "Iceland" (Google Fonts), aplicada **solo** al texto del logo. El resto de la tipografía queda intacta (system-ui).
- **Paleta:** Royal Plum `#7d2e68`, Dark Amethyst `#251351`, Prussian Blue `#040926`, Burnt Caramel `#bd632f`, Dust Grey `#d4d2d5`.
- **Modo claro/oscuro:** se mantiene el toggle. Light mode usa versiones claras; dark mode usa la paleta tal cual.
- **Colores de veredicto (badges):** se mantienen emerald/rose/amber (semánticos, accesibilidad).
- **Hardcoded `#185338` (verde bosque):** se migran a los nuevos tokens para consistencia.

## Alcance

### 1. Nombre `FLUSH`

Archivos a modificar:
- `web/index.html`: `<title>` → `FLUSH`.
- `web/src/components/layout/AppShell.tsx`: sidebar header "Blinka PayAgent" → "FLUSH"; sheet mobile title → "FLUSH".
- `package.json` (root): `name` → `flush` (opcional, solo si se decide renombrar el paquete; por defecto se deja).

Fuera de alcance: renombrar archivos, rutas, variables internas, docs históricos.

### 2. Fuente Iceland (solo logo)

- `web/index.html`: agregar los `<link>` de preconnect y el CSS de Google Fonts para Iceland.
- `web/src/index.css`: definir `--font-logo: "Iceland", cursive;` y una clase `.font-logo { font-family: var(--font-logo); }`.
- `AppShell.tsx`: aplicar `font-logo` al texto del logo (sidebar header y sheet title).
- El resto de la tipografía (`font-sans` = system-ui) queda intacta.

### 3. Paleta de colores — REVERTIDA

La paleta nueva (Royal Plum, Dark Amethyst, Prussian Blue, Burnt Caramel, Dust Grey) se descartó.
Se mantiene la paleta original (verde bosque `#185338` / `#1e704a`). Los tokens CSS
(`--primary`, `--ring`, `--sidebar-primary`, etc.) quedan con sus valores originales.

Los colores de veredicto (emerald/rose/amber) se mantienen sin cambios.

### 4. Actualizar `DESIGN.md`

- Sección 2 (Tipografía): agregar la fuente Iceland para el logo (único cambio aplicado).

## Fuera de alcance

- Renombrar paquetes npm, archivos, rutas internas.
- Cambiar colores de veredicto (emerald/rose/amber) — semánticos.
- Cambiar la fuente del resto de la app.
- Modificar componentes Shadcn base (button, card, etc.) más allá de tokens.

## Verificación

- `npm run build` (web) pasa.
- `npm run typecheck` (web) pasa.
- Visual: el logo dice "FLUSH" en Iceland; la paleta se aplica en sidebar, cards, botones primarios y gráficos.
- Light/dark toggle sigue funcionando.
- Badges de veredicto mantienen verde/rojo/ámbar.