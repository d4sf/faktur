import type Database from "better-sqlite3";

import { DEFAULT_PLAN_ID, PLANS, getPlan, type Plan, type PlanId } from "../domain/plans.js";
import { getSetting, setSetting } from "../repositories/settings.js";

const PLAN_SETTING_KEY = "billing_plan";

export type BillingState = {
  plan: PlanId;
  plan_name: string;
  price_usd: number;
  invoice_limit: number;
  extra_invoice_usd: number;
  users_included: number;
  invoices_this_month: number;
  overage_invoices: number;
  overage_usd: number;
  month_start: string;
  plans: readonly Plan[];
};

export class BillingError extends Error {
  constructor(readonly code: "invalid_plan") {
    super(code);
    this.name = "BillingError";
  }
}

/** Primer día del mes calendario en UTC, en el mismo formato ISO que `invoices.ingested_at`. */
export function monthStart(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Estado de facturación del MVP: plan elegido + consumo del mes. No hay cobro ni facturas
 * emitidas; `overage_usd` es solo un cálculo informativo para la vista.
 */
export function getBillingState(db: Database.Database, now: Date = new Date()): BillingState {
  const stored = getSetting(PLAN_SETTING_KEY, db);
  const plan = (stored === null ? undefined : getPlan(stored)) ?? getPlan(DEFAULT_PLAN_ID)!;
  const month_start = monthStart(now);

  const { count } = db
    .prepare("SELECT COUNT(*) AS count FROM invoices WHERE ingested_at >= ?")
    .get(month_start) as { count: number };

  const overageInvoices = Math.max(0, count - plan.invoice_limit);

  return {
    plan: plan.id,
    plan_name: plan.name,
    price_usd: plan.price_usd,
    invoice_limit: plan.invoice_limit,
    extra_invoice_usd: plan.extra_invoice_usd,
    users_included: plan.users_included,
    invoices_this_month: count,
    overage_invoices: overageInvoices,
    overage_usd: round2(overageInvoices * plan.extra_invoice_usd),
    month_start,
    plans: PLANS,
  };
}

/** `plan` es `string` a propósito: el valor llega de HTTP sin validar y se valida acá. */
export function setBillingPlan(
  db: Database.Database,
  plan: string,
  now: Date = new Date(),
): BillingState {
  const found = getPlan(plan);
  if (found === undefined) throw new BillingError("invalid_plan");
  setSetting(PLAN_SETTING_KEY, found.id, db);
  return getBillingState(db, now);
}
