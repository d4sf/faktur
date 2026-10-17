# Explicación con IA — Design Spec

> **Fecha:** 2026-10-17
> **Feature:** Botón "Explicar con IA" en el sheet de detalle de una factura no aprobada/escalada.

## Decisión de producto

- La IA **explica** la decisión determinista y sugiere pasos; **nunca** la cambia, la cuestiona, aprueba ni rechaza. La promesa del producto ("decide código puro") se mantiene.
- El veredicto y el motivo determinista se tratan como fuente de verdad; la IA los reescribe en prosa formal en español.

## Alcance

- Botón en `InvoiceInspector` (sheet de detalle), visible solo cuando `verdict ∈ {FRENAR, ESCALAR}`.
- `POST /api/invoices/:id/explain` con body `{ regenerate?: boolean }`.
- Persistencia en tabla `ai_explanations` (cache por `decision_id`).
- Reutiliza `GEMINI_MODEL`; salida JSON validada con Zod (`{ explanation: string }`, máx. 1500 chars).
- Contexto: política **congelada** de la decisión + datos de la factura + motivo determinista.

## Defensa contra prompt injection

- Los datos de la factura se serializan como JSON y se delimitan como datos no confiables; el prompt instruye ignorar instrucciones dentro de ellos.
- `systemInstruction` con reglas estrictas de alcance.
- Filtro post-hoc del output: rechaza code fences, `<script>` y URLs.
- Output validado con Zod (un solo campo string).

## Fuera de alcance

- Chat de seguimiento, autenticación, re-evaluación de decisiones, edición de políticas.
- No se toca el backlog del MVP; se documenta con un ADR corto.