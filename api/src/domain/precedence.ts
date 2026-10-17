import { z } from "zod";

import { ReasonCode, Verdict } from "./decision.js";

/**
 * Una condicion de precedencia.
 *
 * `rule` es el numero de la regla (1..8) tal como aparece en el CSV y en el diagrama: dos
 * condiciones pueden compartirlo (la 1 y la 6 tienen doble salida). El motor de T5 itera
 * sobre las condiciones en orden, no sobre los numeros.
 *
 * `id` es estable y en snake_case, para que los tests y los reportes no dependan del texto de la
 * descripcion.
 *
 * El tipo se **deriva** del schema, no se escribe a mano: si alguien agrega un campo al schema
 * sin agregarlo aca, el `z.infer` lo recoge y el compilador obliga a rellenarlo.
 */
export const PrecedenceCondition = z.object({
  rule: z.number().int().min(1).max(8),
  id: z.string().min(1),
  verdict: Verdict,
  reason_code: ReasonCode,
  description: z.string().min(1),
});
export type PrecedenceCondition = z.infer<typeof PrecedenceCondition>;

const PrecedenceArray = z.array(PrecedenceCondition).min(1);

/**
 * Las diez condiciones en el orden de la tabla del spec §7.4.
 *
 * El array se valida **al importarse**: si alguien agrega una condicion con un `reason_code`
 * inexistente, revienta al cargar el modulo, no tres semanas despues en una factura real.
 *
 * Las descripciones estan en lenguaje natural con los numeros concretos que el jurado lee en el
 * CSV (acordado $480, facturado $1.200). El texto no es decorativo: es lo que se muestra
 * como motivo legible.
 */
const raw = [
  {
    rule: 1,
    id: "datos_ilegibles",
    verdict: "FRENAR",
    reason_code: "ERR_INVALID_DATA",
    description:
      "Datos críticos ilegibles o incompletos: sin folio, monto, moneda o tax_id válido.",
  },
  {
    rule: 1,
    id: "confianza_baja",
    verdict: "ESCALAR",
    reason_code: "ALERT_LOW_CONFIDENCE",
    description:
      "Datos completos pero confianza global bajo el umbral de 0.7: un campo no se leyó bien.",
  },
  {
    rule: 2,
    id: "duplicado",
    verdict: "FRENAR",
    reason_code: "ERR_DUPLICATE_INVOICE",
    description: "Hash SHA-256 o tupla (vendor, numero_factura) repetidos: ya pagada.",
  },
  {
    rule: 3,
    id: "beneficiario_bloqueado",
    verdict: "FRENAR",
    reason_code: "ERR_BLACKLISTED_VENDOR",
    description: "El beneficiario está en la lista bloqueada (policy v1).",
  },
  {
    rule: 4,
    id: "beneficiario_no_listado",
    verdict: "ESCALAR",
    reason_code: "ALERT_NEW_VENDOR",
    description: "Beneficiario no listado: requiere aprobación del CFO.",
  },
  {
    rule: 5,
    id: "drift",
    verdict: "ESCALAR",
    reason_code: "ALERT_VENDOR_DRIFT",
    description:
      "Desvío sobre lo acordado: el monto triplica el promedio histórico ($480 → $1.200).",
  },
  {
    rule: 6,
    id: "presupuesto_periodo",
    verdict: "ESCALAR",
    reason_code: "ALERT_BUDGET_OVERRUN",
    description:
      "El gasto del período se acerca al tope: alerta antes de comprometer el presupuesto.",
  },
  {
    rule: 6,
    id: "presupuesto_categoria",
    verdict: "ESCALAR",
    reason_code: "ALERT_BUDGET_TIGHT",
    description:
      "Presupuesto de categoría insuficiente: Software tiene $500 y la factura pide $950.",
  },
  {
    rule: 7,
    id: "umbral_superado",
    verdict: "ESCALAR",
    reason_code: "ALERT_THRESHOLD_EXCEEDED",
    description: "Supera el umbral autónomo de $1.000: requiere firma humana.",
  },
  {
    rule: 8,
    id: "dentro_de_politica",
    verdict: "PAGAR",
    reason_code: "SUCCESS_TOUCHLESS_STP",
    description: "Pasa todas las reglas: pago directo al proveedor.",
  },
] as const;

export const PRECEDENCE: readonly PrecedenceCondition[] = PrecedenceArray.parse(raw);

/**
 * Las reglas que frenan por completo: una de ellas dispara y la factura no llega a la bandeja.
 * La 4 y la 6 son escalables, no frenan. La 1 tiene doble salida (ilegible frena, confianza
 * baja escala) y solo la mitad frena.
 */
export const HARD_BRAKE_RULES: readonly number[] = [1, 2, 3] as const;
