import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import type Database from "better-sqlite3";

import { invoiceFactory } from "./factories.js";
import { closeDb, getDb, loadDb } from "./index.js";
import { clearUploads, removeDbFiles, resetDatabase } from "./reset.js";

let db: Database.Database;
let dataDir: string;
let dbPath: string;
let previousDataDir: string | undefined;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "faktur-reset-"));
  dbPath = join(dataDir, "faktur.db");
  previousDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = dataDir;
  db = loadDb(dbPath);
});

afterEach(() => {
  closeDb();
  if (previousDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previousDataDir;
  rmSync(dataDir, { recursive: true, force: true });
});

test("reset con reference deja la base vacía de facturas y vendors re-sembrados", () => {
  invoiceFactory(db, {});

  const result = resetDatabase({ dbPath, profile: "reference" });

  assert.equal(result.counts.invoices, 0);
  assert.equal(result.counts.vendors, 8);
  assert.equal((getDb().prepare("SELECT COUNT(*) AS n FROM invoices").get() as { n: number }).n, 0);
});

test("reset borra -wal y -shm", () => {
  writeFileSync(dbPath + "-wal", "");
  writeFileSync(dbPath + "-shm", "");

  const removed = removeDbFiles(dbPath);

  assert.ok(removed.some((p) => p.endsWith("-wal")));
  assert.ok(removed.some((p) => p.endsWith("-shm")));
});

test("reset vacía uploads/ y cuenta las entradas", () => {
  const uploads = join(dataDir, "uploads");
  mkdirSync(uploads, { recursive: true });
  writeFileSync(join(uploads, "hash-abc"), "x");

  assert.equal(clearUploads(uploads), 1);
});

test("reset con demo siembra los fixtures y es idempotente", () => {
  const first = resetDatabase({ dbPath, profile: "demo" });
  const second = resetDatabase({ dbPath, profile: "demo" });

  assert.equal(first.counts.invoices, 11);
  assert.equal(first.counts.invoices, second.counts.invoices);
  assert.equal(second.approvals_pending, 4);
});

test("reset rechaza :memory:", () => {
  assert.throws(
    () => resetDatabase({ dbPath: ":memory:", profile: "reference" }),
    /reset_no_soportado_en_memoria/,
  );
});
