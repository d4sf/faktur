import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";

import type Database from "better-sqlite3";

import { closeDb, loadDb } from "../db/index.js";
import {
  getDecision,
  getDecisionForAttempt,
  insertDecision,
  listDecisionsByInvoice,
  type NewDecision,
} from "./decisions.js";

let db: Database.Database;
let invoiceId: string;
let base: Omit<NewDecision, "policy_version" | "verdict">;

beforeEach(() => {
  db = loadDb(":memory:");
  invoiceId = randomUUID();
  db.prepare(
    `INSERT INTO invoices (id, vendor_id, invoice_number, status, file_name, mime_type, file_hash,
      issue_date, due_date, currency, subtotal, tax_amount, total_amount, fx_rate_used, total_usd,
      extraction_confidence, extraction_json, ingested_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    invoiceId,
    null,
    "INV-T7-1",
    "EXTRAIDA",
    "tc.json",
    "application/json",
    "a".repeat(64),
    "2026-10-01",
    "2026-10-15",
    "USD",
    400,
    20,
    420,
    1,
    420,
    null,
    JSON.stringify({ invoice_number: "INV-T7-1" }),
    "2026-10-17T00:00:00.000Z",
  );

  base = {
    invoice_id: invoiceId,
    ingest_attempt_id: null,
    reason_code: "SUCCESS_TOUCHLESS_STP",
    explanation: "Dentro de política",
    amount_usd_evaluated: 420,
    decided_by: "AGENTE",
  };
});

afterEach(() => {
  closeDb();
});

function createPolicyV2(): void {
  db.prepare(
    `INSERT INTO policies (version, auto_approval_threshold_usd, monthly_budget_usd,
      vendor_drift_factor, allowed_currencies, is_active, created_at, created_by, comment)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run("v2", 300, 5000, 1.4, JSON.stringify(["USD"]), 0, "2026-10-17", "test", "v2");
  db.prepare("UPDATE policies SET is_active = 0 WHERE version = 'v1'").run();
  db.prepare("UPDATE policies SET is_active = 1 WHERE version = 'v2'").run();
}

test("congela la version y no reescribe la decision vieja", () => {
  const first = insertDecision({ ...base, policy_version: "v1", verdict: "PAGAR" });
  createPolicyV2();
  const second = insertDecision({ ...base, policy_version: "v2", verdict: "ESCALAR" });

  assert.equal(getDecision(first)?.verdict, "PAGAR");
  assert.equal(getDecision(first)?.policy_version, "v1");
  assert.equal(getDecision(second)?.policy_version, "v2");
  assert.equal(listDecisionsByInvoice(invoiceId).length, 2);
});

test("exige exactamente un ancla: factura o intento", () => {
  assert.throws(
    () =>
      insertDecision({
        ...base,
        ingest_attempt_id: randomUUID(),
        policy_version: "v1",
        verdict: "FRENAR",
      }),
    /decision_anchor_invalid/,
  );
  assert.throws(
    () =>
      insertDecision({
        ...base,
        invoice_id: null,
        ingest_attempt_id: null,
        policy_version: "v1",
        verdict: "FRENAR",
      }),
    /decision_anchor_invalid/,
  );
});

test("una decision anclada al intento se recupera por ingest_attempt_id", () => {
  const attemptId = randomUUID();
  db.prepare(
    `INSERT INTO ingest_attempts (id, invoice_id, file_name, mime_type, byte_size, file_hash,
      attempt_status, duplicate_of_invoice_id, submitted_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(
    attemptId,
    null,
    "tc-copia.json",
    "application/json",
    10,
    "b".repeat(64),
    "DUPLICADA",
    invoiceId,
    "2026-10-17T00:00:00.000Z",
  );

  const id = insertDecision({
    ...base,
    invoice_id: null,
    ingest_attempt_id: attemptId,
    policy_version: "v1",
    verdict: "FRENAR",
    reason_code: "ERR_DUPLICATE_INVOICE",
    amount_usd_evaluated: 0,
  });

  assert.equal(getDecisionForAttempt(attemptId)?.id, id);
});
