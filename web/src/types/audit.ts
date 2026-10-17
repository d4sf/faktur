export type Verdict = "PAGAR" | "FRENAR" | "ESCALAR";

export type AuditEstado = "PAGADA" | "FRENADA" | "ESCALADA" | "PENDIENTE";

export interface AuditInvoice {
  invoice_number: string;
  vendor_name?: string;
  vendor_tax_id?: string;
  issue_date?: string;
  due_date?: string;
  currency: string;
  total_amount: number;
  total_usd: number;
}

export interface AuditRecordView {
  id: string;
  invoice_id: string;
  invoice: AuditInvoice;
  document_hash: string;
  amount_usd: number;
  verdict: Verdict;
  reason_code: string;
  explanation: string;
  created_at: string;
  human_approved: boolean | null;
  estado: AuditEstado;
}

export interface AuditMetrics {
  budget_remaining: number;
  threshold_limit: number;
  total_processed: number;
  touchless_rate: number;
}

export interface AuditTrail {
  metrics: AuditMetrics;
  records: AuditRecordView[];
}

export interface TimelineEvent {
  type: "INGESTA" | "EXTRACCION" | "DECISION" | "RESOLUCION";
  at: string;
  detail: string;
}

export interface AuditDetail {
  record: AuditRecordView;
  timeline: TimelineEvent[];
  resolution: {
    resolved_by: string;
    resolved_at: string;
    comment: string | null;
  } | null;
}
