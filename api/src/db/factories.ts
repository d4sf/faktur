import { randomUUID } from "node:crypto";

import type Database from "better-sqlite3";

const NOW = "2026-10-17T00:00:00Z";

let seq = 0;

/**
 * Contador module-level para los valores únicos (`tax_id`, `file_hash`,
 * `invoice_number`, nombres de archivo). Arranca en 1 y nunca se resetea:
 * dos factories sin override no pueden violar un UNIQUE.
 */
export function nextSeq(): number {
  seq += 1;
  return seq;
}

export interface VendorRow {
  id: string;
  tax_id: string;
  display_name: string;
  category: string;
  status: "ALLOWLISTED" | "BLOCKLISTED";
  historical_avg_usd: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
}

export interface InvoiceRow {
  id: string;
  vendor_id: string | null;
  invoice_number: string | null;
  status:
    | "RECIBIDA"
    | "EXTRAIDA"
    | "DECIDIDA"
    | "PENDIENTE_APROBACION"
    | "APROBADA"
    | "NEGADA"
    | "FRENADA";
  file_name: string;
  mime_type: string;
  file_hash: string;
  issue_date: string | null;
  due_date: string | null;
  currency: string;
  subtotal: number | null;
  tax_amount: number | null;
  total_amount: number;
  fx_rate_used: number;
  total_usd: number;
  extraction_confidence: number | null;
  extraction_json: string;
  ingested_at: string;
}

