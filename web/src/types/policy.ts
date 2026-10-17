export interface PolicySpec {
  version: string;
  auto_approval_threshold_usd: number;
  monthly_budget_usd: number;
  vendor_drift_factor: number;
  min_extraction_confidence: number;
  allowed_currencies: string[];
  category_budgets: Record<string, number>;
  created_at: string;
  created_by: string;
  comment: string;
}

export interface AffectedInvoice {
  invoice_id: string;
  before: "PAGAR" | "FRENAR" | "ESCALAR";
  after: "PAGAR" | "FRENAR" | "ESCALAR";
  reason_code: string;
}

export interface CandidatePolicy {
  auto_approval_threshold_usd: number;
  monthly_budget_usd: number;
  vendor_drift_factor: number;
  min_extraction_confidence: number;
  allowed_currencies: string[];
  category_budgets: Record<string, number>;
  created_at: string;
  created_by: string;
  comment: string;
}
