# ADR 0003 — Explicación con IA

**Estado:** Aceptado
**Fecha:** 2026-10-17

## Contexto

El producto promete que la decisión (PAGAR / FRENAR / ESCALAR) la toma un motor de reglas determinista y que el LLM solo extrae datos. Aun así, los motivos deterministas (`reason_code` + `explanation`) pueden resultar técnicos para un operador. Se agrega una funcionalidad post-MVP que genera, bajo demanda, una explicación en lenguaje natural.

## Decisión

- La IA **explica** la decisión ya tomada y sugiere 1–3 pasos concretos; **nunca** la cambia, la cuestiona, aprueba ni rechaza.
- El veredicto y el motivo determinista son la fuente de verdad; la IA los reescribe en prosa formal en español.
- Se expone como `POST /api/invoices/:id/explain` con `{ regenerate?: boolean }`, solo para facturas con veredicto FRENAR o ESCALAR.
- Se persiste en `ai_explanations`, cacheada por `decision_id` (si la factura se re-evalúa, la explicación vieja no se sirve).
- Se reutiliza `GEMINI_MODEL` (default `gemini-3.8-flash`); no se agrega una variable de entorno nueva.
- La salida es JSON validado con Zod (`{ explanation: string }`, máx. 1500 caracteres) y se aplican defensas contra prompt injection: datos delimitados como no confiables, `systemInstruction` estricto, filtro post-hoc (code fences, `<script>`, URLs).

## Consecuencias

- Nueva tabla `ai_explanations` y su migración en `schema.ts`; documentada en `er.dbml`, `er.mmd` y `propuesta_modelo_ER_faktur.md`.
- El motor determinista no se toca; la promesa del producto se mantiene.
- Costo adicional por factura explicada, mitigado por la caché.