export interface LineItemRow {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface IngestAttemptRow {
  id: string;
  invoice_id: string | null;
  file_name: string;
  mime_type: string;
  byte_size: number;
  file_hash: string;
  attempt_status: "RECIBIDA" | "DUPLICADA" | "RECHAZADA";
  duplicate_of_invoice_id: string | null;
  submitted_at: string;
}

export interface DecisionRow {
  id: string;
  invoice_id: string | null;
  ingest_attempt_id: string | null;
  verdict: "PAGAR" | "FRENAR" | "ESCALAR";
  reason_code: string;
  explanation: string;
  policy_version: string;
  amount_usd_evaluated: number;
  decided_by: "AGENTE" | "HUMANO";
  decided_at: string;
}

export interface ApprovalRow {
  id: string;
  decision_id: string;
  invoice_id: string;
  status: "PENDIENTE" | "APROBADA" | "NEGADA";
  requested_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  comment: string | null;
  override_with_overbudget: number;
}

/**
 * Descarta las claves con valor `undefined`: better-sqlite3 lanza `TypeError` si
 * las recibe y `Partial<Row>` permite pasarlas.
 */
function compact<T extends object>(overrides?: Partial<T>): Partial<T> {
  if (!overrides) return {};
  return Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function insert<T extends object>(
  db: Database.Database,
  table: string,
  defaults: T,
  overrides?: Partial<T>,
): T {
  const row = { ...defaults, ...compact(overrides) } as T;
  const columns = Object.keys(row);
  const placeholders = columns.map(() => "?").join(", ");

  db.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`).run(
    ...Object.values(row),
  );

  return row;
}

export function vendorFactory(db: Database.Database, overrides?: Partial<VendorRow>): VendorRow {
  const n = nextSeq();
  const defaults: VendorRow = {
    id: randomUUID(),
    tax_id: `FACTORY-TAX-${n}`,
    display_name: `Factory Vendor ${n}`,
    category: "Infraestructura",
    status: "ALLOWLISTED",
    historical_avg_usd: 0,
    first_seen_at: NOW,
    last_seen_at: NOW,
  };

  return insert(db, "vendors", defaults, overrides);
}

export function invoiceFactory(db: Database.Database, overrides?: Partial<InvoiceRow>): InvoiceRow {
  const effective = compact(overrides);
  const n = nextSeq();
  const vendorId = effective.vendor_id === undefined ? vendorFactory(db).id : effective.vendor_id;
  const defaults: InvoiceRow = {
    id: randomUUID(),
    vendor_id: vendorId,
    invoice_number: `FACT-${n}`,
    status: "RECIBIDA",
    file_name: `invoice-${n}.json`,
    mime_type: "application/json",
    file_hash: `hash-${n}`,
    issue_date: null,
    due_date: null,
    currency: "USD",
    subtotal: null,
    tax_amount: null,
    total_amount: 100,
    fx_rate_used: 1,
    total_usd: 100,
    extraction_confidence: null,
    extraction_json: "{}",
    ingested_at: NOW,
  };

  return insert(db, "invoices", defaults, effective);
}

export function lineItemFactory(
  db: Database.Database,
  overrides?: Partial<LineItemRow>,
): LineItemRow {
  const effective = compact(overrides);
  const n = nextSeq();
  const invoiceId =
    effective.invoice_id === undefined ? invoiceFactory(db).id : effective.invoice_id;
  const defaults: LineItemRow = {
    id: randomUUID(),
    invoice_id: invoiceId,
    description: `Line item ${n}`,
    quantity: 1,
    unit_price: 100,
    total: 100,
  };

  return insert(db, "line_items", defaults, effective);
}

export function ingestAttemptFactory(
  db: Database.Database,
  overrides?: Partial<IngestAttemptRow>,
): IngestAttemptRow {
  const n = nextSeq();
  const defaults: IngestAttemptRow = {
    id: randomUUID(),
    invoice_id: null,
    file_name: `attempt-${n}.json`,
    mime_type: "application/json",
    byte_size: 128,
    file_hash: `attempt-hash-${n}`,
    attempt_status: "RECIBIDA",
    duplicate_of_invoice_id: null,
    submitted_at: NOW,
  };

  return insert(db, "ingest_attempts", defaults, overrides);
}

function invoiceTotalUsd(db: Database.Database, invoiceId: string): number {
  const row = db.prepare("SELECT total_usd FROM invoices WHERE id = ?").get(invoiceId) as
    { total_usd: number } | undefined;
  return row?.total_usd ?? 100;
}

export function decisionFactory(
  db: Database.Database,
  overrides?: Partial<DecisionRow>,
): DecisionRow {
  const effective = compact(overrides);
  const usesIngestAttempt =
    effective.ingest_attempt_id !== undefined && effective.ingest_attempt_id !== null;

  let invoiceId: string | null;
  if (usesIngestAttempt) {
    // CHECK XOR: una decisión cuelga de la factura o del intento de ingesta, no de ambos.
    invoiceId = null;
  } else if (effective.invoice_id !== undefined) {
    invoiceId = effective.invoice_id;
  } else {
    invoiceId = invoiceFactory(db).id;
  }

  const amountUsdEvaluated =
    effective.amount_usd_evaluated !== undefined
      ? effective.amount_usd_evaluated
      : invoiceId === null
        ? 100
        : invoiceTotalUsd(db, invoiceId);

  const defaults: DecisionRow = {
    id: randomUUID(),
    invoice_id: invoiceId,
    ingest_attempt_id: null,
    verdict: "PAGAR",
    reason_code: "SUCCESS_TOUCHLESS_STP",
    explanation: "Factory decision",
    policy_version: "v1",
    amount_usd_evaluated: amountUsdEvaluated,
    decided_by: "AGENTE",
    decided_at: NOW,
  };

  return insert(db, "decisions", defaults, effective);
}

export function approvalFactory(
  db: Database.Database,
  overrides?: Partial<ApprovalRow>,
): ApprovalRow {
  const effective = compact(overrides);

  let decisionId = effective.decision_id;
  let invoiceId = effective.invoice_id;

  if (decisionId === undefined) {
    const decision = decisionFactory(db);
    decisionId = decision.id;
    if (invoiceId === undefined) {
      invoiceId = decision.invoice_id ?? invoiceFactory(db).id;
    }
  } else if (invoiceId === undefined) {
    const stored = db.prepare("SELECT invoice_id FROM decisions WHERE id = ?").get(decisionId) as
      { invoice_id: string | null } | undefined;
    invoiceId = stored?.invoice_id ?? invoiceFactory(db).id;
  }

  const defaults: ApprovalRow = {
    id: randomUUID(),
    decision_id: decisionId,
    invoice_id: invoiceId as string,
    status: "PENDIENTE",
    requested_at: NOW,
    resolved_by: null,
    resolved_at: null,
    comment: null,
    override_with_overbudget: 0,
  };

  return insert(db, "approvals", defaults, effective);
}
