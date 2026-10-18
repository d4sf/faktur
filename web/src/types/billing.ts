export type PlanId = "starter" | "growth" | "scale";

export interface Plan {
  id: PlanId;
  name: string;
  price_usd: number;
  invoice_limit: number;
  extra_invoice_usd: number;
  users_included: number;
}

export interface BillingState {
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
  plans: Plan[];
}
