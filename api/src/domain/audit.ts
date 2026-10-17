import { z } from "zod";

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
