# Mejora de precisión en extracción — Design Spec

> **Fecha:** 2026-10-18
> **Feature:** Reducir la imprecisión del prompt de extracción de facturas (campos faltantes, valores incorrectos, alucinaciones, fechas/moneda mal normalizadas).

## Decisión de producto

- **Prompt engineering**: prompt detallado con instrucciones por campo, reglas de normalización explícitas y un ejemplo completo (few-shot).
- **Schema tightening**: `field_confidence` obligatorio cuando el modelo emite confianza; validaciones de rango (montos ≥ 0, fechas ISO válidas); `additionalProperties: false` en el schema de Gemini.
- **Retry con feedback**: si la validación Zod falla, un reintento con el error en el prompt. Si falla de nuevo, fail-closed (FRENAR).
- **Instrucciones para scans**: prompt específico para documentos escaneados + `mediaResolution` alto en el config de Gemini.
- **Sanity checks post-extracción**: `total_amount === subtotal + tax_amount` (si ambos presentes), `due_date >= issue_date`, `total_amount > 0`. Si fallan → ESCALAR (no FRENAR), motivo "los números no cuadran".
- **Logging del raw response**: guardar la respuesta cruda del modelo (truncada) en `extraction_raw` para re-auditar sin re-llamar.
- **Mantener `temperature: 0`**: determinista para extracción estructurada.

## Alcance

### 1. Prompt mejorado (`PROMPT` en `extract.ts`)

Reemplazar el prompt actual por uno con:
- Rol y tarea claros.
- Instrucciones por campo (qué buscar, dónde suele estar).
- Reglas de normalización: fechas → YYYY-MM-DD, moneda → ISO code (USD/MXN/COP/EUR) uppercase, montos → número sin símbolos.
- Instrucciones para scans: "si el documento está escaneado o es una foto, lee con cuidado las cifras manuscritas o impresas con baja calidad".
- Few-shot: un ejemplo completo de factura → JSON.
- Prohibición de inventar: "si un campo no está, omitilo; nunca inventes montos ni fechas".
- `field_confidence` obligatorio: "reportá confianza 0–1 para los 5 campos".

### 2. Schema tightening (`extraction.ts`)

- `field_confidence` sigue opcional en `ExtractedInvoice` (el modelo puede no emitirlo), pero si viene, viene completo (ya es así).
- Agregar validación de rango: `total_amount` > 0 (`.positive()` o `.min(0.01)`), `subtotal`/`tax_amount` ≥ 0.
- Fechas: `z.iso.date()` ya valida formato.
- En `geminiSchema.ts` / `toGeminiResponseSchema`: pasar `additionalProperties: false` si es posible (Zod 4 lo hace por defecto para objetos estrictos). Verificar.

### 3. Retry con feedback (`extractInvoice`)

- Si `ExtractedInvoice.safeParse` falla, reenviar al modelo con un segundo prompt que incluya el error: "tu respuesta anterior falló la validación por: <errores>. Corregila y devolvé solo el JSON".
- Máximo 1 reintento. Si falla de nuevo → `ExtractionInvalidError`.
- El reintento usa el mismo `temperature: 0` y schema.

### 4. `mediaResolution` para imágenes

- En el config del caller, agregar `mediaResolution: "high"` (si la API lo soporta para la generación usada). Verificar compatibilidad.
- Si no se soporta, documentar y omitir.

### 5. Sanity checks post-extracción (`persistExtraction`)

- Después de parsear, antes de insertar, verificar:
  - Si `subtotal` y `tax_amount` presentes: `|total_amount - (subtotal + tax_amount)| < 0.02` (tolerancia de redondeo).
  - Si `issue_date` y `due_date` presentes: `due_date >= issue_date`.
  - `total_amount > 0`.
- Si falla algún check → marcar la factura como `EXTRAIDA` pero con un flag, y al decidir, el motor la escala con `ALERT_LOW_CONFIDENCE`? O un nuevo reason_code? Decisión: agregar sanity check como parte de la regla 1 (datos críticos). Si los números no cuadran → ESCALAR con `ALERT_LOW_CONFIDENCE` y motivo "los montos no cuadran: subtotal + impuesto ≠ total". 

  Actually, para no inventar reason_codes nuevos, usar `ALERT_LOW_CONFIDENCE` con un mensaje específico. O mejor: agregar `ERR_INVALID_DATA`? No, eso es FRENAR. El usuario pidió ESCALAR. Usar `ALERT_LOW_CONFIDENCE` con motivo descriptivo.

### 6. Logging del raw response

- Agregar columna `extraction_raw TEXT` a `invoices` (o guardar en `ingest_attempts`). Decisión: columna `extraction_raw` en `invoices`, truncada a 4000 chars.
- Migración en `applySchema` (ALTER TABLE ADD COLUMN, patrón existente).

### 7. Actualizar tests

- `extract.test.ts`: tests del retry, sanity checks, prompt (verificar que se manda temperature 0 y schema).
- `schema.test.ts`: conteo de columnas / tablas.

## Fuera de alcance

- OCR propio (PRD lo excluye).
- Pre-procesamiento de imagen con `sharp`/`jimp`.
- Cambio de modelo (sigue `GEMINI_MODEL`).
- Multi-pase de extracción (un solo reintento máximo).

## Verificación

- `npm test` (api) pasa.
- Typecheck + build OK.
- Test manual con un PDF escaneado: la extracción mejora (menos campos faltantes).