# Hostear la fuente Iceland localmente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar la dependencia del CDN de Google Fonts para Iceland y servirla desde el propio servidor (archivo WOFF2 commiteado).

**Architecture:** Descargar el TTF de Google Fonts, convertirlo a WOFF2 en el host, commitear `Iceland.woff2` + `OFL.txt` en `web/public/fonts/`. Declarar `@font-face` en `index.css` apuntando a `/fonts/Iceland.woff2`. Eliminar los `<link>` del CDN en `index.html`. La clase `.font-logo` queda igual.

**Tech Stack:** CSS `@font-face`, WOFF2, Vite (sirve `public/` como estático), Fastify static en prod. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-10-18-local-font-iceland-design.md`.

## Global Constraints

- Todo corre dentro del contenedor. `just` no está instalado en el host: usar `bash ./scripts/compose.sh <args>`.
- La conversión TTF→WOFF2 se hace **en el host** (fuera del contenedor), porque requiere `woff2_compress` o `fonttools`.
- Commits: Conventional Commits, mensajes en inglés, un commit = un cambio lógico.

## Review Focus

1. **El archivo `.woff2` no se commitea.** Si se olvida, en prod la fuente no carga y el logo cae al fallback. Verificar con `git status` y `ls web/public/fonts/`.
2. **La ruta `/fonts/...` no se sirve en prod.** Fastify sirve `web/dist` (que incluye `public/` copiado por Vite). Verificar que `web/dist/fonts/Iceland.woff2` existe tras el build.
3. **`font-display: swap` ausente.** Sin él, hay FOIT (flash of invisible text). Verificar en el `@font-face`.
4. **La licencia OFL no se incluye.** Incumplimiento de la licencia. Verificar `web/public/fonts/OFL.txt`.
5. **Los `<link>` del CDN no se eliminan.** La app seguiría dependiendo del CDN. Verificar `index.html`.

---

## Task 1: Descargar y convertir la fuente (paso manual en el host)

**Files:**
- Create: `web/public/fonts/Iceland.woff2`
- Create: `web/public/fonts/OFL.txt`

- [ ] **Step 1: Descargar el TTF de Iceland desde Google Fonts**

Ir a https://fonts.google.com/specimen/Iceland → "Download family". Se descarga un zip con `Iceland-Regular.ttf` y `OFL.txt`.

- [ ] **Step 2: Convertir TTF a WOFF2**

Opción A (recomendada, paquete `woff2` de Google):
```bash
# Instalar woff2 (una vez)
# Ubuntu/Debian: sudo apt install woff2
# macOS: brew install woff2
woff2_compress Iceland-Regular.ttf
# Produce Iceland-Regular.woff2
```

Opción B (fonttools):
```bash
pip install fonttools brotli
python3 -m fontTools.ttLib.woff2 compress Iceland-Regular.ttf
# Produce Iceland-Regular.woff2
```

- [ ] **Step 3: Renombrar y copiar**

```bash
cd /home/daniel_alejandro/faktur
mkdir -p web/public/fonts
mv Iceland-Regular.woff2 web/public/fonts/Iceland.woff2
cp OFL.txt web/public/fonts/OFL.txt
```

- [ ] **Step 4: Verificar**

```bash
ls -la web/public/fonts/
# Iceland.woff2  OFL.txt
file web/public/fonts/Iceland.woff2
# ... Web Open Font Format (Version 2)
```

- [ ] **Step 5: Commitear los archivos de fuente**

```bash
git add web/public/fonts/Iceland.woff2 web/public/fonts/OFL.txt
git commit -m "assets(web): add Iceland font (woff2) and OFL license"
```

---

## Task 2: Declarar `@font-face` local en `index.css`

**Files:**
- Modify: `web/src/index.css`

- [ ] **Step 1: Agregar el `@font-face`**

Al inicio de `index.css` (después del `@import "tailwindcss";`), agregar:

```css
@font-face {
  font-family: "Iceland";
  src: url("/fonts/Iceland.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
```

La clase `.font-logo` (ya existente) queda igual:
```css
.font-logo {
  font-family: var(--font-logo);
}
```

Y `--font-logo: "Iceland", cursive;` en `:root` queda igual.

- [ ] **Step 2: Verificar que el build incluye la fuente**

Run: `bash ./scripts/compose.sh exec app sh -c 'cd /app/web && npm run build'`
Expected: `web/dist/fonts/Iceland.woff2` existe.

- [ ] **Step 3: Commitear**

```bash
git add web/src/index.css
git commit -m "style(web): declare Iceland font-face locally"
```

---

## Task 3: Eliminar los `<link>` del CDN en `index.html`

**Files:**
- Modify: `web/index.html`

- [ ] **Step 1: Quitar los 3 links de Google Fonts**

Eliminar:
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Iceland&display=swap" rel="stylesheet" />
```

Mantener el `<title>FLUSH</title>` y el script de anti-FOUC.

- [ ] **Step 2: Verificar**

Run: `grep -n "fonts.googleapis\|fonts.gstatic" web/index.html`
Expected: sin salida.

- [ ] **Step 3: Commitear**

```bash
git add web/index.html
git commit -m "chore(web): remove Google Fonts CDN links for Iceland"
```

---

## Task 4: Verificación

- [ ] **Step 1: Typecheck + build**

Run: `bash ./scripts/compose.sh exec app sh -c 'cd /app/web && npx tsc --noEmit && npm run build'`
Expected: OK y `web/dist/fonts/Iceland.woff2` existe.

- [ ] **Step 2: Verificar en el navegador (dev)**

Abrir http://127.0.0.1:5173, inspeccionar el logo "FLUSH" (debe usar Iceland) y en la pestaña Network verificar que la fuente se carga desde `/fonts/Iceland.woff2` (mismo origen), sin requests a `fonts.googleapis.com`.

- [ ] **Step 3: Verificar en producción (build)**

Run: `bash ./scripts/compose.sh exec app sh -c 'ls -la /app/web/dist/fonts/'`
Expected: `Iceland.woff2` presente.

- [ ] **Step 4: Lint + tests**

Run: `bash ./scripts/compose.sh exec app sh -c 'cd /app && npx eslint web/src'` y `cd /app/web && npm test`.
Expected: sin errores, tests pass.

---

## Self-Review

1. **Spec coverage:** descarga/conversión (T1), @font-face (T2), eliminar CDN (T3), verificación (T4). Cubierto.
2. **Step scan:** cada paso tiene comando y expected.
3. **Type consistency:** `.font-logo` y `--font-logo` se mantienen; solo cambia el `src` del `@font-face`.
4. **Review Focus:** los cinco puntos tienen verificación en las tareas.

## Execution Handoff

Plan completo y guardado en `docs/superpowers/plans/2026-10-18-local-font-iceland.md`. ¿Captura lo que quieres?

La ejecución será con el método que ya elegiste (**Native**): yo implemento cada paso en esta sesión (excepto la descarga/conversión manual del TTF, que se hace en el host). ¿Procedo?