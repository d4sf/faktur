# ADR 0005 — Rate limiting y throttling

**Estado:** Aceptado
**Fecha:** 2026-10-17

## Contexto

La API no tenía ningún límite de tasa. Un cliente (o un bug) podía generar cientos de requests por segundo, agotando la cuota de Gemini (upload/extracción/explicación) y saturando el contenedor. La web tampoco throttleaba acciones costosas ni la navegación rápida.

## Decisión

- Se usa `@fastify/rate-limit` con store in-memory (una sola instancia en Render free tier).
- Límite global por IP (120 req/min por defecto) + límites específicos más estrictos para upload (10), explain (5), admin reset (3), webhook test (5) y policy preview (5).
- `trustProxy: true` para obtener la IP real detrás del proxy de Render.
- Exentos: `/api/health` (monitoreo de Render) y `/api/approvals/stream` (SSE).
- Respuesta al exceder: `429 Too Many Requests` con `Retry-After` y body `{ error: "rate_limit_exceeded", retry_after, data }` (easter egg).
- Configurable por env vars (`RATE_LIMIT_*`).
- En la web: hook `useThrottle` + botones disabled durante peticiones + throttle de clics en la navegación del sidebar (300 ms).

## Consecuencias

- Nueva dependencia `@fastify/rate-limit`.
- `buildApp` acepta `rateLimit?: false | RateLimitConfig` para desactivar/sobrescribir en tests.
- Limitación documentada: in-memory no se comparte entre instancias; para multi-instancia se necesita Redis (fuera de alcance).