import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, test } from "node:test";

import type Database from "better-sqlite3";

import { buildApp } from "../app.js";
import { closeDb, loadDb } from "../db/index.js";
import { insertLedgerEntry } from "../repositories/ledger.js";
import { getAuditTrail, getMetrics } from "./metrics.js";

const TC01 = JSON.parse(
  readFileSync(new URL("../../../fixtures/TC-01.json", import.meta.url), "utf8"),
) as Record<string, unknown>;

let db: Database.Database;

function insertDecided(verdict: "PAGAR" | "FRENAR", index: number, extraOld = false): string {
  const invoiceId = randomUUID();
  const vendor = db.prepare("SELECT id FROM vendors WHERE tax_id = 'CLOUD-SERVERS-INC'").get() as {
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
    `INV-MET-${index}`,
    verdict === "PAGAR" ? "DECIDIDA" : "FRENADA",
    `tc-${index}.json`,
    "application/json",
    randomUUID().replace(/-/g, "").padEnd(64, "d"),
    "2026-10-01",
    "2026-10-15",
    "USD",
    400,
    20,
    420,
    1,
    420,
    null,
    JSON.stringify({ ...TC01, invoice_number: `INV-MET-${index}` }),
    "2026-10-17T00:00:00.000Z",
  );

  const decide = (verdictValue: string, at: string): string => {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO decisions (id, invoice_id, ingest_attempt_id, verdict, reason_code, explanation,
        policy_version, amount_usd_evaluated, decided_by, decided_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      id,
      invoiceId,
      null,
      verdictValue,
      verdictValue === "PAGAR" ? "SUCCESS_TOUCHLESS_STP" : "ERR_INVALID_DATA",
      "Motivo legible",
      "v1",
      420,
      "AGENTE",
      at,
    );
    return id;
  };

  if (extraOld) decide("FRENAR", "2026-10-16T00:00:00.000Z");
  const decisionId = decide(verdict, `2026-10-17T00:00:${String(index).padStart(2, "0")}.000Z`);

  if (verdict === "PAGAR") {
    insertLedgerEntry({
      invoice_id: invoiceId,
      decision_id: decisionId,
      policy_version: "v1",
      amount_usd: 100,
    });
  }

  return invoiceId;
}

beforeEach(() => {
  db = loadDb(":memory:");
});

afterEach(() => {
  closeDb();
});

test("base vacia: budget_remaining completo y touchless_rate 0, sin NaN (Review Focus 5)", () => {
  assert.deepEqual(getMetrics(db), {
    budget_remaining: 5000,
    threshold_limit: 1000,
    total_processed: 0,
    touchless_rate: 0,
  });
  assert.deepEqual(getAuditTrail(db), {
    metrics: {
      budget_remaining: 5000,
      threshold_limit: 1000,
      total_processed: 0,
      touchless_rate: 0,
    },
    records: [],
  });
  assert.equal(Number.isNaN(getMetrics(db).touchless_rate), false);
});

test("con 6 PAGAR de 11: touchless_rate 54.5 y total cuenta facturas, no decisiones", () => {
  for (let i = 1; i <= 6; i += 1) insertDecided("PAGAR", i, i === 1);
  for (let i = 7; i <= 11; i += 1) insertDecided("FRENAR", i);

  const trail = getAuditTrail(db);

  assert.equal(trail.metrics.touchless_rate, 54.5);
  assert.equal(trail.metrics.total_processed, 11);
  assert.equal(trail.metrics.budget_remaining, 5000 - 600);
  assert.equal(trail.records.length, 11);
});

test("GET /api/audit-trail responde metricas y records", async () => {
  insertDecided("PAGAR", 1);
  const app = await buildApp({ logLevel: "silent" });

  try {
    const res = await app.inject({ method: "GET", url: "/api/audit-trail" });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().metrics.touchless_rate, 100);
    assert.equal(res.json().metrics.total_processed, 1);
    assert.equal(res.json().records.length, 1);
    assert.equal(res.json().records[0].verdict, "PAGAR");
  } finally {
    await app.close();
  }
});
