import { z } from "zod";

import { ExtractedInvoice } from "./extraction.js";

type ToJSONSchemaParams = Parameters<typeof z.toJSONSchema>[1];

/**
 * Wrapper delgado sobre `z.toJSONSchema` para el subconjunto que la API de Gemini acepta.
 *
 * Tres cosas verificadas que condicionan la implementación:
 *
 * - **`$schema` se quita.** `z.toJSONSchema` lo emite en la raíz, y los ejemplos de la
 *   documentación de Google no lo mandan. Una linea, y es seguro mandarlo o no.
 * - **`.trim()` no sobrevive la conversión.** `toJSONSchema` solo conserva `minLength`. No es
 *   problema: el `.trim()` es de validacion en runtime, no de generacion, y el modelo no
 *   necesita saberlo.
 * - **El default de Zod 4 es `reused: "inline"`.** Un objeto anidado usado una o varias veces se
 *   inlinea y no aparecen `$defs` ni `$ref`. Para producir `$defs` de verdad hay que pedirlo
 *   explícitamente con `{ reused: "ref" }` o registrar un id con `.meta({ id: "..." })`.
 *
 * **No** es un conversor general de JSON Schema. Si el schema producido trae `$defs` (o un
 * `$ref` que no sea `"#"`), la funcion lanza nombrando el problema en vez de devolver algo que
 * la API va a rechazar tres saltos más adelante.
 *
 * Sin argumento, delega en `ExtractedInvoice`: esa es la firma que usa T10.
 */
export function toGeminiResponseSchema(
  schema?: z.ZodType,
  options?: ToJSONSchemaParams,
): Record<string, unknown> {
  const target = schema ?? ExtractedInvoice;
  const json = z.toJSONSchema(target, options ?? {}) as Record<string, unknown>;

  delete json.$schema;

  if ("$defs" in json) {
    throw new Error(
      "el schema producido contiene $defs, que la API de Gemini no acepta; revisa el schema de entrada",
    );
  }

  const serialized = JSON.stringify(json);
  if (serialized.includes('"$ref"')) {
    throw new Error(
      "el schema producido contiene $ref, que la API de Gemini no acepta; revisa el schema de entrada",
    );
  }

  return json;
}
