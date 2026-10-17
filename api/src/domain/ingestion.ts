import { z } from "zod";

/**
 * Los tres desenlaces de un intento de ingesta.
 *
 * `DUPLICADA` no es "rechazada": es un intento legítimo que resultó ser un reenvío. Por eso
 * guarda `duplicate_of_invoice_id` para que quede **auditable** — la regla 2 frena la factura,
 * pero el intento que la frenó sigue existiendo y se puede mostrar en la traza.
 */
export const ATTEMPT_STATUSES = ["RECIBIDA", "DUPLICADA", "RECHAZADA"] as const;
export const AttemptStatus = z.enum(ATTEMPT_STATUSES);
export type AttemptStatus = z.infer<typeof AttemptStatus>;

/**
 * SHA-256 en hex **minusculo**, 64 caracteres.
 *
 * El `regex` es la primera barrera contra un archivo con el hash mal formado, y `file_hash` es
 * la clave del dedup de la regla 2. Fijar minusculas en el contrato evita que la comparacion
 * falle por case y pague dos veces: si el extractor escribiera mayusculas y el motor comparara
 * contra minusculas, `===` daria `false` para un archivo identico y la factura pasaria como
 * nueva. El test de las mayusculas cubre exactamente eso.
 */
const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * Un intento de ingesta: la puerta de entrada, antes de que exista una factura.
 *
 * `invoice_id` y `duplicate_of_invoice_id` son anulables porque un intento `RECIBIDA` todavia
 * no está anclado a ninguna. Los dos son **requeridos sin default** por el mismo motivo que en
 * `Decision`: que falten tiene que ser un error de validacion, no un null silencioso que
 * alguien lea como "no duplicada".
 */
export const IngestAttempt = z.object({
  file_name: z.string().trim().min(1),
  mime_type: z.string().trim().min(1),
  byte_size: z.number().int().nonnegative(),
  file_hash: z.string().regex(SHA256_HEX),
  attempt_status: AttemptStatus,
  invoice_id: z.string().min(1).nullable(),
  duplicate_of_invoice_id: z.string().min(1).nullable(),
});
export type IngestAttempt = z.infer<typeof IngestAttempt>;
