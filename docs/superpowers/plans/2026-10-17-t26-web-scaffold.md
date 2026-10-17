# T26 · Scaffold web: Tailwind, Shadcn, router y Bento Grid — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Montar la base de UI que el PRD §5 exige: Tailwind v4, Shadcn/ui, router con las 8 rutas del mapa de navegación, layout Bento Grid responsive 1→4 columnas, dark theme neutro con toggle persistido, y badges con ícono + texto.

**Architecture:** React 19 + Vite + Tailwind v4 (plugin `@tailwindcss/vite`, CSS-first). Shadcn/ui con style `new-york` y componentes copiados en `src/components/ui/`. Router con `react-router-dom` y layouts anidados (`<Outlet>`). El tema se maneja con un hook `useTheme` que aplica la clase `dark` al `<html>` y persiste en `localStorage`, con script anti-FOUC en `index.html`.

**Tech Stack:** React 19, Vite 6, Tailwind CSS 4, Shadcn/ui (new-york), react-router-dom, lucide-react, clsx, tailwind-merge, class-variance-authority, Radix UI (dialog, slot).

**Spec:** `docs/superpowers/specs/2026-10-17-t26-web-scaffold-design.md` — el plan implementa ese spec; los dos viajan juntos.

## Global Constraints

- Todo corre dentro del contenedor. `just` no está instalado en el host: usar `bash ./scripts/compose.sh <args>`. El cwd de `compose exec` es `/app`, no `/app/web`.
- El web no tiene tests. La verificación es `npm run build` (tsc + vite) + `npm run typecheck` + `npm run lint`. `just check` corre typecheck → lint → test; el web no tiene test, así que `npm test` solo corre el api.
- Imports relativos llevan extensión `.js` por consistencia con el api, aunque el web usa `moduleResolution: Bundler` y Vite no la exige.
- Prettier: 100 columnas, comillas dobles, semicolons. `just check` no corre Prettier.
- Commits: Conventional Commits, mensajes en inglés, un commit = un cambio lógico.
- `node_modules` es un volumen nombrado en dev: al cambiar `package.json`, correr `just install` (o `just rebuild`). Editar `package.json` no reinstala solo.
- El `Dockerfile` de producción construye el web con `npm run build`; cualquier cambio que rompa el build rompe también la imagen de prod.

## Review Focus

Cinco formas de falla que el spec implica y que ningún test del camino feliz toca.

1. **Tailwind v4 mal configurado.** El plugin `@tailwindcss/vite` va en `vite.config.ts`, no en `postcss.config`. Si se mezcla con v3 (postcss), el build falla con "Cannot find module 'tailwindcss'". Verificación: `npm run build` pasa.
2. **Alias `@/` no resuelto.** Shadcn espera `@/components`, `@/lib/utils`. Sin `paths` en `tsconfig.json` y `resolve.alias` en Vite, tsc falla con "Cannot find module '@/...'". Verificación: `npm run typecheck` pasa.
3. **FOUC del tema.** Si la clase `dark` se aplica después del primer render, el usuario ve un flash. Mitigación: script inline en `index.html`. Verificación: inspección visual + código.
4. **Ruta inexistente que da 404 en vez de renderizar el layout.** Con `react-router-dom`, una ruta no declarada muestra la página de fallback de Vite (404). Mitigación: declarar las 8 rutas explícitamente y un catch-all `*` que redirige a `/`. Verificación: navegar a `/ruta-inexistente` muestra el layout.
5. **El build de producción rompe por una dependencia nueva.** El `Dockerfile` corre `npm run build` en el stage `build`. Si una dependencia nueva no está en `package-lock.json` o requiere toolchain, el build falla. Mitigación: correr `npm run build` localmente antes de commitear, y verificar con `COMPOSE_ENV=prod bash ./scripts/compose.sh build`.

---

### Task 1: Dependencias y configuración base

**Files:**
- Modify: `web/package.json`
- Modify: `web/vite.config.ts`
- Modify: `web/tsconfig.json`
- Modify: `web/index.html`
- Create: `web/components.json`
- Create: `web/src/index.css`
- Create: `web/src/lib/utils.ts`

