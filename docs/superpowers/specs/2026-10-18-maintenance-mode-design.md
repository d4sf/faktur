# Modo desactivado (maintenance mode) — Design Spec

> **Fecha:** 2026-10-18
> **Feature:** Toggle en caliente que, al desactivar el sitio, reemplaza toda la web por una página centrada con el texto "Flush". La API (incluido el toggle) sigue funcionando.

## Decisión de producto

- El estado vive en `settings` (key `maintenance_mode`, `"true"`/`"false"`), reutilizando la infraestructura existente. Por defecto: desactivado = `false` (sitio funciona normal).
- Server-side: Fastify devuelve una página HTML mínima y autocontenida ("Flush" centrado) para todas las rutas no-`/api` cuando el modo está activo. No se descarga el bundle.
- La API sigue funcionando normalmente (incluido el toggle y `/api/health`).
- Toggle vía `POST /api/maintenance` con header `X-Maintenance-Secret` (env var `MAINTENANCE_SECRET`) y body `{ enabled: boolean }` (`enabled=true` → sitio activo).
- `GET /api/maintenance` devuelve `{ enabled: boolean }` (público).
- Respuesta HTTP de la página "Flush": `200 OK`.
- Secret faltante → endpoint devuelve `503 maintenance_secret_not_configured`. Secret inválido → `403 invalid_secret`.

## Alcance

### Backend

- Env var `MAINTENANCE_SECRET` (opcional; blank = no configurado).
- Servicio `api/src/services/maintenance.ts`: `isMaintenanceMode(db)`, `setMaintenanceMode(maintenance, db)`, constante `MAINTENANCE_HTML`.
- Hook `onRequest` en `app.ts`: si `!url.startsWith("/api/")` y maintenance activo → devolver `MAINTENANCE_HTML` (200, text/html).
- Rutas en `api/src/routes/maintenance.ts`:
  - `GET /api/maintenance` → `{ enabled }`.
  - `POST /api/maintenance` → verifica secret, aplica toggle, devuelve `{ enabled }`.

### Frontend

- Sin cambios en la SPA (el server-side se encarga). Opcional: la UI podría consultar `/api/maintenance` pero no es necesario.

### Tests

- Unit tests del servicio.
- Tests de integración: GET estado, POST toggle con secret válido/inválido/faltante, handler devuelve HTML "Flush" cuando está desactivado.

### Docs

- `.env.example`: agregar `MAINTENANCE_SECRET`.
- ADR opcional.

## Fuera de alcance

- Bloqueo de la API en modo desactivado.
- Página de mantenimiento con estilos/JS.
- Autenticación de usuarios (el secret es el único mecanismo).