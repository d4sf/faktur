import { z } from "zod";

/**
 * Los tres veredictos del agente. El orden del enum es el del backlog §5: PAGAR es el
 * caminofeliz y FRENAR/ESCALAR divergen segun si el motivo es dato faltante o regla de
 * negocio. El motor (T5) los recorre en la tabla de precedencia, no en este orden.
 */
export const VERDICTS = ["PAGAR", "FRENAR", "ESCALAR"] as const;
export const Verdict = z.enum(VERDICTS);
export type Verdict = z.infer<typeof Verdict>;

/**
 * Los diez `reason_code` canonicos del ER 2.8.1.
 *
 * No son los nueve del Apendice A del PRD: falta `ALERT_LOW_CONFIDENCE` (la rama ESCALAR de
 * la regla 1) y sobra `ERR_BUDGET_OVERRUN`, que en este diseno no frena sino que escala con
 * `ALERT_BUDGET_OVERRUN`. La distincion importa porque el veredicto es parte del codigo: un
 * mismo motivo con FRENAR abre la carpeta del operador y con ESCALAR abre la bandeja HITL.
 *
 * El test afirma que `ERR_BUDGET_OVERRUN` no aparezca, porque volver a meterlo seria el
 * error de reverso: el enum tiene que seguir describiendo el motor, no el nombre que sugiera
 * la severidad.
 */
export const REASON_CODES = [
  "SUCCESS_TOUCHLESS_STP",
  "ERR_INVALID_DATA",
  "ALERT_LOW_CONFIDENCE",
  "ERR_DUPLICATE_INVOICE",
  "ERR_BLACKLISTED_VENDOR",
  "ALERT_NEW_VENDOR",
  "ALERT_VENDOR_DRIFT",
  "ALERT_BUDGET_OVERRUN",
  "ALERT_BUDGET_TIGHT",
  "ALERT_THRESHOLD_EXCEEDED",
] as const;
export const ReasonCode = z.enum(REASON_CODES);
export type ReasonCode = z.infer<typeof ReasonCode>;

/**
 * Los siete estados de `diagramas/estados_factura.mmd`.
 *
 * Sin tilde a propósito: en T3 cada valor es un `CHECK` de SQLite, y `PENDIENTE_APROBACION` es
 * un identificador con el que nadie quiere trabajar. El diagrama escribe `extraida` con tilde
 * porque es un diagrama; el codigo manda y el ER se corrige en Task 6.
 */
export const INVOICE_STATUSES = [
  "RECIBIDA",
  "EXTRAIDA",
  "DECIDIDA",
  "PENDIENTE_APROBACION",
  "APROBADA",
  "NEGADA",
  "FRENADA",
] as const;
export const InvoiceStatus = z.enum(INVOICE_STATUSES);
export type InvoiceStatus = z.infer<typeof InvoiceStatus>;

/**
 * Un veredicto. `decisions` es append-only (ER RI-8): la resolucion humana no reescribe
 * `explanation` de esta fila, escribe una nueva en `approvals` y mueve `invoices.status`.
 *
 * `ingest_attempt_id` es anulable **y sin default**. Una decision normal no lo tiene; la de un
 * reenvio duplicado si, para que la fila se pueda anclar al intento que la produjo. Un
 * `.default(null)` aca esconderia el error de olvidarse de pasarlo: el registro seria valido y
 * la trazabilidad, invalida.
 *
 * `explanation` es string no vacia porque una decision sin motivo legible es exactamente lo que
 * penaliza la rubrica, y un `.default("")` dejaría pasar el caso peor sin señalarlo.
 */
export const Decision = z.object({
  invoice_id: z.string().min(1),
  ingest_attempt_id: z.string().min(1).nullable(),
  verdict: Verdict,
  reason_code: ReasonCode,
  explanation: z.string().min(1),
  policy_version: z.string().min(1),
  amount_usd_evaluated: z.number().nonnegative(),
  decided_by: z.enum(["AGENTE", "HUMANO"]),
});
export type Decision = z.infer<typeof Decision>;
