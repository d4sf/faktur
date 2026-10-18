# ADR 0004 — Integración con Slack (webhook)

**Estado:** Aceptado
**Fecha:** 2026-10-17

## Contexto

El agente notifica eventos a un canal externo. Hasta ahora la URL del webhook vivía solo en la env var `NOTIFIER_WEBHOOK_URL` (T17), lo que obligaba a reiniciar el contenedor para cambiarla y no era usable en una demo en vivo. Se necesita una pantalla donde el usuario pegue la URL de un incoming webhook de Slack.

## Decisión

- La URL se persiste en la tabla `settings` (key/value) y tiene precedencia sobre la env var.
- Se dispara únicamente en ESCALAR (pendiente de aprobación) y NEGADA (rechazo humano). No en FRENAR ni en PAGAR.
- El mensaje es un `text` simple de Slack con factura, proveedor, monto, motivo y, si existe, la explicación con IA cacheada. No se llama al modelo en el camino crítico.
- Se reutiliza el outbox (`notifications`) y el patrón fire-and-forget: un webhook caído queda `FALLIDA` y no revierte la decisión.
- Un botón "probar" valida la URL antes de confiar en ella.

## Consecuencias

- Nueva tabla `settings` y migración en `schema.ts`.
- Nuevo endpoint set `GET/PUT/DELETE/POST-test /api/integrations/slack`.
- Nueva página `/integraciones` en la web.
- El PRD original no se edita; este ADR y la tabla de "Decisiones posteriores" del PRD registran el cambio.