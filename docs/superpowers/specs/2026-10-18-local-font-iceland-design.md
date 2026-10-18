# Hostear la fuente Iceland localmente — Design Spec

> **Fecha:** 2026-10-18
> **Feature:** Eliminar la dependencia del CDN de Google Fonts para la fuente Iceland (logo) y servirla desde el propio servidor.

## Decisión de producto

- **Formato:** WOFF2 (convertido desde el TTF de Google Fonts). Un solo archivo (~12 KB).
- **Ubicación:** `web/public/fonts/Iceland.woff2` + `web/public/fonts/OFL.txt` (licencia SIL OFL, obligatoria).
- **Declaración:** un solo `@font-face` en `index.css` con `src: url("/fonts/Iceland.woff2") format("woff2")` y `font-display: swap`.
- **Sin subsetting:** el archivo completo (~12 KB tras compresión) es despreciable.
- **Sin CDN:** se eliminan los 3 `<link>` de Google Fonts de `index.html`.
- **Obtención:** paso manual en el host (descargar TTF de Google Fonts, convertir con `woff2_compress` o `fonttools`, commitear el `.woff2` + `OFL.txt`).

## Alcance

### 1. Descarga y conversión (paso manual, en el host)

1. Descargar el TTF de Iceland desde Google Fonts (https://fonts.google.com/specimen/Iceland).
2. Convertir a WOFF2:
   - Opción A: `woff2_compress Iceland-Regular.ttf` (paquete `woff2` de Google).
   - Opción B: `python3 -m fontTools.ttLib.woff2 compress Iceland-Regular.ttf` (requiere `fonttools` + `brotli`).
3. Renombrar el resultado a `Iceland.woff2`.
4. Copiar `Iceland.woff2` y `OFL.txt` (licencia, incluida en el zip de Google Fonts) a `web/public/fonts/`.

### 2. Declaración `@font-face` en `index.css`

```css
@font-face {
  font-family: "Iceland";
  src: url("/fonts/Iceland.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
```

Eliminar la clase `.font-logo`? No — mantenerla, pero ahora la fuente se resuelve localmente.

### 3. Eliminar CDN de `index.html`

Quitar los 3 `<link>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Iceland&display=swap" rel="stylesheet" />
```

### 4. Verificación

- `npm run build` (web) pasa.
- El archivo `Iceland.woff2` está en `web/dist/fonts/` tras el build.
- En el navegador (Network tab), la fuente se carga desde `/fonts/Iceland.woff2` (mismo origen), sin requests a `fonts.googleapis.com`.
- El logo "FLUSH" se renderiza con Iceland.

## Fuera de alcance

- Subsetting (el archivo completo ~12 KB es despreciable).
- Múltiples pesos/estilos (Iceland solo tiene 400 regular).
- Servir la fuente desde la API (se sirve como estático desde `web/dist`).
- Tooling automatizado en el Dockerfile (el archivo se commitea al repo).

## Licencia

Iceland está bajo SIL Open Font License (OFL). Se incluye `OFL.txt` en `web/public/fonts/`.