# Rate Limiting y Throttling — Design Spec

> **Fecha:** 2026-10-17
> **Feature:** Rate limiting en los endpoints de la API y throttling en las rutas/acciones de la web.

## Decisión de producto

- **API**: rate limiting real por IP con `@fastify/rate-limit`, global + límites específicos por endpoint costoso.
- **Web**: throttling de UX (botones deshabilitados durante peticiones, debounce en inputs, throttle de clics de navegación). No hay rate limiting real en el cliente (la API es la fuente de verdad).
- Sin autenticación: la clave es la IP (`request.ip`), con `trustProxy` activado para Render.
- In-memory store (una sola instancia en Render free tier). Documentar la limitación para multi-instancia.
- Respuesta al exceder: `429 Too Many Requests` con `Retry-After` y body `{ error, retry_after, data }` donde `data` contiene un easter egg (URL de YouTube).

## Alcance

### API

- Dependencia: `@fastify/rate-limit@^11`.
- Registro en `app.ts` con config global desde env vars.
- `trustProxy: true` en la instancia Fastify.
- Exentos: `/api/health` (monitoreo) y `/api/approvals/stream` (SSE; limitar conexiones concurrentes por IP).
- Límites específicos (más estrictos) para: upload (`/api/invoices` POST), extract (`/api/invoices/:id/extract`), explain (`/api/invoices/:id/explain`), admin reset, webhook test, policy preview.
- Configurable vía env: `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS` y overrides por ruta.
- Respuesta 429 con `Retry-After` y body `{ error: "rate_limit_exceeded", retry_after: <s>, data: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }`.

### Web

- Throttle de clics en la navegación del sidebar (ignorar clics dentro de 300 ms).
- Botones de acción deshabilitados durante peticiones en vuelo (ya parcial; completar en upload, explain, policy preview, approvals).
- Debounce en inputs de búsqueda/filtro (si existen).

### Tests

- Tests de integración con límites bajos inyectados vía opción de `buildApp` (`rateLimit: false | { global, upload, explain, admin, webhookTest }`).
- Verificar 429 + `Retry-After` + body.

## Fuera de alcance

- Redis / store distribuido (documentado como limitación).
- Rate limiting por usuario (no hay auth).
- WAF / protección DDoS a nivel de infraestructura (Render lo provee).
- Bloqueo permanente de IPs.

## Decisiones

- `@fastify/rate-limit` es el estándar del ecosistema Fastify 5.
- In-memory es suficiente para Render free tier (una instancia).
- El easter egg en `data` es un requisito explícito (humor), inofensivo.