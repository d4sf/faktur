import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type Database from "better-sqlite3";

import {
  approvalFactory,
  decisionFactory,
  ingestAttemptFactory,
  invoiceFactory,
  lineItemFactory,
  vendorFactory,
} from "./factories.js";
import { closeDb, loadDb } from "./index.js";

let db: Database.Database;

beforeEach(() => {
  closeDb();
  db = loadDb(":memory:");
});

afterEach(() => {
  closeDb();
});

function count(table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

test("dos vendors sin override no violan tax_id UNIQUE", () => {
  const a = vendorFactory(db);
  const b = vendorFactory(db);

  assert.notEqual(a.tax_id, b.tax_id);
  const row = db.prepare("SELECT COUNT(*) AS n FROM vendors WHERE id IN (?,?)").get(a.id, b.id) as {
    n: number;
  };
  assert.equal(row.n, 2);
});

test("invoiceFactory crea vendor y usa USD por default", () => {
  const invoice = invoiceFactory(db);

  assert.ok(invoice.vendor_id !== null);
  assert.equal(invoice.currency, "USD");
  assert.equal(invoice.total_usd, 100);
  assert.equal(invoice.total_amount, 100);
});

test("los overrides ganan sobre los defaults", () => {
  const invoice = invoiceFactory(db, {
    total_amount: 250,
    total_usd: 250,
    status: "DECIDIDA",
  });

  assert.equal(invoice.total_amount, 250);
  assert.equal(invoice.status, "DECIDIDA");
});

test("decisionFactory con ingest_attempt_id deja invoice_id en null (CHECK XOR)", () => {
  const attempt = ingestAttemptFactory(db);
  const decision = decisionFactory(db, { ingest_attempt_id: attempt.id, invoice_id: null });

  assert.equal(decision.invoice_id, null);
  assert.equal(decision.ingest_attempt_id, attempt.id);
  assert.equal(decision.amount_usd_evaluated, 100);
});

test("lineItemFactory sin invoice_id crea la factura", () => {
  const before = count("invoices");
  const item = lineItemFactory(db);

  assert.equal(count("invoices"), before + 1);
  assert.equal(item.total, 100);
});

test("approvalFactory deriva invoice_id de la decisión y nace PENDIENTE", () => {
  const decision = decisionFactory(db);
  const approval = approvalFactory(db, { decision_id: decision.id });

  assert.equal(approval.invoice_id, decision.invoice_id);
  assert.equal(approval.status, "PENDIENTE");
});

test("ingestAttemptFactory respeta attempt_status override", () => {
  const attempt = ingestAttemptFactory(db, { attempt_status: "DUPLICADA" });

  assert.equal(attempt.attempt_status, "DUPLICADA");
  assert.equal(attempt.byte_size, 128);
});

test("vendorFactory persiste la fila devuelta", () => {
  const vendor = vendorFactory(db);
  const stored = db.prepare("SELECT * FROM vendors WHERE id = ?").get(vendor.id);

  assert.deepEqual(stored, vendor);
});

test("invoiceFactory persiste la fila devuelta", () => {
  const invoice = invoiceFactory(db);
  const stored = db.prepare("SELECT * FROM invoices WHERE id = ?").get(invoice.id);

  assert.deepEqual(stored, invoice);
});

test("lineItemFactory persiste la fila devuelta", () => {
  const item = lineItemFactory(db);
  const stored = db.prepare("SELECT * FROM line_items WHERE id = ?").get(item.id);

  assert.deepEqual(stored, item);
});

test("ingestAttemptFactory persiste la fila devuelta", () => {
  const attempt = ingestAttemptFactory(db);
  const stored = db.prepare("SELECT * FROM ingest_attempts WHERE id = ?").get(attempt.id);

  assert.deepEqual(stored, attempt);
});

test("decisionFactory persiste la fila devuelta", () => {
  const decision = decisionFactory(db);
  const stored = db.prepare("SELECT * FROM decisions WHERE id = ?").get(decision.id);

  assert.deepEqual(stored, decision);
});

test("approvalFactory persiste la fila devuelta", () => {
  const approval = approvalFactory(db);
  const stored = db.prepare("SELECT * FROM approvals WHERE id = ?").get(approval.id);

  assert.deepEqual(stored, approval);
});
