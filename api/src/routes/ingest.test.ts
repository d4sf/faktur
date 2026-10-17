import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import type Database from "better-sqlite3";

import { buildApp } from "../app.js";
import { closeDb, loadDb } from "../db/index.js";

const JSON_FIXTURE = readFileSync(new URL("../../../fixtures/TC-01.json", import.meta.url));

let db: Database.Database;
let dataDir: string;
let previousDataDir: string | undefined;
let previousKey: string | undefined;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "faktur-extract-"));
  previousDataDir = process.env.DATA_DIR;
  previousKey = process.env.GEMINI_API_KEY;
  process.env.DATA_DIR = dataDir;
  delete process.env.GEMINI_API_KEY;
  db = loadDb(":memory:");
});

afterEach(() => {
  closeDb();
  if (previousDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previousDataDir;
  if (previousKey !== undefined) process.env.GEMINI_API_KEY = previousKey;
  rmSync(dataDir, { recursive: true, force: true });
});

function multipart(
  content: Buffer,
  { filename = "tc-01.json", mimeType = "application/json" } = {},
): { body: Buffer; contentType: string } {
  const boundary = `----faktur-${Math.random().toString(16).slice(2)}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: ${mimeType}\r\n\r\n`,
    ),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

async function upload(app: Awaited<ReturnType<typeof buildApp>>, content: Buffer, opts = {}) {
  const form = multipart(content, opts);
  return app.inject({
    method: "POST",
    url: "/api/invoices",
    headers: { "content-type": form.contentType },
    payload: form.body,
  });
}

test("extrae un JSON mock y persiste la factura EXTRAIDA en el upload", async () => {
  const app = await buildApp({ logLevel: "silent" });

  try {
    const uploaded = await upload(app, JSON_FIXTURE);
    assert.equal(uploaded.statusCode, 201);
    const attemptId = uploaded.json().attempt_id as string;
    const invoiceId = uploaded.json().invoice_id as string;

    const invoice = db
      .prepare("SELECT status, total_usd FROM invoices WHERE id = ?")
      .get(invoiceId) as { status: string; total_usd: number };
    assert.equal(invoice.status, "DECIDIDA");
    assert.equal(invoice.total_usd, 420);

    const again = await app.inject({
      method: "POST",
      url: `/api/ingest-attempts/${attemptId}/extract`,
    });
    assert.equal(again.statusCode, 409);
    assert.deepEqual(again.json(), { error: "already_processed" });
  } finally {
    await app.close();
  }
});

test("un PDF sin API key responde 503 extraction_not_configured", async () => {
  const app = await buildApp({ logLevel: "silent" });

  try {
    const res = await upload(app, Buffer.from("%PDF-1.4"), {
      filename: "factura.pdf",
      mimeType: "application/pdf",
    });

    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.json(), { error: "extraction_not_configured" });
    const attempts = db.prepare("SELECT attempt_status FROM ingest_attempts").all() as Array<{
      attempt_status: string;
    }>;
    assert.equal(attempts[0]?.attempt_status, "RECIBIDA");
  } finally {
    await app.close();
  }
});

test("un JSON invalido deja el intento RECHAZADA y responde 422", async () => {
  const app = await buildApp({ logLevel: "silent" });

  try {
    const res = await upload(app, Buffer.from('{"invoice_number":"solo-esto"}'));

    assert.equal(res.statusCode, 422);
    assert.deepEqual(res.json(), { error: "extraction_invalid" });
    const attempt = db.prepare("SELECT attempt_status FROM ingest_attempts").get() as {
      attempt_status: string;
    };
    assert.equal(attempt.attempt_status, "RECHAZADA");
  } finally {
    await app.close();
  }
});

test("un intento inexistente responde 404 not_found", async () => {
  const app = await buildApp({ logLevel: "silent" });

  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/ingest-attempts/no-existe/extract",
    });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.json(), { error: "not_found" });
  } finally {
    await app.close();
  }
});
