import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, test } from "node:test";

import type Database from "better-sqlite3";

import { closeDb, loadDb } from "../db/index.js";
import { decideInvoice } from "./decide.js";
import {
  dispatchNotification,
  notificationStatus,
  queueNotification,
  type Notifier,
} from "./notifier.js";

const FIXTURES = fileURLToPath(new URL("../../../fixtures/", import.meta.url));

let db: Database.Database;

function insertExtractableFixture(name: string): string {
  const extracted = JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), "utf8")) as Record<
    string,
    unknown
  >;
  const vendor = db
    .prepare("SELECT id FROM vendors WHERE tax_id = ?")
    .get(extracted.vendor_tax_id as string) as { id: string };
  const id = randomUUID();

  db.prepare(
    `INSERT INTO invoices (id, vendor_id, invoice_number, status, file_name, mime_type, file_hash,
      issue_date, due_date, currency, subtotal, tax_amount, total_amount, fx_rate_used, total_usd,
      extraction_confidence, extraction_json, ingested_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id,
    vendor.id,
    extracted.invoice_number as string,
    "EXTRAIDA",
    `${name}.json`,
    "application/json",
    randomUUID().replace(/-/g, "").padEnd(64, "f"),
    extracted.issue_date as string,
    extracted.due_date as string,
    extracted.currency as string,
    extracted.subtotal as number,
    extracted.tax_amount as number,
    extracted.total_amount as number,
    1,
    extracted.total_amount as number,
    null,
    JSON.stringify(extracted),
    "2026-10-17T00:00:00.000Z",
  );

  return id;
}

beforeEach(() => {
  db = loadDb(":memory:");
});

afterEach(() => {
  closeDb();
});

function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

test("un ESCALAR encola una notificacion CONSOLE con motivo y contexto", async () => {
  const invoiceId = insertExtractableFixture("TC-04");

  const decision = decideInvoice(invoiceId, db);
  assert.equal(decision.verdict, "ESCALAR");

  const rows = db
    .prepare("SELECT id, channel, payload_json FROM notifications WHERE invoice_id = ?")
    .all(invoiceId) as Array<{ id: string; channel: string; payload_json: string }>;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].channel, "CONSOLE");
  assert.match(rows[0].payload_json, /ALERT_THRESHOLD_EXCEEDED/);
  assert.match(rows[0].payload_json, /umbral de aprobación autónoma/);

  await tick();
  assert.equal(notificationStatus(rows[0].id, db), "ENVIADA");
});

test("un webhook que falla deja FALLIDA y no revierte la decision", async () => {
  const invoiceId = insertExtractableFixture("TC-04");
  const decision = decideInvoice(invoiceId, db);
  await tick();

  const id = queueNotification({
    invoice_id: invoiceId,
    decision_id: decision.id,
    channel: "WEBHOOK",
    reason_code: decision.reason_code,
    explanation: decision.explanation,
    amount_usd: decision.amount_usd_evaluated,
  });
  const failing: Notifier = {
    notify: async () => {
      throw new Error("webhook caído");
    },
  };

  await dispatchNotification(id, failing, db);

  assert.equal(notificationStatus(id, db), "FALLIDA");
  assert.equal(
    (
      db.prepare("SELECT verdict FROM decisions WHERE id = ?").get(decision.id) as {
        verdict: string;
      }
    ).verdict,
    "ESCALAR",
  );
  assert.equal(
    (db.prepare("SELECT status FROM invoices WHERE id = ?").get(invoiceId) as { status: string })
      .status,
    "PENDIENTE_APROBACION",
  );
});
