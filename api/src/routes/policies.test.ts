import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, test } from "node:test";

import type Database from "better-sqlite3";

import { buildApp } from "../app.js";
import { closeDb, loadDb } from "../db/index.js";

const SPEC = JSON.parse(
  readFileSync(new URL("../../../specs/policy.spec.json", import.meta.url), "utf8"),
) as Record<string, unknown>;

const TC01 = JSON.parse(
  readFileSync(new URL("../../../fixtures/TC-01.json", import.meta.url), "utf8"),
) as Record<string, unknown>;

let db: Database.Database;

function candidate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const rest = { ...SPEC };
  delete rest.version;
  return { ...rest, ...overrides };
}

function insertInvoice(): string {
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
    "INV-9022",
    "DECIDIDA",
    "tc-01.json",
    "application/json",
    randomUUID().replace(/-/g, "").padEnd(64, "e"),
    "2026-10-01",
    "2026-10-15",
    "USD",
    400,
    20,
    420,
    1,
    420,
    null,
    JSON.stringify(TC01),
    "2026-10-17T00:00:00.000Z",
  );

  return invoiceId;
}

function insertV1Decision(invoiceId: string): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO decisions (id, invoice_id, ingest_attempt_id, verdict, reason_code, explanation,
      policy_version, amount_usd_evaluated, decided_by, decided_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id,
    invoiceId,
    null,
    "PAGAR",
    "SUCCESS_TOUCHLESS_STP",
    "Dentro de política",
    "v1",
    420,
    "AGENTE",
    "2026-10-17T00:00:01.000Z",
  );
  return id;
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

test("un PUT valido crea v2 y deja v1 inactiva sin tocar decisiones viejas", async () => {
  const invoiceId = insertInvoice();
  insertV1Decision(invoiceId);
  const app = await buildApp({ logLevel: "silent" });

  try {
    const res = await app.inject({
      method: "PUT",
      url: "/api/policy",
      payload: candidate({ auto_approval_threshold_usd: 300 }),
    });

    assert.equal(res.statusCode, 201, JSON.stringify(res.json()));
    assert.equal(res.json().version, "v2");
    const rows = db
      .prepare(
        "SELECT version, is_active, auto_approval_threshold_usd FROM policies ORDER BY version",
      )
      .all() as Array<{ version: string; is_active: number; auto_approval_threshold_usd: number }>;
    assert.deepEqual(rows, [
      { version: "v1", is_active: 0, auto_approval_threshold_usd: 1000 },
      { version: "v2", is_active: 1, auto_approval_threshold_usd: 300 },
    ]);
    assert.equal(
      (db.prepare("SELECT policy_version FROM decisions").get() as { policy_version: string })
        .policy_version,
      "v1",
    );

    const current = await app.inject({ method: "GET", url: "/api/policy" });
    assert.equal(current.json().version, "v2");
    assert.equal(current.json().auto_approval_threshold_usd, 300);
    assert.equal(current.json().category_budgets.Diseno, 1000);
  } finally {
    await app.close();
  }
});

test("el preview no escribe y muestra PAGAR -> ESCALAR", async () => {
  const invoiceId = insertInvoice();
  insertV1Decision(invoiceId);
  const app = await buildApp({ logLevel: "silent" });
  const before = {
    policies: count("SELECT COUNT(*) AS n FROM policies"),
    decisions: count("SELECT COUNT(*) AS n FROM decisions"),
  };

  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/policy/preview",
      payload: candidate({ auto_approval_threshold_usd: 300 }),
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json().affected, [
      {
        invoice_id: invoiceId,
        before: "PAGAR",
        after: "ESCALAR",
        reason_code: "ALERT_THRESHOLD_EXCEEDED",
      },
    ]);
    assert.equal(count("SELECT COUNT(*) AS n FROM policies"), before.policies);
    assert.equal(count("SELECT COUNT(*) AS n FROM decisions"), before.decisions);
  } finally {
    await app.close();
  }
});

test("una politica invalida responde 422 y no crea version", async () => {
  const app = await buildApp({ logLevel: "silent" });

  try {
    const res = await app.inject({
      method: "PUT",
      url: "/api/policy",
      payload: candidate({ auto_approval_threshold_usd: -1 }),
    });

    assert.equal(res.statusCode, 422);
    assert.deepEqual(res.json(), { error: "invalid_policy" });
    assert.equal(count("SELECT COUNT(*) AS n FROM policies"), 1);
  } finally {
    await app.close();
  }
});

test("min_extraction_confidence viaja en la version (ADR 0002)", async () => {
  const app = await buildApp({ logLevel: "silent" });

  try {
    await app.inject({
      method: "PUT",
      url: "/api/policy",
      payload: candidate({ min_extraction_confidence: 0.5 }),
    });

    const current = await app.inject({ method: "GET", url: "/api/policy" });
    assert.equal(current.json().min_extraction_confidence, 0.5);
  } finally {
    await app.close();
  }
});
