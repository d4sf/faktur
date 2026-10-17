import { z } from "zod";

import { CURRENCIES } from "./extraction.js";

/**
 * Las seis categorías de gasto que consumen presupuesto.
 *
 * Sin tilde por §6.5 / §7.2: van a ser claves de un `z.record` y claves de JSON, y un CHECK de
 * SQLite en T3. `Diseño` con tilde no es un identificador con el que nadie quiera trabajar,
 * y los fixtures escriben `Diseno`.
 */
export const CATEGORIES = [
  "Infraestructura",
  "Diseno",
  "Marketing",
  "Legal",
  "Software",
  "Retail",
] as const;
export const Category = z.enum(CATEGORIES);
export type Category = z.infer<typeof Category>;

/**
 * La politica v1 congelada.
 *
 * `category_budgets` es `z.record(Category, z.number().nonnegative())`, que **exige** los seis
 * presupuestos: una categoria sin presupuesto hace fallar la validación en vez de leerse como
 * cero. Cero explicito (Retail) es distinto de "no declarado", y el test de la categoria
 * desconocida lo aprovecha.
 *
 * `version` con regex `/^v\d+$/`: un cambio de default es una versión nueva, no un edit.
 * `loadPolicySpec` cachea el resultado, asi que cambiar el JSON sin reiniciar no surte efecto.
 */
export const PolicySpec = z.object({
  version: z.string().regex(/^v\d+$/),
  created_at: z.iso.date(),
  created_by: z.string().min(1),
  comment: z.string().min(1),
  auto_approval_threshold_usd: z.number().nonnegative(),
  monthly_budget_usd: z.number().nonnegative(),
  vendor_drift_factor: z.number().positive(),
  min_extraction_confidence: z.number().min(0).max(1),
  allowed_currencies: z.array(z.enum(CURRENCIES)).nonempty(),
  category_budgets: z.record(Category, z.number().nonnegative()),
});
export type PolicySpec = z.infer<typeof PolicySpec>;

/**
 * Valida un candidato sin tocar el archivo congelado. Separarla de `loadPolicySpec` es lo que
 * permite probar el rechazo de una categoría desconocida sin modificar `specs/policy.spec.json`.
 */
export function parsePolicySpec(raw: unknown): z.ZodSafeParseResult<PolicySpec> {
  return PolicySpec.safeParse(raw);
}

/**
 * Carga y cachea la politica congelada.
 *
 * El import con `with { type: "json" }` no es opcional: sin el atributo, el build falla con
 * TS1543. Tres niveles arriba desde `api/src/domain/`: el archivo vive en `specs/`.
 *
 * Si el JSON está mal, el error nombra `specs/policy.spec.json` y el campo, con el mismo
 * formato de listado que usa `config/env.ts`. Un JSON congelado que no valida al arrancar es
 * peor que no tenerlo: se mostraría como "politica v1" y pagaría con datos rotos.
 */
import rawSpec from "../../../specs/policy.spec.json" with { type: "json" };

let cached: PolicySpec | undefined;

export function loadPolicySpec(): PolicySpec {
  if (cached !== undefined) return cached;
  const result = PolicySpec.safeParse(rawSpec);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`specs/policy.spec.json: ${issues}`);
  }
  cached = result.data;
  return cached;
}
