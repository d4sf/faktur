import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";

import { applySchema } from "./schema.js";

test("applySchema crea las 14 tablas", () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applySchema(db);
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((r) => (r as { name: string }).name);
  assert.deepEqual(tables, [
    "ai_explanations",
    "approvals",
    "categories",
    "decisions",
    "fx_rates",
    "ingest_attempts",
    "invoices",
    "ledger_entries",
    "line_items",
    "notifications",
    "policies",
    "policy_category_budgets",
    "settings",
    "vendors",
  ]);
  db.close();
});

test("applySchema es idempotente", () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applySchema(db);
  applySchema(db);
  db.close();
});

test("invoices.file_hash UNIQUE rechaza duplicado", () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applySchema(db);
  db.prepare(
    "INSERT INTO fx_rates (currency, rate_to_usd, as_of) VALUES ('USD', 1.0, '2026-10-17')",
  ).run();
  db.prepare("INSERT INTO categories (name) VALUES ('Infraestructura')").run();
  db.prepare(
    "INSERT INTO vendors (id, tax_id, display_name, category, status) VALUES ('v1', 'V1', 'V1', 'Infraestructura', 'ALLOWLISTED')",
  ).run();
  const insert = db.prepare(
    "INSERT INTO invoices (id, vendor_id, status, file_name, mime_type, file_hash, currency, total_amount, fx_rate_used, total_usd, extraction_json, ingested_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
  );
  insert.run(
    "i1",
    "v1",
    "RECIBIDA",
    "f.pdf",
    "application/pdf",
    "a".repeat(64),
    "USD",
    100,
    1.0,
    100,
    "{}",
    "2026-10-17T00:00:00Z",
  );
  assert.throws(() => {
    insert.run(
      "i2",
      "v1",
      "RECIBIDA",
      "f2.pdf",
      "application/pdf",
      "a".repeat(64),
      "USD",
      100,
      1.0,
      100,
      "{}",
      "2026-10-17T00:00:00Z",
    );
  }, /UNIQUE/);
  db.close();
});

test("CHECK en verdict rechaza valor invalido", () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applySchema(db);
  db.prepare(
    "INSERT INTO policies (version, auto_approval_threshold_usd, monthly_budget_usd, vendor_drift_factor, allowed_currencies, is_active, created_at, created_by, comment) VALUES ('v1', 1000, 5000, 1.4, '[]', 1, '2026-10-17T00:00:00Z', 'test', 'c')",
  ).run();
  assert.throws(() => {
    db.prepare(
      "INSERT INTO decisions (id, verdict, reason_code, explanation, policy_version, amount_usd_evaluated, decided_by, decided_at) VALUES (?,?,?,?,?,?,?,?)",
    ).run(
      "d1",
      "INVALIDO",
      "SUCCESS_TOUCHLESS_STP",
      "x",
      "v1",
      100,
      "AGENTE",
      "2026-10-17T00:00:00Z",
    );
  }, /CHECK/);
  db.close();
});

test("FK en invoices.vendor_id rechaza vendor inexistente", () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applySchema(db);
  db.prepare(
    "INSERT INTO fx_rates (currency, rate_to_usd, as_of) VALUES ('USD', 1.0, '2026-10-17')",
  ).run();
  assert.throws(() => {
    db.prepare(
      "INSERT INTO invoices (id, vendor_id, status, file_name, mime_type, file_hash, currency, total_amount, fx_rate_used, total_usd, extraction_json, ingested_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      "i1",
      "vendor-inexistente",
      "RECIBIDA",
      "f.pdf",
      "application/pdf",
      "b".repeat(64),
      "USD",
      100,
      1.0,
      100,
      "{}",
      "2026-10-17T00:00:00Z",
    );
  }, /FOREIGN KEY/);
  db.close();
});

test("FK en invoices.currency rechaza moneda inexistente", () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applySchema(db);
  assert.throws(() => {
    db.prepare(
      "INSERT INTO invoices (id, status, file_name, mime_type, file_hash, currency, total_amount, fx_rate_used, total_usd, extraction_json, ingested_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      "i1",
      "RECIBIDA",
      "f.pdf",
      "application/pdf",
      "c".repeat(64),
      "BTC",
      100,
      1.0,
      100,
      "{}",
      "2026-10-17T00:00:00Z",
    );
  }, /FOREIGN KEY/);
  db.close();
});

