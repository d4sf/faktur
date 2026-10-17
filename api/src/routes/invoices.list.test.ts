import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, test } from "node:test";

import type Database from "better-sqlite3";

import { buildApp } from "../app.js";
import { closeDb, loadDb } from "../db/index.js";

const TC04 = JSON.parse(
  readFileSync(new URL("../../../fixtures/TC-04.json", import.meta.url), "utf8"),
) as Record<string, unknown>;

let db: Database.Database;

function insertInvoice(options: {
  status: string;
  invoiceNumber: string;
  decidedAt: string;
  approval?: "APROBADA" | "NEGADA";
  extraDecision?: boolean;
}): string {
  const invoiceId = randomUUID();
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
    options.invoiceNumber,
    options.status,
    "tc-04.json",
    "application/json",
    randomUUID().replace(/-/g, "").padEnd(64, "c"),
    "2026-10-03",
    "2026-10-25",
    "USD",
    3300,
    200,
    3500,
    1,
    3500,
    null,
    JSON.stringify({ ...TC04, invoice_number: options.invoiceNumber }),
    "2026-10-17T00:00:00.000Z",
  );

  const decisions = [options.decidedAt];
  if (options.extraDecision) decisions.push("2026-10-16T00:00:00.000Z");

  decisions.forEach((decidedAt, index) => {
    const decisionId = randomUUID();
    db.prepare(
      `INSERT INTO decisions (id, invoice_id, ingest_attempt_id, verdict, reason_code, explanation,
        policy_version, amount_usd_evaluated, decided_by, decided_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      decisionId,
      invoiceId,
      null,
      "ESCALAR",
      "ALERT_THRESHOLD_EXCEEDED",
      "Supera el umbral de aprobación autónoma de $1.000",
      "v1",
      3500,
      "AGENTE",
      decidedAt,
    );

    if (index === 0 && options.approval !== undefined) {
      db.prepare(
        `INSERT INTO approvals (id, decision_id, invoice_id, status, requested_at, resolved_by,
          resolved_at, comment, override_with_overbudget)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      ).run(
        randomUUID(),
        decisionId,
        invoiceId,
        options.approval,
        "2026-10-17T00:00:01.000Z",
        "operador@blinka",
        "2026-10-17T00:05:00.000Z",
        "aprobado en demo",
        0,
      );
    }
  });

  return invoiceId;
}

beforeEach(() => {
  db = loadDb(":memory:");
});

afterEach(() => {
  closeDb();
});

test("una ESCALAR aprobada aparece una vez, como PAGADA y human_approved true", async () => {
  const invoiceId = insertInvoice({
    status: "APROBADA",
    invoiceNumber: "INV-APR-1",
    decidedAt: "2026-10-17T00:00:02.000Z",
    approval: "APROBADA",
    extraDecision: true,
  });
  const app = await buildApp({ logLevel: "silent" });

  try {
    const res = await app.inject({ method: "GET", url: "/api/invoices" });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().items.length, 1, "una fila por factura, no por decisión");
    assert.equal(res.json().items[0].estado, "PAGADA");
    assert.equal(res.json().items[0].human_approved, true);
    assert.equal(res.json().items[0].verdict, "ESCALAR", "el veredicto original no se reescribe");

    const detail = await app.inject({ method: "GET", url: `/api/invoices/${invoiceId}` });
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.json().resolution.resolved_by, "operador@blinka");
    assert.equal(detail.json().resolution.resolved_at, "2026-10-17T00:05:00.000Z");
    assert.equal(detail.json().resolution.comment, "aprobado en demo");
    assert.ok(detail.json().timeline.some((e: { type: string }) => e.type === "RESOLUCION"));
  } finally {
    await app.close();
  }
});

test("el listado es LIFO y filtra por estado", async () => {
  insertInvoice({
    status: "FRENADA",
    invoiceNumber: "INV-VIEJA",
    decidedAt: "2026-10-17T00:00:01.000Z",
  });
  insertInvoice({
    status: "APROBADA",
    invoiceNumber: "INV-NUEVA",
    decidedAt: "2026-10-17T00:00:09.000Z",
  });
  const app = await buildApp({ logLevel: "silent" });

  try {
    const all = await app.inject({ method: "GET", url: "/api/invoices" });
    assert.equal(all.json().total, 2);
    assert.deepEqual(
      all
        .json()
        .items.map((i: { invoice: { invoice_number: string } }) => i.invoice.invoice_number),
      ["INV-NUEVA", "INV-VIEJA"],
    );

    const frenadas = await app.inject({ method: "GET", url: "/api/invoices?status=FRENADA" });
    assert.equal(frenadas.json().total, 1);
    assert.equal(frenadas.json().items[0].invoice.invoice_number, "INV-VIEJA");
  } finally {
    await app.close();
  }
});

test("el detalle de una factura inexistente responde 404", async () => {
  const app = await buildApp({ logLevel: "silent" });

  try {
    const res = await app.inject({ method: "GET", url: "/api/invoices/no-existe" });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.json(), { error: "not_found" });
  } finally {
    await app.close();
  }
});
