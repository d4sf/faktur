import { z } from "zod";

/**
 * Las cuatro monedas que el MVP normaliza. La regla 7 compara `total_usd` contra la tasa de
 * `fx_rates`, así que una quinta moneda no tendría a dónde convertirse.
 */
export const CURRENCIES = ["USD", "MXN", "COP", "EUR"] as const;

/**
 * La moneda, **normalizada antes de validar**: `trim` y `toUpperCase` y recién después el enum.
 *
 * Sin esto un modelo que devuelve `"usd"` o `"USD "` produce un **falso FRENAR** por la regla 7
 * sobre una factura perfectamente valida, y en el demo eso se ve como un fallo del agente.
 * Exigir el case exacto es pedirle al modelo una precisión que no tiene por qué tener.
 *
 * El `.pipe()` va **despues** de la transformacion: al revés, el enum cortaria antes de
 * normalizar y `"usd"` no entraria nunca. `z.toJSONSchema` (lo que T10 le manda a Gemini)
 * reporta el resultado como enum cerrado, así que el modelo sigue viendo las cuatro.
 */
export const Currency = z.string().trim().toUpperCase().pipe(z.enum(CURRENCIES));
export type Currency = z.infer<typeof Currency>;

/**
 * Una linea del detalle. Sin validacion de que `quantity * unit_price === total`: eso lo
 * revisa el motor si decide revisarlo, y acao lo unico que interesa es que el modelo pueda
 * devolver lo que lee sin que el parser se ponga en medio.
 */
export const LineItem = z.object({
  description: z.string().trim().min(1),
  quantity: z.number().nonnegative(),
  unit_price: z.number().nonnegative(),
  total: z.number().nonnegative(),
});
export type LineItem = z.infer<typeof LineItem>;

/**
 * Los cinco campos de los que el modelo reporta confianza.
 *
 * Se nombran `CONFIDENCE_FIELDS` y no `LINE_ITEM_FIELDS`: son los campos cuya certeza se puntua,
 * no los del detalle. `LineItem` es otro tipo, con otros cuatro campos, y el nombre viejo
 *@hacia pensar que las lineas del documento son las que se puntuan.
 */
export const CONFIDENCE_FIELDS = [
  "invoice_number",
  "vendor_tax_id",
  "total_amount",
  "currency",
  "due_date",
] as const;
export type ConfidenceField = (typeof CONFIDENCE_FIELDS)[number];

const Confidence = z.number().min(0).max(1);

/**
 * La forma del objeto, tipada **contra `CONFIDENCE_FIELDS`**. El `satisfies` es lo que hace que
 * agregar un campo a la lista sin agregarlo aca sea un error de compilacion, y sacar uno
 * tambien. Cumple la misma garantía que construirlo con un `reduce` en runtime, sin el costo
 * ni con la pérdida de tipos literales que tiene.
 */
const CONFIDENCE_SHAPE = {
  invoice_number: Confidence,
  vendor_tax_id: Confidence,
  total_amount: Confidence,
  currency: Confidence,
  due_date: Confidence,
} satisfies Record<ConfidenceField, z.ZodNumber>;

/**
 * La confianza por campo, los **cinco requeridos**.
 *
 * Todos requeridos, no opcionales, por una razón práctica: si un campo falta, el motor tiene
 * que poder decir **cuál** no se leyó. Con confianza parcial no hay forma de distinguir "el
 * modelo no puntuó este campo" de "el modelo no vio este campo", y la explicacion del registro
 * pierde el unico detalle que la rubrica premia.
 *
 * Nota: el objeto entero es opcional en `ExtractedInvoice` (el modelo puede no emitirlo), pero
 * si viene, viene completo.
 */
export const FieldConfidence = z.object(CONFIDENCE_SHAPE);
export type FieldConfidence = z.infer<typeof FieldConfidence>;

/**
 * Lo que devuelve el modelo para una factura.
 *
 * **Requeridos** (§6.10): `invoice_number`, `total_amount`, `currency`. Son los que, sin ellos,
 * el motor no puede calcular nada; y `currency` requerido es ademas lo que da donde aplicarse
 * a la normalizacion de la moneda.
 *
 * `vendor_tax_id` sigue siendo **opcional a proposito**: TC-08 depende de que una factura sin
 * tax_id llegue al motor y frene en la regla 1, no de que el parser la rechace. Un schema que
 * exige el tax_id convierte el caso de prueba en un error de validación y deja la regla 1 sin
 * caso.
 *
 * `extraction_confidence` **no esta aca**: lo deriva la app con `globalConfidence` a partir del
 * minimo de los cinco. Si viviera en el schema seria un campo que el modelo podria emitir y
 * entonces la app dejaria de decidirlo.
 */
export const ExtractedInvoice = z.object({
  invoice_number: z.string().trim().min(1),
  total_amount: z.number().positive(),
  currency: Currency,

  vendor_name: z.string().trim().min(1).optional(),
  vendor_tax_id: z.string().trim().min(1).optional(),
  issue_date: z.iso.date().optional(),
  due_date: z.iso.date().optional(),
  subtotal: z.number().nonnegative().optional(),
  tax_amount: z.number().nonnegative().optional(),
  line_items: z.array(LineItem).optional(),
  field_confidence: FieldConfidence.optional(),
});
export type ExtractedInvoice = z.infer<typeof ExtractedInvoice>;

/**
 * La confianza global: el **minimo** de los cinco, o `undefined` si el modelo no emitio
 * confianza.
 *
 * Minimo y no promedio a proposito. El promedio deja pasar un campo ilegible compensado por
 * cuatro campos seguros: una fecha que el modelo no leyo con `0.3` y cuatro campos en `0.99`
 * promedian `0.85`, y la regla 1 dejaria pasar una factura que el agente no leyo bien. El
 * minimo es el unico resumen que no puede esconder el peor campo, que es el único que importa
 * cuando la pregunta es "alcanzó a leer esto".
 *
 * Devuelve `undefined` en vez de lanzar: la elección entre FRENAR y ESCALAR por confianza es
 * del motor (T5), no del parser. Este módulo dice cuál es el número; no dice qué hacer.
 */
export function globalConfidence(f: FieldConfidence | undefined): number | undefined {
  if (f === undefined) return undefined;
  return Math.min(...Object.values(f));
}

/**
 * Sanity check post-extracción: verifica que los números cuadren y las fechas
 * sean consistentes. Devuelve `{ ok: false, reason }` si algo no cierra.
 *
 * No es un freno duro: una falla escala (ALERT_LOW_CONFIDENCE) en vez de frenar,
 * porque puede ser un error de aritmética del modelo, no del documento.
 */
export function sanityCheck(e: ExtractedInvoice): { ok: boolean; reason?: string } {
  if (e.total_amount <= 0) {
    return { ok: false, reason: "el total debe ser mayor a cero" };
  }
  if (e.subtotal !== undefined && e.tax_amount !== undefined) {
    if (Math.abs(e.total_amount - (e.subtotal + e.tax_amount)) > 0.02) {
      return { ok: false, reason: "subtotal + impuesto no cuadra con el total" };
    }
  }
  if (e.issue_date !== undefined && e.due_date !== undefined && e.due_date < e.issue_date) {
    return { ok: false, reason: "la fecha de vencimiento es anterior a la de emisión" };
  }
  return { ok: true };
}
