# Integración con Slack (webhook) — Design Spec

> **Fecha:** 2026-10-17
> **Feature:** Parte 2 del feature "Explicación con IA": enviar un mensaje a un canal de Slack cuando una factura se escala a un humano o es rechazada por un humano.

## Decisión de producto

- La URL del incoming webhook de Slack se configura en runtime desde una pantalla "Integraciones" y se persiste en la tabla `settings` (key/value). Tiene precedencia sobre la env var `NOTIFIER_WEBHOOK_URL`.
- El webhook se dispara en tres casos: ESCALAR (pendiente de aprobación), NEGADA (rechazo humano) y FRENAR (bloqueo automático por reglas, incluidos los reenvíos duplicados). No en PAGAR.
- El mensaje es un `text` simple de Slack con factura, proveedor, monto, motivo y (si existe) la explicación con IA cacheada. No se llama al modelo en el camino crítico.
- Se reutiliza el outbox (`notifications`) y el patrón fire-and-forget: un webhook caído queda `FALLIDA` y no revierte la decisión.

## Alcance

- Tabla `settings` + repositorio.
- Servicio `integrations.ts` (validar https, guardar/borrar/probar).
- `SlackNotifier` + `defaultNotifier(db)` con precedencia settings → env → consola.
- Notificación en NEGADA dentro de `resolveApproval` (dispatch fuera de la transacción).
- Endpoints `GET/PUT/DELETE /api/integrations/slack` y `POST /api/integrations/slack/test`.
- Página `/integraciones` con formulario, botón de prueba y estado.

## Fuera de alcance

- Múltiples URLs, reintentos automáticos, Block Kit rico, autenticación.
- No se edita el PRD original: se registra como funcionalidad post-MVP en su tabla de "Decisiones posteriores" y en el backlog.

## Relación con "Explicación con IA"

Es la parte 2 del mismo feature: el mensaje de Slack reutiliza la explicación con IA **solo si ya está cacheada** en `ai_explanations`. Si no lo está, envía solo el motivo determinista.