test("RI-11: decisions con ambos invoice_id e ingest_attempt_id falla", () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applySchema(db);
  db.prepare(
    "INSERT INTO fx_rates (currency, rate_to_usd, as_of) VALUES ('USD', 1.0, '2026-10-17')",
  ).run();
  db.prepare("INSERT INTO categories (name) VALUES ('Infraestructura')").run();
  db.prepare(
    "INSERT INTO vendors (id, tax_id, display_name, category, status) VALUES ('v1', 'V1', 'V1', 'Infraestructura', 'ALLOWLISTED')",
  ).run();
  db.prepare(
    "INSERT INTO invoices (id, vendor_id, status, file_name, mime_type, file_hash, currency, total_amount, fx_rate_used, total_usd, extraction_json, ingested_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(
    "i1",
    "v1",
    "RECIBIDA",
    "f.pdf",
    "application/pdf",
    "d".repeat(64),
    "USD",
    100,
    1.0,
    100,
    "{}",
    "2026-10-17T00:00:00Z",
  );
  db.prepare(
    "INSERT INTO ingest_attempts (id, file_name, mime_type, byte_size, file_hash, attempt_status, submitted_at) VALUES (?,?,?,?,?,?,?)",
  ).run("a1", "f.pdf", "application/pdf", 100, "d".repeat(64), "RECIBIDA", "2026-10-17T00:00:00Z");
  db.prepare(
    "INSERT INTO policies (version, auto_approval_threshold_usd, monthly_budget_usd, vendor_drift_factor, allowed_currencies, is_active, created_at, created_by, comment) VALUES ('v1', 1000, 5000, 1.4, '[]', 1, '2026-10-17T00:00:00Z', 'test', 'c')",
  ).run();
  assert.throws(() => {
    db.prepare(
      "INSERT INTO decisions (id, invoice_id, ingest_attempt_id, verdict, reason_code, explanation, policy_version, amount_usd_evaluated, decided_by, decided_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    ).run(
      "d1",
      "i1",
      "a1",
      "PAGAR",
      "SUCCESS_TOUCHLESS_STP",
      "x",
      "v1",
      100,
      "AGENTE",
      "2026-10-17T00:00:00Z",
    );
  }, /CHECK/);
  db.close();
});

test("RI-11: decisions con ninguno de invoice_id e ingest_attempt_id falla", () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applySchema(db);
  db.prepare(
    "INSERT INTO policies (version, auto_approval_threshold_usd, monthly_budget_usd, vendor_drift_factor, allowed_currencies, is_active, created_at, created_by, comment) VALUES ('v1', 1000, 5000, 1.4, '[]', 1, '2026-10-17T00:00:00Z', 'test', 'c')",
  ).run();
  assert.throws(() => {
    db.prepare(
      "INSERT INTO decisions (id, invoice_id, ingest_attempt_id, verdict, reason_code, explanation, policy_version, amount_usd_evaluated, decided_by, decided_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    ).run(
      "d1",
      null,
      null,
      "PAGAR",
      "SUCCESS_TOUCHLESS_STP",
      "x",
      "v1",
      100,
      "AGENTE",
      "2026-10-17T00:00:00Z",
    );
  }, /CHECK/);
  db.close();
});

test("CHECK en amount_usd_evaluated rechaza negativo", () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applySchema(db);
  db.prepare(
    "INSERT INTO policies (version, auto_approval_threshold_usd, monthly_budget_usd, vendor_drift_factor, allowed_currencies, is_active, created_at, created_by, comment) VALUES ('v1', 1000, 5000, 1.4, '[]', 1, '2026-10-17T00:00:00Z', 'test', 'c')",
  ).run();
  assert.throws(() => {
    db.prepare(
      "INSERT INTO decisions (id, verdict, reason_code, explanation, policy_version, amount_usd_evaluated, decided_by, decided_at) VALUES (?,?,?,?,?,?,?,?)",
    ).run("d1", "PAGAR", "SUCCESS_TOUCHLESS_STP", "x", "v1", -1, "AGENTE", "2026-10-17T00:00:00Z");
  }, /CHECK/);
  db.close();
});

