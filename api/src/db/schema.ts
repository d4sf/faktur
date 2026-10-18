import Database from "better-sqlite3";

/**
 * DDL completo del modelo ER (12 tablas).
 *
 * Template string para tener type-safety y evitar archivos sueltos. Se ejecuta con
 * `db.exec(SCHEMA_SQL)` que soporta múltiples statements separados por `;`.
 *
 * Los CHECK constraints replican los enums de T2 (decision.ts, audit.ts, etc.) para que
 * la base rechace valores inválidos aunque el código TypeScript se equivoque.
 *
 * `PRAGMA foreign_keys = ON` se ejecuta en `loadDb`, no acá: es un setting por conexión,
 * no parte del schema.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS categories (
  name TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  tax_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL REFERENCES categories(name),
  status TEXT NOT NULL CHECK (status IN ('ALLOWLISTED','BLOCKLISTED')),
  historical_avg_usd REAL NOT NULL DEFAULT 0 CHECK (historical_avg_usd >= 0),
  first_seen_at TEXT,
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  vendor_id TEXT REFERENCES vendors(id),
  invoice_number TEXT,
  status TEXT NOT NULL CHECK (status IN ('RECIBIDA','EXTRAIDA','DECIDIDA','PENDIENTE_APROBACION','APROBADA','NEGADA','FRENADA')),
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_hash TEXT NOT NULL UNIQUE,
  issue_date TEXT,
  due_date TEXT,
  currency TEXT NOT NULL REFERENCES fx_rates(currency),
  subtotal REAL CHECK (subtotal IS NULL OR subtotal >= 0),
  tax_amount REAL CHECK (tax_amount IS NULL OR tax_amount >= 0),
  total_amount REAL NOT NULL CHECK (total_amount >= 0),
  fx_rate_used REAL NOT NULL,
  total_usd REAL NOT NULL,
  extraction_confidence REAL,
  extraction_json TEXT NOT NULL,
  ingested_at TEXT NOT NULL,
  UNIQUE(vendor_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS ingest_attempts (
  id TEXT PRIMARY KEY,
  invoice_id TEXT REFERENCES invoices(id),
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  file_hash TEXT NOT NULL,
  attempt_status TEXT NOT NULL CHECK (attempt_status IN ('RECIBIDA','DUPLICADA','RECHAZADA')),
  duplicate_of_invoice_id TEXT REFERENCES invoices(id),
  submitted_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS line_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity >= 0),
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  total REAL NOT NULL CHECK (total >= 0)
);

CREATE TABLE IF NOT EXISTS policies (
  version TEXT PRIMARY KEY,
  auto_approval_threshold_usd REAL NOT NULL CHECK (auto_approval_threshold_usd >= 0),
  monthly_budget_usd REAL NOT NULL CHECK (monthly_budget_usd >= 0),
  vendor_drift_factor REAL NOT NULL CHECK (vendor_drift_factor > 0),
  min_extraction_confidence REAL NOT NULL DEFAULT 0.7
    CHECK (min_extraction_confidence >= 0 AND min_extraction_confidence <= 1),
  allowed_currencies TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  comment TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS policy_category_budgets (
  policy_version TEXT NOT NULL REFERENCES policies(version),
  category TEXT NOT NULL REFERENCES categories(name),
  budget_usd REAL NOT NULL CHECK (budget_usd >= 0),
  PRIMARY KEY (policy_version, category)
);

CREATE TABLE IF NOT EXISTS fx_rates (
  currency TEXT PRIMARY KEY,
  rate_to_usd REAL NOT NULL CHECK (rate_to_usd > 0),
  as_of TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  invoice_id TEXT REFERENCES invoices(id),
  ingest_attempt_id TEXT REFERENCES ingest_attempts(id),
  verdict TEXT NOT NULL CHECK (verdict IN ('PAGAR','FRENAR','ESCALAR')),
  reason_code TEXT NOT NULL CHECK (reason_code IN ('SUCCESS_TOUCHLESS_STP','ERR_INVALID_DATA','ALERT_LOW_CONFIDENCE','ERR_DUPLICATE_INVOICE','ERR_BLACKLISTED_VENDOR','ALERT_NEW_VENDOR','ALERT_VENDOR_DRIFT','ALERT_BUDGET_OVERRUN','ALERT_BUDGET_TIGHT','ALERT_THRESHOLD_EXCEEDED')),
  explanation TEXT NOT NULL,
  policy_version TEXT NOT NULL REFERENCES policies(version),
  amount_usd_evaluated REAL NOT NULL CHECK (amount_usd_evaluated >= 0),
  decided_by TEXT NOT NULL CHECK (decided_by IN ('AGENTE','HUMANO')),
  decided_at TEXT NOT NULL,
  CHECK (
    (invoice_id IS NOT NULL AND ingest_attempt_id IS NULL) OR
    (invoice_id IS NULL AND ingest_attempt_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL UNIQUE REFERENCES decisions(id),
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  status TEXT NOT NULL CHECK (status IN ('PENDIENTE','APROBADA','NEGADA')),
  requested_at TEXT NOT NULL,
  resolved_by TEXT,
  resolved_at TEXT,
  comment TEXT,
  override_with_overbudget INTEGER NOT NULL DEFAULT 0 CHECK (override_with_overbudget IN (0,1))
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  decision_id TEXT NOT NULL REFERENCES decisions(id),
  policy_version TEXT NOT NULL,
  amount_usd REAL NOT NULL CHECK (amount_usd >= 0),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('COMPROMISO_PAGAR')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  invoice_id TEXT REFERENCES invoices(id),
  decision_id TEXT REFERENCES decisions(id),
  channel TEXT NOT NULL CHECK (channel IN ('SLACK_CARD','WEBHOOK','CONSOLE','EMAIL_LOCAL')),
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDIENTE','ENVIADA','FALLIDA')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ingest_attempts_file_hash ON ingest_attempts(file_hash);
CREATE INDEX IF NOT EXISTS idx_invoices_vendor_id ON invoices(vendor_id);
CREATE INDEX IF NOT EXISTS idx_decisions_invoice_id ON decisions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_decisions_ingest_attempt_id ON decisions(ingest_attempt_id);
CREATE INDEX IF NOT EXISTS idx_line_items_invoice_id ON line_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_invoice_id ON ledger_entries(invoice_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_decision_id ON ledger_entries(decision_id);
CREATE INDEX IF NOT EXISTS idx_notifications_invoice_id ON notifications(invoice_id);
CREATE INDEX IF NOT EXISTS idx_notifications_decision_id ON notifications(decision_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_policies_one_active ON policies(is_active) WHERE is_active = 1;

CREATE TABLE IF NOT EXISTS ai_explanations (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  policy_version TEXT NOT NULL REFERENCES policies(version),
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL DEFAULT 'v1',
  explanation TEXT NOT NULL CHECK (length(explanation) <= 1500),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_explanations_decision_id ON ai_explanations(decision_id);
CREATE INDEX IF NOT EXISTS idx_ai_explanations_invoice_id ON ai_explanations(invoice_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export function applySchema(db: Database.Database): void {
  db.exec(SCHEMA_SQL);

  // Bases creadas antes del ADR 0002 no tienen la columna: se agrega en el lugar, sin
  // framework de migraciones. `ADD COLUMN` con default es idempotente por el chequeo previo.
  const policyColumns = db.pragma("table_info(policies)") as Array<{ name: string }>;
  if (!policyColumns.some((column) => column.name === "min_extraction_confidence")) {
    db.exec(
      `ALTER TABLE policies ADD COLUMN min_extraction_confidence REAL NOT NULL DEFAULT 0.7
         CHECK (min_extraction_confidence >= 0 AND min_extraction_confidence <= 1)`,
    );
  }
}