**Interfaces:**
- Consumes: nada de tareas anteriores. El web es independiente del api.
- Produces: la infraestructura de Tailwind v4 + Shadcn + alias `@/`, que todas las tareas siguientes usan.

- [ ] **Step 1: Añadir dependencias a `web/package.json`**

```json
"dependencies": {
  "react": "^19.0.0",
  "react-dom": "^19.0.0",
  "react-router-dom": "^7.0.0",
  "tailwindcss": "^4.0.0",
  "@tailwindcss/vite": "^4.0.0",
  "clsx": "^2.1.0",
  "tailwind-merge": "^3.0.0",
  "class-variance-authority": "^0.7.0",
  "lucide-react": "^0.460.0",
  "@radix-ui/react-dialog": "^1.1.0",
  "@radix-ui/react-slot": "^1.1.0"
},
"devDependencies": {
  "@types/react": "^19.0.0",
  "@types/react-dom": "^19.0.0",
  "@vitejs/plugin-react": "^4.3.0",
  "typescript": "^5.7.0",
  "vite": "^6.0.0"
}
```

Mantener las versiones existentes de react/vite/typescript si ya están; solo añadir las nuevas.

- [ ] **Step 2: Configurar Vite con el plugin de Tailwind**

En `web/vite.config.ts`, añadir `tailwindcss()` a los plugins y el alias `@/`:

```ts
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:3000" },
  },
});
```

- [ ] **Step 3: Configurar `paths` en `web/tsconfig.json`**

Añadir:
```json
"baseUrl": ".",
"paths": { "@/*": ["./src/*"] }
```

- [ ] **Step 4: Crear `web/components.json` (config de Shadcn)**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

- [ ] **Step 5: Crear `web/src/index.css`**

```css
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
  --color-ring: var(--ring);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
}

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --border: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-foreground: oklch(0.985 0 0);
  --radius: 0.625rem;
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --border: oklch(1 0 0 / 10%);
  --ring: oklch(0.556 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --destructive-foreground: oklch(0.985 0 0);
}

@layer base {
  * { @apply border-border; }
  body { @apply bg-background text-foreground; }
}
```

- [ ] **Step 6: Crear `web/src/lib/utils.ts`**

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 7: Añadir script anti-FOUC en `web/index.html`**

En el `<head>`, antes del título:

```html
<script>
  (function () {
    const stored = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (stored === "dark" || (stored === null && prefersDark)) {
      document.documentElement.classList.add("dark");
    }
  })();
</script>
```

Default dark si no hay preferencia guardada (decisión: dark theme neutro por defecto).

- [ ] **Step 8: Instalar dependencias en el contenedor**

Run: `bash ./scripts/compose.sh exec app sh -c "cd /app/web && npm install"` (o `just install` si reinstala todo).

Expected: `node_modules` actualizado sin errores. Verificar con `ls web/node_modules/@tailwindcss`.

- [ ] **Step 9: Verificar que el build sigue pasando**

Run: `bash ./scripts/compose.sh exec app npm run build -w web`

Expected: tsc + vite build sin errores.

- [ ] **Step 10: Commitear**

```bash
git add web/
git commit -m "feat(web): add tailwind v4, shadcn config and theme scaffold"
```

---

### Task 2: Componentes Shadcn/ui

**Files:**
- Create: `web/src/components/ui/button.tsx`
- Create: `web/src/components/ui/card.tsx`
- Create: `web/src/components/ui/badge.tsx`
- Create: `web/src/components/ui/dialog.tsx`
- Create: `web/src/components/ui/sheet.tsx`
- Create: `web/src/components/ui/sidebar.tsx`

**Interfaces:**
- Consumes: `cn` de `@/lib/utils`, primitivos de Radix.
- Produces: los componentes que el layout y las páginas usan.

- [ ] **Step 1: Generar los componentes con la CLI de Shadcn**

Run dentro del contenedor:
```bash
bash ./scripts/compose.sh exec app sh -c "cd /app/web && npx shadcn@latest add button card badge dialog sheet sidebar --yes"
```

