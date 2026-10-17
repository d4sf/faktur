import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import type Database from "better-sqlite3";

import { buildApp } from "../app.js";
import { closeDb, loadDb } from "../db/index.js";

const PAYLOAD = readFileSync(new URL("../../../fixtures/TC-01.json", import.meta.url));

let db: Database.Database;
let dataDir: string;
let previousDataDir: string | undefined;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "faktur-explain-"));
  previousDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = dataDir;
  db = loadDb(":memory:");
});

afterEach(() => {
  closeDb();
  if (previousDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previousDataDir;
  rmSync(dataDir, { recursive: true, force: true });
});

function multipart(content: Buffer): { body: Buffer; contentType: string } {
  const boundary = `----faktur-${Math.random().toString(16).slice(2)}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="tc.json"\r\nContent-Type: application/json\r\n\r\n`,
    ),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

test("404 si la factura no existe", async () => {
  const app = await buildApp({ logLevel: "silent" });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/invoices/no-existe/explain",
      payload: {},
    });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.json(), { error: "not_found" });
  } finally {
    await app.close();
  }
});

test("400 invalid_body si regenerate no es boolean", async () => {
  const app = await buildApp({ logLevel: "silent" });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/invoices/alguna/explain",
      payload: { regenerate: "si" },
    });
    // puede ser 404 o 400 según orden; el body inválido se valida antes de buscar factura
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json(), { error: "invalid_body" });
  } finally {
    await app.close();
  }
});

test("409 not_explainable para una factura PAGAR", async () => {
  const app = await buildApp({ logLevel: "silent" });
  const form = multipart(PAYLOAD);
  try {
    const uploaded = await app.inject({
      method: "POST",
      url: "/api/invoices",
      headers: { "content-type": form.contentType },
      payload: form.body,
    });
    const invoiceId = uploaded.json().invoice_id as string;
    const res = await app.inject({
      method: "POST",
      url: `/api/invoices/${invoiceId}/explain`,
      payload: {},
    });
    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.json(), { error: "not_explainable" });
  } finally {
    await app.close();
  }
});

test("503 explanation_not_configured sin API key para una factura FRENAR", async () => {
  const previous = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const app = await buildApp({ logLevel: "silent" });
  try {
    // Sembrar una factura frenada directamente en la base
    db.prepare(
      `INSERT INTO invoices (id, status, file_name, mime_type, file_hash, currency, total_amount, fx_rate_used, total_usd, extraction_json, ingested_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      "inv-frenada",
      "FRENADA",
      "t.json",
      "application/json",
      "b".repeat(64),
      "USD",
      100,
      1,
      100,
      JSON.stringify({ invoice_number: "INV-X", total_amount: 100, currency: "USD" }),
      "2026-10-17T00:00:00.000Z",
    );
    db.prepare(
      `INSERT INTO decisions (id, invoice_id, ingest_attempt_id, verdict, reason_code, explanation, policy_version, amount_usd_evaluated, decided_by, decided_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      "dec-frenada",
      "inv-frenada",
      null,
      "FRENAR",
      "ERR_INVALID_DATA",
      "motivo",
      "v1",
      100,
      "AGENTE",
      "2026-10-17T00:00:00.000Z",
    );
    const res = await app.inject({
      method: "POST",
      url: "/api/invoices/inv-frenada/explain",
      payload: {},
    });
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.json(), { error: "explanation_not_configured" });
  } finally {
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
    await app.close();
  }
});
