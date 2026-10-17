import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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
  dataDir = mkdtempSync(join(tmpdir(), "faktur-routes-"));
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

test("dos uploads del mismo archivo: segundo 200 FRENAR, 2 intentos y 0 facturas", async () => {
  const app = await buildApp({ logLevel: "silent" });
  const first = multipart(PAYLOAD);
  const second = multipart(PAYLOAD, { filename: "tc-01-copia.json" });

  try {
    const a = await app.inject({
      method: "POST",
      url: "/api/invoices",
      headers: { "content-type": first.contentType },
      payload: first.body,
    });
    const b = await app.inject({
      method: "POST",
      url: "/api/invoices",
      headers: { "content-type": second.contentType },
      payload: second.body,
    });

    assert.equal(a.statusCode, 202);
    assert.equal(a.json().status, "RECIBIDA");
    assert.equal(b.statusCode, 200, `no debe ser 500 por UNIQUE: ${b.body}`);
    assert.equal(b.json().verdict, "FRENAR");
    assert.equal(b.json().reason_code, "ERR_DUPLICATE_INVOICE");

    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM ingest_attempts").get() as { n: number }).n,
      2,
    );
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM invoices").get() as { n: number }).n, 0);
  } finally {
    await app.close();
  }
});

test("MIME no permitido responde 400 invalid_file_type", async () => {
  const app = await buildApp({ logLevel: "silent" });
  const bad = multipart(PAYLOAD, { filename: "x.exe", mimeType: "application/x-msdownload" });

  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/invoices",
      headers: { "content-type": bad.contentType },
      payload: bad.body,
    });

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json(), { error: "invalid_file_type" });
  } finally {
    await app.close();
  }
});