Expected: archivos creados en `src/components/ui/`. Si la CLI falla (TTY, red), escribirlos a mano desde el registry de Shadcn (new-york style).

- [ ] **Step 2: Verificar que los componentes compilan**

Run: `bash ./scripts/compose.sh exec app npm run typecheck -w web`

Expected: sin errores.

- [ ] **Step 3: Commitear**

```bash
git add web/src/components/ui/
git commit -m "feat(web): add shadcn ui primitives"
```

---

### Task 3: Tema, layout y Bento Grid

**Files:**
- Create: `web/src/hooks/useTheme.ts`
- Create: `web/src/components/ThemeToggle.tsx`
- Create: `web/src/components/layout/AppShell.tsx`
- Create: `web/src/components/layout/BentoGrid.tsx`

**Interfaces:**
- Consumes: componentes Shadcn (Button, Sheet, Sidebar), `cn`, íconos de lucide.
- Produces: `AppShell` (layout con sidebar + main + toggle), `BentoGrid` (grid responsive), `useTheme` (hook de tema).

- [ ] **Step 1: Crear `useTheme.ts`**

```ts
import { useCallback, useEffect, useState } from "react";

type Theme = "light" | "dark";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    const stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  return { theme, toggle };
}
```

- [ ] **Step 2: Crear `ThemeToggle.tsx`**

Botón con ícono (Sun/Moon de lucide) + texto ("Claro"/"Oscuro"). Usa `useTheme`.

- [ ] **Step 3: Crear `BentoGrid.tsx`**

```tsx
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function BentoGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {children}
    </div>
  );
}

export function BentoCard({ children, className, span = 1 }: { children: ReactNode; className?: string; span?: 1 | 2 | 4 }) {
  const spanClass = span === 2 ? "sm:col-span-2" : span === 4 ? "lg:col-span-4" : "";
  return <div className={cn(spanClass, className)}>{children}</div>;
}
```

- [ ] **Step 4: Crear `AppShell.tsx`**

Layout con sidebar (desktop) + Sheet (mobile hamburger) + main con `<Outlet>` + ThemeToggle en footer del sidebar.

Sidebar con los 8 links de navegación, resaltando la ruta activa con `NavLink`.

- [ ] **Step 5: Verificar typecheck**

Run: `bash ./scripts/compose.sh exec app npm run typecheck -w web`

Expected: sin errores.

- [ ] **Step 6: Commitear**

```bash
git add web/src/hooks web/src/components/layout web/src/components/ThemeToggle.tsx
git commit -m "feat(web): add theme toggle, app shell and bento grid"
```

---

### Task 4: Páginas y router

**Files:**
- Create: `web/src/pages/Tablero.tsx`, `Subir.tsx`, `Procesando.tsx`, `Detalle.tsx`, `Reglas.tsx`, `Bandeja.tsx`, `Aprobacion.tsx`, `Reporte.tsx`
- Create: `web/src/router.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/main.tsx`

**Interfaces:**
- Consumes: `AppShell`, `BentoGrid`, `BentoCard`, componentes Shadcn (Card, CardTitle).
- Produces: las 8 rutas navegables.

- [ ] **Step 1: Crear las 8 páginas**

Cada página es un componente que renderiza un `Card` con el nombre de la ruta como título y texto "Próximamente" centrado, dentro de un `BentoGrid` (para Tablero, 4 cards vacías; para el resto, 1 card).

```tsx
// Tablero.tsx (ejemplo)
import { BentoCard, BentoGrid } from "@/components/layout/BentoGrid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Tablero() {
  return (
    <BentoGrid>
      {["Touchless Rate", "Presupuesto Restante", "Total Procesadas", "Pendientes"].map((title) => (
        <BentoCard key={title}>
          <Card>
            <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
            <CardContent><p className="text-muted-foreground">Próximamente</p></CardContent>
          </Card>
        </BentoCard>
      ))}
    </BentoGrid>
  );
}
```

