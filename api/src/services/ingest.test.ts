import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import type Database from "better-sqlite3";

import { closeDb, loadDb } from "../db/index.js";
import { getDecisionForAttempt } from "../repositories/decisions.js";
import { ingestFile } from "./ingest.js";

const FIXTURE = readFileSync(new URL("../../../fixtures/TC-01.json", import.meta.url));

let db: Database.Database;
let dataDir: string;
let previousDataDir: string | undefined;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "faktur-ingest-"));
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

test("el mismo buffer dos veces: segunda DUPLICADA y decision FRENAR anclada al intento", () => {
  const a = ingestFile({ buffer: FIXTURE, fileName: "tc-01.json", mimeType: "application/json" });
  const b = ingestFile({
    buffer: FIXTURE,
    fileName: "tc-01-copia.json",
    mimeType: "application/json",
  });

  assert.equal(a.status, "RECIBIDA");
  assert.equal(b.status, "DUPLICADA");
  assert.equal(getDecisionForAttempt(b.attempt_id)?.reason_code, "ERR_DUPLICATE_INVOICE");
  assert.equal(getDecisionForAttempt(b.attempt_id)?.amount_usd_evaluated, 0);
  assert.equal(b.invoice_id, null, "la primera subida todavía no creó factura");
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS n FROM ingest_attempts").get() as { n: number }).n,
    2,
  );
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM invoices").get() as { n: number }).n, 0);
});

test("guarda el buffer una sola vez por hash", () => {
  ingestFile({ buffer: FIXTURE, fileName: "tc-01.json", mimeType: "application/json" });
  ingestFile({ buffer: FIXTURE, fileName: "tc-01-copia.json", mimeType: "application/json" });

  assert.equal(readdirSync(join(dataDir, "uploads")).length, 1);
});

test("un MIME fuera de la lista no crea intento", () => {
  assert.throws(
    () => ingestFile({ buffer: FIXTURE, fileName: "x.exe", mimeType: "application/x-msdownload" }),
    /invalid_file_type/,
  );
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS n FROM ingest_attempts").get() as { n: number }).n,
    0,
  );
});
