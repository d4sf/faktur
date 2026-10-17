import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import type Database from "better-sqlite3";

import { closeDb, loadDb } from "./index.js";
import { runSeedProfile, type SeedProfile } from "./seeders.js";

let db: Database.Database;
let dataDir: string;
let previousDataDir: string | undefined;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "faktur-seeders-"));
  previousDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = dataDir;
  closeDb();
  db = loadDb(":memory:");
});

afterEach(() => {
  closeDb();
  if (previousDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previousDataDir;
  rmSync(dataDir, { recursive: true, force: true });
});

test("reference deja 8 vendors y ninguna factura", () => {
  const result = runSeedProfile(db, "reference");
  assert.equal(result.profile, "reference");
  assert.equal(result.counts.vendors, 8);
  assert.equal(result.counts.invoices, 0);
  assert.equal(result.counts.policies, 1);
  assert.deepEqual(result.verdicts, {});
  assert.equal(result.approvals_pending, 0);
});

test("demo siembra los 12 TC y deja 4 aprobaciones pendientes", () => {
  const result = runSeedProfile(db, "demo");
  assert.equal(result.profile, "demo");
  assert.equal(Object.keys(result.verdicts).length, 12);
  assert.equal(result.approvals_pending, 4);
  assert.ok(result.counts.invoices >= 11);
});

test("demo es idempotente", () => {
  const first = runSeedProfile(db, "demo");
  const second = runSeedProfile(db, "demo");
  assert.equal(second.counts.invoices, first.counts.invoices);
  assert.equal(second.approvals_pending, first.approvals_pending);
});

test("perfil inválido lanza", () => {
  assert.throws(
    () => runSeedProfile(db, "otro" as unknown as SeedProfile),
    /seed_profile_invalido/,
  );
});
