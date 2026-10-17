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

function insertEscalation(withTaxId = true): {
  invoiceId: string;
  decisionId: string;
  approvalId: string;
} {
  const invoiceId = randomUUID();
  const decisionId = randomUUID();
  const approvalId = randomUUID();
  const vendor = db.prepare("SELECT id FROM vendors WHERE tax_id = 'GROWTH-AGENCY'").get() as {
    id: string;
  };
  const extracted = { ...TC04 };
  if (!withTaxId) delete extracted.vendor_tax_id;

  db.prepare(
    `INSERT INTO invoices (id, vendor_id, invoice_number, status, file_name, mime_type, file_hash,
      issue_date, due_date, currency, subtotal, tax_amount, total_amount, fx_rate_used, total_usd,
      extraction_confidence, extraction_json, ingested_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    invoiceId,
    vendor.id,
    "INV-GA-3500",
    "PENDIENTE_APROBACION",
    "tc-04.json",
    "application/json",
    randomUUID().replace(/-/g, "").padEnd(64, "b"),
    "2026-10-03",
    "2026-10-25",
    "USD",
    3300,
    200,
    3500,
    1,
    3500,
    null,
    JSON.stringify(extracted),
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
    "ALERT_THRESHOLD_EXCEEDED",
    "Supera el umbral de aprobación autónoma de $1.000",
    "v1",
    3500,
    "AGENTE",
    "2026-10-17T00:00:01.000Z",
  );

  db.prepare(
    `INSERT INTO approvals (id, decision_id, invoice_id, status, requested_at, resolved_by,
      resolved_at, comment, override_with_overbudget)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(
    approvalId,
    decisionId,
    invoiceId,
    "PENDIENTE",
    "2026-10-17T00:00:02.000Z",
    null,
    null,
    null,
    0,
  );

  return { invoiceId, decisionId, approvalId };
}

beforeEach(() => {
  db = loadDb(":memory:");
});

afterEach(() => {
  closeDb();
});

function count(sql: string): number {
  return (db.prepare(sql).get() as { n: number }).n;
}

test("GET /api/approvals?status=pendiente lista el ESCALAR con proveedor y motivo", async () => {
  const escalation = insertEscalation();
  const app = await buildApp({ logLevel: "silent" });

  try {
    const res = await app.inject({ method: "GET", url: "/api/approvals?status=pendiente" });

    assert.equal(res.statusCode, 200);
    assert.equal(res.json().length, 1);
    assert.equal(res.json()[0].id, escalation.approvalId);
    assert.equal(res.json()[0].vendor_name, "Growth Agency");
    assert.equal(res.json()[0].amount_usd, 3500);
    assert.equal(res.json()[0].reason_code, "ALERT_THRESHOLD_EXCEEDED");
  } finally {
    await app.close();
  }
});

test("una aprobacion cuyo caso dispara una regla 1-3 responde 409 y no habilita PAGAR", async () => {
  const escalation = insertEscalation(false);
  const app = await buildApp({ logLevel: "silent" });

  try {
    const res = await app.inject({
      method: "POST",
      url: `/api/approvals/${escalation.approvalId}`,
      payload: { approve: true, resolved_by: "operador@blinka" },
    });

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.json(), { error: "rules_block_approval" });
    assert.equal(
      (
        db.prepare("SELECT status FROM invoices WHERE id = ?").get(escalation.invoiceId) as {
          status: string;
        }
      ).status,
      "PENDIENTE_APROBACION",
    );
    assert.equal(count("SELECT COUNT(*) AS n FROM ledger_entries"), 0);
  } finally {
    await app.close();
  }
});

test("doble clic en Autorizar: un solo ledger, mismo resolved_at y segunda respuesta 200", async () => {
  const escalation = insertEscalation();
  const app = await buildApp({ logLevel: "silent" });
  const payload = { approve: true, resolved_by: "operador@blinka", comment: "ok" };

  try {
    const first = await app.inject({
      method: "POST",
      url: `/api/approvals/${escalation.approvalId}`,
      payload,
    });
    const resolvedAt = (
      db.prepare("SELECT resolved_at FROM approvals WHERE id = ?").get(escalation.approvalId) as {
        resolved_at: string;
      }
    ).resolved_at;
    const second = await app.inject({
      method: "POST",
      url: `/api/approvals/${escalation.approvalId}`,
      payload,
    });

    assert.equal(first.statusCode, 200);
    assert.equal(first.json().status, "APROBADA");
    assert.ok(first.json().ledger);
    assert.equal(second.statusCode, 200);
    assert.equal(second.json().status, "APROBADA");
    assert.equal(count("SELECT COUNT(*) AS n FROM ledger_entries"), 1);
    assert.equal(
      (
        db.prepare("SELECT resolved_at FROM approvals WHERE id = ?").get(escalation.approvalId) as {
          resolved_at: string;
        }
      ).resolved_at,
      resolvedAt,
    );
    assert.equal(
      (
        db.prepare("SELECT status FROM invoices WHERE id = ?").get(escalation.invoiceId) as {
          status: string;
        }
      ).status,
      "APROBADA",
    );
  } finally {
    await app.close();
  }
});

test("negar deja la factura FRENADA y no escribe ledger", async () => {
  const escalation = insertEscalation();
  const app = await buildApp({ logLevel: "silent" });

  try {
    const res = await app.inject({
      method: "POST",
      url: `/api/approvals/${escalation.approvalId}`,
      payload: { approve: false, resolved_by: "operador@blinka" },
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { status: "NEGADA" });
    assert.equal(count("SELECT COUNT(*) AS n FROM ledger_entries"), 0);
    assert.equal(
      (
        db.prepare("SELECT status FROM invoices WHERE id = ?").get(escalation.invoiceId) as {
          status: string;
        }
      ).status,
      "FRENADA",
    );
  } finally {
    await app.close();
  }
});

test("una aprobacion inexistente responde 404", async () => {
  const app = await buildApp({ logLevel: "silent" });

  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/approvals/no-existe",
      payload: { approve: true, resolved_by: "operador@blinka" },
    });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.json(), { error: "not_found" });
  } finally {
    await app.close();
  }
});
