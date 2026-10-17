import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";

import type Database from "better-sqlite3";

import { buildApp } from "../app.js";
import { closeDb, loadDb } from "../db/index.js";
import { buildReportCsv, reportFileName } from "./report.js";

let db: Database.Database;

function insertInvoice(overrides: { status?: string; hash?: string; explanation?: string } = {}): {
  invoiceId: string;
  decisionId: string;
} {
  const invoiceId = randomUUID();
  const decisionId = randomUUID();
  const vendor = db.prepare("SELECT id FROM vendors WHERE tax_id = 'GROWTH-AGENCY'").get() as {
    id: string;
  };

  db.prepare(
    `INSERT INTO invoices (id, vendor_id, invoice_number, status, file_name, mime_type, file_hash,
      issue_date, due_date, currency, subtotal, tax_amount, total_amount, fx_rate_used, total_usd,
      extraction_confidence, extraction_json, ingested_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    invoiceId,
    vendor.id,
    `INV-${invoiceId.slice(0, 6)}`,
    overrides.status ?? "PENDIENTE_APROBACION",
    "TC-06.json",
    "application/json",
    overrides.hash ?? randomUUID().replace(/-/g, "").padEnd(64, "a"),
    "2026-10-05",
    "2026-10-30",
    "EUR",
    4630,
    370,
    5000,
    1.08,
    5400,
    null,
    JSON.stringify({ invoice_number: "INV-GA", vendor_name: "Growth Agency" }),
    "2026-10-17T00:00:00.000Z",
  );

  db.prepare(
    `INSERT INTO decisions (id, invoice_id, ingest_attempt_id, verdict, reason_code, explanation,
      policy_version, amount_usd_evaluated, decided_by, decided_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    decisionId,
    invoiceId,
    null,
    "ESCALAR",
    "ALERT_BUDGET_OVERRUN",
    overrides.explanation ?? "Presupuesto insuficiente, saldo $0",
    "v1",
    5400,
    "AGENTE",
    "2026-10-17T00:00:01.000Z",
  );

  db.prepare(
    `INSERT INTO approvals (id, decision_id, invoice_id, status, requested_at, resolved_by,
      resolved_at, comment, override_with_overbudget)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(
    randomUUID(),
    decisionId,
    invoiceId,
    "PENDIENTE",
    "2026-10-17T00:00:02.000Z",
    null,
    null,
    null,
    0,
  );

  return { invoiceId, decisionId };
}

beforeEach(() => {
  db = loadDb(":memory:");
});

afterEach(() => {
  closeDb();
});

test("una fila por decision, 14 columnas y motivo entre comillas", () => {
  insertInvoice();

  const csv = buildReportCsv(db);

  assert.equal(csv.split("\r\n")[0].split(",").length, 14);
  assert.match(csv, /"Presupuesto insuficiente, saldo \$0"/);
  assert.equal(buildReportCsv(db), csv);
});

test("escapa comillas y saltos de linea dentro de motivo_legible", () => {
  insertInvoice({ explanation: 'Motivo con "comillas" y\nsalto de linea' });

  const csv = buildReportCsv(db);

  assert.match(csv, /"Motivo con ""comillas"" y\nsalto de linea"/);
  assert.equal(csv.match(/"Motivo con/g)?.length, 1);
});

test("reportFileName fecha el archivo con el día de generación", () => {
  assert.equal(reportFileName(new Date("2026-10-17T23:30:00Z")), "faktur-report-2026-10-17.csv");
});

test("GET /api/report.csv responde el CSV, no el fallback SPA", async () => {
  insertInvoice();
  const app = await buildApp({ logLevel: "silent" });

  try {
    const res = await app.inject({ method: "GET", url: "/api/report.csv" });
    assert.equal(res.statusCode, 200);
    assert.match(res.headers["content-type"]!, /text\/csv/);
    assert.match(
      res.headers["content-disposition"]!,
      /attachment; filename="faktur-report-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    assert.doesNotMatch(res.body, /<html/i);
    assert.match(res.body, /Presupuesto insuficiente/);
  } finally {
    await app.close();
  }
});

test("el reenvio duplicado cita la fecha del registro original", () => {
  const canonical = insertInvoice({ hash: "c".repeat(64) });
  const attemptId = randomUUID();
  db.prepare(
    `INSERT INTO ingest_attempts (id, invoice_id, file_name, mime_type, byte_size, file_hash,
      attempt_status, duplicate_of_invoice_id, submitted_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(
    attemptId,
    null,
    "TC-03.json",
    "application/json",
    10,
    "c".repeat(64),
    "DUPLICADA",
    canonical.invoiceId,
    "2026-10-18T00:00:00.000Z",
  );

  const decisionId = randomUUID();
  db.prepare(
    `INSERT INTO decisions (id, invoice_id, ingest_attempt_id, verdict, reason_code, explanation,
      policy_version, amount_usd_evaluated, decided_by, decided_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    decisionId,
    null,
    attemptId,
    "FRENAR",
    "ERR_DUPLICATE_INVOICE",
    "La factura INV-9022 ya fue registrada",
    "v1",
    0,
    "AGENTE",
    "2026-10-18T00:00:01.000Z",
  );

  const csv = buildReportCsv(db);
  const duplicateLine = csv.split("\r\n").find((line) => line.includes("ERR_DUPLICATE_INVOICE"));

  assert.ok(duplicateLine);
  assert.equal(duplicateLine.split(",")[0], `"${canonical.invoiceId}"`);
  assert.match(duplicateLine, /registro original del 2026-10-17/);
});