Las otras 7 páginas: un solo `BentoCard` con un `Card` que tiene el nombre de la ruta como título.

- [ ] **Step 2: Crear `router.tsx`**

```tsx
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
import Tablero from "@/pages/Tablero";
// ... imports

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Tablero /> },
      { path: "subir", element: <Subir /> },
      { path: "procesando", element: <Procesando /> },
      { path: "factura/:id", element: <Detalle /> },
      { path: "reglas", element: <Reglas /> },
      { path: "bandeja", element: <Bandeja /> },
      { path: "aprobacion/:id", element: <Aprobacion /> },
      { path: "reporte", element: <Reporte /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export function Router() {
  return <RouterProvider router={router} />;
}
```

- [ ] **Step 3: Actualizar `App.tsx` y `main.tsx`**

`App.tsx` importa y renderiza `<Router />`. `main.tsx` envuelve con `StrictMode` (ya está).

- [ ] **Step 4: Verificar typecheck y build**

Run: `bash ./scripts/compose.sh exec app npm run typecheck -w web && bash ./scripts/compose.sh exec app npm run build -w web`

Expected: sin errores de typecheck, build exitoso (dist/ generado).

- [ ] **Step 5: Verificar lint y fmt**

Run: `bash ./scripts/compose.sh exec app npm run lint` y `bash ./scripts/compose.sh exec app npx prettier --check web/src`

Expected: limpio. Si prettier falla, correr `just fmt` o `npm run format`.

- [ ] **Step 6: Commitear**

```bash
git add web/
git commit -m "feat(web): scaffold bento layout, tailwind and shadcn ui"
```

---

### Task 5: Verificación final

- [ ] **Step 1: Verificar que el build de producción sigue pasando**

Run: `COMPOSE_ENV=prod bash ./scripts/compose.sh build`

Expected: imagen construida sin errores (el `Dockerfile` corre `npm run build` que incluye el web).

- [ ] **Step 2: Verificar que `just check` pasa**

Run: `bash ./scripts/compose.sh exec app npm run typecheck && bash ./scripts/compose.sh exec app npm run lint && bash ./scripts/compose.sh exec app npm test`

Expected: typecheck limpio, lint limpio, 63/63 tests (web no tiene tests).

- [ ] **Step 3: Verificación visual (manual)**

Levantar dev (`just up` o `bash ./scripts/compose.sh up -d`), abrir `http://localhost:5173`, verificar:
- Sidebar con 8 links.
- Bento Grid con 4 cards en desktop, 2 en tablet, 1 en mobile.
- Toggle de tema funciona y persiste al recargar.
- Navegar a cada ruta muestra la caja vacía con el nombre.
- Navegar a `/ruta-inexistente` redirige a `/`.

---

## Self-Review

1. **Spec coverage:** el spec tiene 14 secciones. La Task 1 cubre §§4, 5, 6, 9, 13 (config, CSS, utils, index.html, deps). La Task 2 cubre §6 (componentes). La Task 3 cubre §§8, 9 (Bento, tema, layout). La Task 4 cubre §§7, 10, 11 (rutas, páginas, verificación). La Task 5 cubre §11 (criterio de aceptación) y §12 (fuera de scope, implícito). Cubierto.

2. **Step scan:** cada paso tiene comando y expected. Sin "TBD".

3. **Type consistency:** `BentoGrid`, `BentoCard`, `AppShell`, `useTheme`, `ThemeToggle` usados consistentemente. `@/` alias usado en todos los imports de `src/`.

4. **Review Focus:** los cinco puntos tienen su verificación en las Tasks 1, 3 y 4.

5. **Proportion:** el plan es razonable para un scaffold de ~15 archivos nuevos. No es un transcript: los componentes Shadcn se generan con la CLI, no se transcriben.

## Execution Handoff

Plan completo y guardado en `docs/superpowers/plans/2026-10-17-t26-web-scaffold.md`. Revisalo. ¿Captura lo que quieres?

La ejecución será con el método que ya elegiste (**Native**): yo implemento cada paso en esta sesión y un revisor final revisa toda la rama. ¿Procedo con la implementación?