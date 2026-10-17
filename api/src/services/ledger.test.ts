import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, test } from "node:test";

import type Database from "better-sqlite3";

import { closeDb, loadDb } from "../db/index.js";
import { insertDecision } from "../repositories/decisions.js";
import {
  budgetRemaining,
  countLedger,
  getBudgetState,
  insertLedgerEntry,
} from "../repositories/ledger.js";
import { decideInvoice } from "./decide.js";

const TC01 = JSON.parse(
  readFileSync(new URL("../../../fixtures/TC-01.json", import.meta.url), "utf8"),
) as Record<string, unknown>;

let db: Database.Database;
let invoiceId: string;
let decisionId: string;

function insertInvoice(overrides: Record<string, unknown> = {}): string {
  const vendor = db.prepare("SELECT id FROM vendors WHERE tax_id = 'CLOUD-SERVERS-INC'").get() as {
    id: string;
  };
  const id = randomUUID();
  const extracted = { ...TC01, ...overrides };
  const total = (extracted.total_amount as number | undefined) ?? 420;

  db.prepare(
    `INSERT INTO invoices (id, vendor_id, invoice_number, status, file_name, mime_type, file_hash,
      issue_date, due_date, currency, subtotal, tax_amount, total_amount, fx_rate_used, total_usd,
      extraction_confidence, extraction_json, ingested_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id,
    vendor.id,
    (extracted.invoice_number as string | undefined) ?? `INV-${id.slice(0, 6)}`,
    "EXTRAIDA",
    "tc-01.json",
    "application/json",
    randomUUID().replace(/-/g, "").padEnd(64, "a"),
    "2026-10-01",
    "2026-10-15",
    "USD",
    (extracted.subtotal as number | undefined) ?? null,
    (extracted.tax_amount as number | undefined) ?? null,
    total,
    1,
    Math.round(total * 100) / 100,
    null,
    JSON.stringify(extracted),
    "2026-10-17T00:00:00.000Z",
  );
  return id;
}

function insertPayDecision(forInvoice: string): string {
  return insertDecision({
    invoice_id: forInvoice,
    ingest_attempt_id: null,
    verdict: "PAGAR",
    reason_code: "SUCCESS_TOUCHLESS_STP",
    explanation: "Dentro de política",
    policy_version: "v1",
    amount_usd_evaluated: 420,
    decided_by: "AGENTE",
  });
}

beforeEach(() => {
  db = loadDb(":memory:");
  invoiceId = insertInvoice();
  decisionId = insertPayDecision(invoiceId);
});

afterEach(() => {
  closeDb();
});

test("dos llamadas para la misma decision dejan una sola fila", () => {
  const a = insertLedgerEntry({
    invoice_id: invoiceId,
    decision_id: decisionId,
    policy_version: "v1",
    amount_usd: 420,
  });
  const b = insertLedgerEntry({
    invoice_id: invoiceId,
    decision_id: decisionId,
    policy_version: "v1",
    amount_usd: 420,
  });

  assert.ok(a);
  assert.equal(b, null);
  assert.equal(countLedger(db), 1);
  assert.equal(budgetRemaining(db), 5000 - 420);
});

test("el insert se revierte si la transaccion que lo contiene falla", () => {
  assert.throws(() =>
    db.transaction(() => {
      insertLedgerEntry({
        invoice_id: invoiceId,
        decision_id: decisionId,
        policy_version: "v1",
        amount_usd: 420,
      });
      throw new Error("falla después del asiento");
    })(),
  );

  assert.equal(countLedger(db), 0);
});

test("solo PAGAR escribe ledger; ESCALAR y FRENAR no mueven saldo", () => {
  const escalar = insertInvoice({ invoice_number: "INV-GA", total_amount: 3500, subtotal: 3300 });
  const frenar = insertInvoice({
    invoice_number: "INV-EF",
    vendor_tax_id: undefined,
    total_amount: 900,
  });

  decideInvoice(invoiceId, db);
  decideInvoice(escalar, db);
  decideInvoice(frenar, db);

  assert.equal(countLedger(db), 1, "solo la factura que PAGAR escribe asiento");
  const state = getBudgetState(db);
  assert.equal(state.monthlySpent, 420);
  assert.equal(state.categorySpent.Infraestructura, 420);
});
