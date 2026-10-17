import type Database from "better-sqlite3";

/**
 * Columnas exactas del MVP §7. Una fila por decisión, no por factura: una re-evaluación o un
 * reenvío duplicado aportan su propia fila (S19).
 */
export const REPORT_COLUMNS = [
  "invoice_id",
  "archivo",
  "proveedor",
  "beneficiario_id",
  "monto",
  "moneda",
  "fecha_vencimiento",
  "estado",
  "regla_disparada",
  "motivo_legible",
  "requirio_humano",
  "decidido_por",
  "policy_version",
  "timestamp",
] as const;

/**
 * Nombre fechado del reporte (UTC): así dos descargas de días distintos no se pisan y el
 * archivo que ve el jurado dice cuándo se generó.
 */
export function reportFileName(now: Date = new Date()): string {
  return `faktur-report-${now.toISOString().slice(0, 10)}.csv`;
}

type ReportRow = {
  decision_id: string;
  invoice_id: string | null;
  ingest_attempt_id: string | null;
  verdict: "PAGAR" | "FRENAR" | "ESCALAR";
  reason_code: string;
  explanation: string;
  policy_version: string;
  decided_by: string;
  decided_at: string;
  invoice_status: string | null;
  file_name: string | null;
  currency: string | null;
  total_amount: number | null;
  due_date: string | null;
  vendor_name: string | null;
  vendor_tax_id: string | null;
  attempt_file_name: string | null;
  canonical_invoice_id: string | null;
  canonical_ingested_at: string | null;
  extraction_json: string | null;
  approval_status: string | null;
};

const QUERY = `
  SELECT
    d.id AS decision_id,
    d.invoice_id AS invoice_id,
    d.ingest_attempt_id AS ingest_attempt_id,
    d.verdict AS verdict,
    d.reason_code AS reason_code,
    d.explanation AS explanation,
    d.policy_version AS policy_version,
    d.decided_by AS decided_by,
    d.decided_at AS decided_at,
    i.status AS invoice_status,
    i.file_name AS file_name,
    i.currency AS currency,
    i.total_amount AS total_amount,
    i.due_date AS due_date,
    i.extraction_json AS extraction_json,
    v.display_name AS vendor_name,
    v.tax_id AS vendor_tax_id,
    ia.file_name AS attempt_file_name,
    COALESCE(ia.duplicate_of_invoice_id, ia.invoice_id) AS canonical_invoice_id,
    ci.ingested_at AS canonical_ingested_at,
    a.status AS approval_status
  FROM decisions d
  LEFT JOIN invoices i ON i.id = d.invoice_id
  LEFT JOIN ingest_attempts ia ON ia.id = d.ingest_attempt_id
  LEFT JOIN invoices ci ON ci.id = COALESCE(ia.duplicate_of_invoice_id, ia.invoice_id)
  LEFT JOIN vendors v ON v.id = COALESCE(i.vendor_id, ci.vendor_id)
  LEFT JOIN approvals a ON a.decision_id = d.id
  ORDER BY d.decided_at ASC, d.id ASC
`;

function effectiveInvoiceId(row: ReportRow): string {
  return row.invoice_id ?? row.canonical_invoice_id ?? "";
}

function estado(row: ReportRow): string {
  if (row.invoice_id === null) {
    // Decisión anclada a un intento: el FRENAR del reenvío es el estado de esa fila.
    return row.verdict === "FRENAR" ? "FRENADA" : "ESCALADA";
  }
  switch (row.invoice_status) {
    case "DECIDIDA":
    case "APROBADA":
      return "PAGADA";
    case "PENDIENTE_APROBACION":
      return "ESCALADA";
    case "FRENADA":
    case "NEGADA":
      return "FRENADA";
    default:
      return "PENDIENTE";
  }
}

function provider(row: ReportRow): { name: string; taxId: string } {
  if (row.vendor_name !== null) return { name: row.vendor_name, taxId: row.vendor_tax_id ?? "" };

  let extracted: { vendor_name?: string; vendor_tax_id?: string } = {};
  if (row.extraction_json !== null) {
    try {
      extracted = JSON.parse(row.extraction_json) as typeof extracted;
    } catch {
      extracted = {};
    }
  }
  return { name: extracted.vendor_name ?? "", taxId: extracted.vendor_tax_id ?? "" };
}

function motivo(row: ReportRow): string {
  if (row.ingest_attempt_id !== null && row.canonical_ingested_at !== null) {
    return `${row.explanation} (registro original del ${row.canonical_ingested_at.slice(0, 10)})`;
  }
  return row.explanation;
}

function quote(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

/** CSV determinista: mismo contenido en cada generación, `\r\n`, comillas dobles escapadas. */
export function buildReportCsv(db: Database.Database): string {
  const rows = db.prepare(QUERY).all() as ReportRow[];

  const lines = [REPORT_COLUMNS.join(",")];
  for (const row of rows) {
    const vendor = provider(row);
    lines.push(
      [
        effectiveInvoiceId(row),
        row.file_name ?? row.attempt_file_name ?? "",
        vendor.name,
        vendor.taxId,
        row.total_amount,
        row.currency,
        row.due_date,
        estado(row),
        row.reason_code,
        motivo(row),
        row.approval_status === null ? "NO" : "SI",
        row.decided_by,
        row.policy_version,
        row.decided_at,
      ]
        .map(quote)
        .join(","),
    );
  }

  return `${lines.join("\r\n")}\r\n`;
}
