/**
 * @file plans.ts
 * @description Planes comerciales estáticos del MVP. Son la única fuente de verdad de precios
 * y límites: el web los consume desde `GET /api/billing` en lugar de duplicarlos.
 */

export type PlanId = "starter" | "growth" | "scale";

export type Plan = {
  id: PlanId;
  name: string;
  price_usd: number;
  invoice_limit: number;
  extra_invoice_usd: number;
  users_included: number;
};

export const PLANS: readonly Plan[] = [
  {
    id: "starter",
    name: "Starter",
    price_usd: 99,
    invoice_limit: 100,
    extra_invoice_usd: 0.5,
    users_included: 3,
  },
  {
    id: "growth",
    name: "Growth",
    price_usd: 299,
    invoice_limit: 500,
    extra_invoice_usd: 0.35,
    users_included: 10,
  },
  {
    id: "scale",
    name: "Scale",
    price_usd: 799,
    invoice_limit: 2000,
    extra_invoice_usd: 0.25,
    users_included: 25,
  },
];

export const DEFAULT_PLAN_ID: PlanId = "growth";

export function getPlan(id: string): Plan | undefined {
  return PLANS.find((plan) => plan.id === id);
}
