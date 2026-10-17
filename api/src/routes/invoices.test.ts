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

test("dos uploads del mismo archivo: segundo 200 FRENAR, 2 intentos y 1 factura", async () => {
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

    assert.equal(a.statusCode, 201, a.body);
    assert.equal(a.json().verdict, "PAGAR");
    assert.ok(a.json().invoice_id);
    assert.equal(b.statusCode, 200, `no debe ser 500 por UNIQUE: ${b.body}`);
    assert.equal(b.json().verdict, "FRENAR");
    assert.equal(b.json().reason_code, "ERR_DUPLICATE_INVOICE");

    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM ingest_attempts").get() as { n: number }).n,
      2,
    );
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM invoices").get() as { n: number }).n, 1);
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

test("POST /api/invoices/:id/decide responde el veredicto y 409 si ya no está EXTRAIDA", async () => {
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
    db.prepare("UPDATE invoices SET status = 'EXTRAIDA' WHERE id = ?").run(invoiceId);

    const decided = await app.inject({
      method: "POST",
      url: `/api/invoices/${invoiceId}/decide`,
    });
    assert.equal(decided.statusCode, 200);
    assert.equal(decided.json().verdict, "PAGAR");
    assert.equal(decided.json().policy_version, "v1");
    assert.ok(decided.json().decision_id);

    const again = await app.inject({
      method: "POST",
      url: `/api/invoices/${invoiceId}/decide`,
    });
    assert.equal(again.statusCode, 409);
    assert.deepEqual(again.json(), { error: "status_transition_invalid" });
  } finally {
    await app.close();
  }
});

test("POST /api/invoices/:id/decide responde 404 si la factura no existe", async () => {
  const app = await buildApp({ logLevel: "silent" });

  try {
    const res = await app.inject({ method: "POST", url: "/api/invoices/no-existe/decide" });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.json(), { error: "not_found" });
  } finally {
    await app.close();
  }
});

test("el segundo nivel de dedup: mismo vendor+numero con otro hash frena, no 500", async () => {
  const app = await buildApp({ logLevel: "silent" });
  const extracted = JSON.parse(PAYLOAD.toString("utf8")) as Record<string, unknown>;
  const variant = Buffer.from(JSON.stringify({ ...extracted, issue_date: "2026-10-02" }));
  const first = multipart(PAYLOAD);
  const second = multipart(variant, { filename: "tc-01-resaved.json" });

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

    assert.equal(a.statusCode, 201, a.body);
    assert.equal(b.statusCode, 200, `no debe filtrar SQLITE_CONSTRAINT: ${b.body}`);
    assert.equal(b.json().verdict, "FRENAR");
    assert.equal(b.json().reason_code, "ERR_DUPLICATE_INVOICE");
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM invoices").get() as { n: number }).n, 1);
    assert.equal(
      (
        db
          .prepare(
            "SELECT COUNT(*) AS n FROM decisions WHERE reason_code = 'ERR_DUPLICATE_INVOICE'",
          )
          .get() as { n: number }
      ).n,
      1,
    );
    const secondAttempt = db
      .prepare("SELECT attempt_status FROM ingest_attempts WHERE file_name = 'tc-01-resaved.json'")
      .get() as { attempt_status: string };
    assert.equal(secondAttempt.attempt_status, "DUPLICADA");
  } finally {
    await app.close();
  }
});

test("una moneda fuera de allowed_currencies se decide FRENAR, no 422", async () => {
  const app = await buildApp({ logLevel: "silent" });
  const spec = JSON.parse(
    readFileSync(new URL("../../../specs/policy.spec.json", import.meta.url), "utf8"),
  ) as Record<string, unknown>;
  const rest = { ...spec };
  delete rest.version;

  try {
    const policy = await app.inject({
      method: "PUT",
      url: "/api/policy",
      payload: { ...rest, allowed_currencies: ["USD"] },
    });
    assert.equal(policy.statusCode, 201, policy.body);

    const eur = readFileSync(new URL("../../../fixtures/TC-06.json", import.meta.url));
    const form = multipart(eur, { filename: "tc-06.json" });
    const res = await app.inject({
      method: "POST",
      url: "/api/invoices",
      headers: { "content-type": form.contentType },
      payload: form.body,
    });

    assert.equal(res.statusCode, 201, res.body);
    assert.equal(res.json().verdict, "FRENAR");
    assert.equal(res.json().reason_code, "ERR_INVALID_DATA");
  } finally {
    await app.close();
  }
});
