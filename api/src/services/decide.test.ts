import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, test } from "node:test";

import type Database from "better-sqlite3";

import { closeDb, loadDb } from "../db/index.js";
import { listDecisionsByInvoice } from "../repositories/decisions.js";
import { decideInvoice } from "./decide.js";

const FIXTURES = fileURLToPath(new URL("../../../fixtures/", import.meta.url));

let db: Database.Database;

function fixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), "utf8")) as Record<
    string,
    unknown
  >;
}

function insertInvoice(name: string, { status = "EXTRAIDA" } = {}): string {
  const extracted = fixture(name);
  const taxId = extracted.vendor_tax_id as string | undefined;
  const vendor =
    taxId === undefined
      ? undefined
      : (db.prepare("SELECT id FROM vendors WHERE tax_id = ?").get(taxId) as
          { id: string } | undefined);
  const currency = extracted.currency as string;
  const fx = db.prepare("SELECT rate_to_usd FROM fx_rates WHERE currency = ?").get(currency) as {
    rate_to_usd: number;
  };
  const id = randomUUID();
  const total = extracted.total_amount as number;

  db.prepare(
    `INSERT INTO invoices (id, vendor_id, invoice_number, status, file_name, mime_type, file_hash,
      issue_date, due_date, currency, subtotal, tax_amount, total_amount, fx_rate_used, total_usd,
      extraction_confidence, extraction_json, ingested_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id,
    vendor?.id ?? null,
    extracted.invoice_number as string,
    status,
    `${name}.json`,
    "application/json",
    randomUUID().replace(/-/g, "").padEnd(64, "a"),
    (extracted.issue_date as string | undefined) ?? null,
    (extracted.due_date as string | undefined) ?? null,
    currency,
    (extracted.subtotal as number | undefined) ?? null,
    (extracted.tax_amount as number | undefined) ?? null,
    total,
    fx.rate_to_usd,
    Math.round(total * fx.rate_to_usd * 100) / 100,
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

function statusOf(id: string): string {
  return (db.prepare("SELECT status FROM invoices WHERE id = ?").get(id) as { status: string })
    .status;
}

function approvalCount(id: string): number {
  return (
    db.prepare("SELECT COUNT(*) AS n FROM approvals WHERE invoice_id = ?").get(id) as {
      n: number;
    }
  ).n;
}

test("PAGAR deja DECIDIDA, ESCALAR abre una bandeja y FRENAR ninguna", () => {
  const pagar = insertInvoice("TC-01");
  const escalar = insertInvoice("TC-04");
  const frenar = insertInvoice("TC-08");

  const a = decideInvoice(pagar, db);
  const b = decideInvoice(escalar, db);
  const c = decideInvoice(frenar, db);

  assert.deepEqual([a.verdict, b.verdict, c.verdict], ["PAGAR", "ESCALAR", "FRENAR"]);
  assert.equal(statusOf(pagar), "DECIDIDA");
  assert.equal(statusOf(escalar), "PENDIENTE_APROBACION");
  assert.equal(statusOf(frenar), "FRENADA");
  assert.equal(approvalCount(pagar), 0);
  assert.equal(approvalCount(escalar), 1);
  assert.equal(approvalCount(frenar), 0, "FRENAR nunca abre bandeja (RI-3)");
  assert.equal(a.policy_version, "v1");
  assert.equal(a.decided_by, "AGENTE");
  assert.equal(a.amount_usd_evaluated, 420);
});

test("re-evaluar inserta una segunda fila y no muta la primera", () => {
  const id = insertInvoice("TC-08");

  const first = decideInvoice(id, db);
  assert.equal(first.reason_code, "ERR_INVALID_DATA");

  db.prepare("UPDATE invoices SET status = 'EXTRAIDA' WHERE id = ?").run(id);
  const second = decideInvoice(id, db);

  const rows = listDecisionsByInvoice(id);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((d) => d.id === first.id)?.reason_code, "ERR_INVALID_DATA");
  assert.equal(second.reason_code, "ERR_INVALID_DATA");
  assert.notEqual(first.id, second.id);
});

test("una factura sin vendor_tax_id frena por ERR_INVALID_DATA (Review Focus 2)", () => {
  const id = insertInvoice("TC-08");

  const decision = decideInvoice(id, db);

  assert.equal(decision.verdict, "FRENAR");
  assert.equal(decision.reason_code, "ERR_INVALID_DATA");
});

test("no se decide dos veces la misma factura en el mismo estado", () => {
  const id = insertInvoice("TC-01");
  decideInvoice(id, db);

  assert.throws(() => decideInvoice(id, db), /status_transition_invalid/);
});