test("CHECK en byte_size rechaza negativo", () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applySchema(db);
  assert.throws(() => {
    db.prepare(
      "INSERT INTO ingest_attempts (id, file_name, mime_type, byte_size, file_hash, attempt_status, submitted_at) VALUES (?,?,?,?,?,?,?)",
    ).run("a1", "f.pdf", "application/pdf", -1, "e".repeat(64), "RECIBIDA", "2026-10-17T00:00:00Z");
  }, /CHECK/);
  db.close();
});

test("UNIQUE en approvals.decision_id rechaza duplicado", () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applySchema(db);
  db.prepare(
    "INSERT INTO fx_rates (currency, rate_to_usd, as_of) VALUES ('USD', 1.0, '2026-10-17')",
  ).run();
  db.prepare("INSERT INTO categories (name) VALUES ('Infraestructura')").run();
  db.prepare(
    "INSERT INTO vendors (id, tax_id, display_name, category, status) VALUES ('v1', 'V1', 'V1', 'Infraestructura', 'ALLOWLISTED')",
  ).run();
  db.prepare(
    "INSERT INTO invoices (id, vendor_id, status, file_name, mime_type, file_hash, currency, total_amount, fx_rate_used, total_usd, extraction_json, ingested_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(
    "i1",
    "v1",
    "RECIBIDA",
    "f.pdf",
    "application/pdf",
    "f".repeat(64),
    "USD",
    100,
    1.0,
    100,
    "{}",
    "2026-10-17T00:00:00Z",
  );
  db.prepare(
    "INSERT INTO policies (version, auto_approval_threshold_usd, monthly_budget_usd, vendor_drift_factor, allowed_currencies, is_active, created_at, created_by, comment) VALUES ('v1', 1000, 5000, 1.4, '[]', 1, '2026-10-17T00:00:00Z', 'test', 'c')",
  ).run();
  db.prepare(
    "INSERT INTO decisions (id, invoice_id, verdict, reason_code, explanation, policy_version, amount_usd_evaluated, decided_by, decided_at) VALUES (?,?,?,?,?,?,?,?,?)",
  ).run(
    "d1",
    "i1",
    "ESCALAR",
    "ALERT_THRESHOLD_EXCEEDED",
    "x",
    "v1",
    100,
    "AGENTE",
    "2026-10-17T00:00:00Z",
  );
  db.prepare(
    "INSERT INTO approvals (id, decision_id, invoice_id, status, requested_at) VALUES (?,?,?,?,?)",
  ).run("ap1", "d1", "i1", "PENDIENTE", "2026-10-17T00:00:00Z");
  assert.throws(() => {
    db.prepare(
      "INSERT INTO approvals (id, decision_id, invoice_id, status, requested_at) VALUES (?,?,?,?,?)",
    ).run("ap2", "d1", "i1", "PENDIENTE", "2026-10-17T00:00:00Z");
  }, /UNIQUE/);
  db.close();
});

test("CHECK en subtotal rechaza negativo", () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applySchema(db);
  db.prepare(
    "INSERT INTO fx_rates (currency, rate_to_usd, as_of) VALUES ('USD', 1.0, '2026-10-17')",
  ).run();
  assert.throws(() => {
    db.prepare(
      "INSERT INTO invoices (id, status, file_name, mime_type, file_hash, currency, subtotal, total_amount, fx_rate_used, total_usd, extraction_json, ingested_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      "i1",
      "RECIBIDA",
      "f.pdf",
      "application/pdf",
      "g".repeat(64),
      "USD",
      -1,
      100,
      1.0,
      100,
      "{}",
      "2026-10-17T00:00:00Z",
    );
  }, /CHECK/);
  db.close();
});

test("CHECK en historical_avg_usd rechaza negativo", () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applySchema(db);
  db.prepare("INSERT INTO categories (name) VALUES ('Infraestructura')").run();
  assert.throws(() => {
    db.prepare(
      "INSERT INTO vendors (id, tax_id, display_name, category, status, historical_avg_usd) VALUES (?,?,?,?,?,?)",
    ).run("v1", "V1", "V1", "Infraestructura", "ALLOWLISTED", -1);
  }, /CHECK/);
  db.close();
});

test("FK en vendors.category rechaza categoria inexistente", () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applySchema(db);
  assert.throws(() => {
    db.prepare(
      "INSERT INTO vendors (id, tax_id, display_name, category, status) VALUES (?,?,?,?,?)",
    ).run("v1", "V1", "V1", "Inexistente", "ALLOWLISTED");
  }, /FOREIGN KEY/);
  db.close();
});
