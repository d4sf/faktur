/**
 * @file invoice.ts
 * @description Definición de tipos y estructuras de datos para las facturas y el flujo de revisión.
 */

export type Verdict = "PAGAR" | "FRENAR" | "ESCALAR";

export type FlowState = "IDLE" | "PROCESSING" | "COMPLETED";

export interface InvoiceData {
  id: string;
  fileName: string;
  fileSize: string;
  invoice_number: string;
  vendor_name: string;
  vendor_tax_id: string;
  issue_date: string;
  due_date: string;
  currency: string;
  total_amount: number;
  total_usd: number;
  concept: string;
  verdict: Verdict;
  reason_code: string;
  reason_description: string;
  failingRuleId?: number;
  resolved_status?: "APROBADO_HUMANO" | "RECHAZADO_HUMANO";
  resolved_reason?: string;
  resolved_at?: string;
  approvalId?: string;
}

export interface SystemRule {
  id: number;
  label: string;
  name: string;
}

export interface PendingApproval {
  id: string;
  invoice_id: string;
  vendor_name: string | null;
  amount_usd: number;
  reason_code: string;
  explanation: string;
  requested_at: string;
}

export interface AuditMetricsData {
  budget_remaining: number;
  threshold_limit: number;
  total_processed: number;
  touchless_rate: number;
}
