import { z } from "zod";

import { ExtractedInvoice } from "./extraction.js";
import { ReasonCode, Verdict } from "./decision.js";

/**
 * Los tres estados de la bandeja HITL.
 *
 * No existe `CANCELADA`: la transicion es unica (`PENDIENTE -> APROBADA | NEGADA`, RI-4) y el
 * caso que hoy se llamaria "cancelada" es una `NEGADA`. Un cuarto valor abriria la puerta a
 * "reabrir" una bandeja ya resuelta, que es la forma de que el mismo ESCALAR se pague dos
 * veces.
 */
export const APPROVAL_STATUSES = ["PENDIENTE", "APROBADA", "NEGADA"] as const;
export const ApprovalStatus = z.enum(APPROVAL_STATUSES);
export type ApprovalStatus = z.infer<typeof ApprovalStatus>;

/**
 * Una fila de la bandeja HITL. Solo existe si `decisions.verdict = ESCALAR` (RI-3): `FRENAR`
 * nunca abre bandeja.
 *
 * `resolved_by`, `resolved_at` y `comment` son anulables **pero requeridos**: `PENDIENTE` los
 * tiene en null, `APROBADA` y `NEGADA` los traen. Que el esquema los exija como claves sin
 * default es lo que hace que una aprobacion sin resolver sea explicita en vez de incompleta en
 * silencio. Un `.default("")` convertiria "nadie lo resolvio" en "lo resolvio alguien sin
 * nombre", que es peor que un error de validacion porque se persiste y se muestra.
 *
 * La regla de RI-4 (que `APROBADA` traiga los tres y que no se pueda pasar de `PENDIENTE` a
 * `PENDIENTE`) es de aplicacion y la implementa el endpoint de T16, no este schema: aca solo se
 * declara la forma.
 */
export const Approval = z.object({
  id: z.string().min(1),
  decision_id: z.string().min(1),
  invoice_id: z.string().min(1),
  status: ApprovalStatus,
  requested_at: z.iso.datetime(),
  resolved_by: z.string().min(1).nullable(),
  resolved_at: z.iso.datetime().nullable(),
  comment: z.string().min(1).nullable(),
  override_with_overbudget: z.boolean(),
});
export type Approval = z.infer<typeof Approval>;

/**
 * La proyeccion que devuelven T13 y T25: no es una segunda fila, es la decision con la
 * factura y el detalle humano pegados, para que la API no obligue al cliente a dos consultas.
 *
 * No puede reinterpretar nada: `verdict`, `reason_code` y `explanation` salen del `Decision`
 * de origen intactos. Si alguno difiere, la traza esta contando una historia que no fue la que
 * se decidio.
 *
 * `invoice` se incluye entera (no un id) porque la proyeccion es read-only: el cliente la
 * necesita para mostrarla, y un `invoice_id` lo obligaria a una segunda consulta que el
 * endpoint no quiere hacer. El costo es que la proyeccion pesa mas; la alternativa pesa mas
 * para el cliente.
 *
 * `document_hash` es sha-256 en hex minusculo, la misma forma que `IngestAttempt.file_hash`.
 * La proyeccion lo replica porque la factura que se muestra tiene que poder vincularse al
 * archivo original sin una consulta mas.
 *
 * `human_approved` es tri-estado: `null` antes de que un humano responda, `true`/`false`
 * despues. No tiene default porque "nadie respondio" y "no se consulto el campo" no son lo
 * mismo, y un `.default(null)` taparia la diferencia.
 */
export const AuditRecord = z.object({
  id: z.string().min(1),
  invoice: ExtractedInvoice,
  document_hash: z.string().regex(/^[0-9a-f]{64}$/),
  amount_usd: z.number().nonnegative(),
  verdict: Verdict,
  reason_code: ReasonCode,
  explanation: z.string().min(1),
  created_at: z.iso.datetime(),
  human_approved: z.boolean().nullable(),
});
export type AuditRecord = z.infer<typeof AuditRecord>;
