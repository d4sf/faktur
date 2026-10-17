import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import type Database from "better-sqlite3";

import { closeDb, loadDb } from "./index.js";
import { seedDemoSet } from "./demoSeed.js";

const GROUND_TRUTH = JSON.parse(
  readFileSync(new URL("../../../fixtures/ground_truth.json", import.meta.url), "utf8"),
) as Record<string, { expected_verdict: string }>;

let db: Database.Database;
let dataDir: string;
let previousDataDir: string | undefined;

function counts(): Record<string, number> {
  const tables = ["invoices", "ingest_attempts", "decisions", "approvals", "ledger_entries"];
  return Object.fromEntries(
    tables.map((table) => [
      table,
      (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n,
    ]),
  );
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "faktur-demo-"));
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

test("el seed demo es idempotente y reproduce ground_truth.json", () => {
  const first = seedDemoSet(db);
  const firstCounts = counts();

  const second = seedDemoSet(db);
  const secondCounts = counts();

  assert.equal(first.seeded, 12);
  assert.equal(second.seeded, 12);
  assert.deepEqual(secondCounts, firstCounts);
  assert.deepEqual(
    first.verdicts,
    Object.fromEntries(
      Object.entries(GROUND_TRUTH).map(([tc, entry]) => [tc, entry.expected_verdict]),
    ),
  );

  assert.equal(firstCounts.invoices, 11, "TC-03 es duplicado: no crea factura");
  assert.equal(firstCounts.ingest_attempts, 12);
  assert.equal(firstCounts.decisions, 12);
  assert.equal(firstCounts.ledger_entries, 3, "solo los PAGAR imputan");
  assert.equal(
    (
      db.prepare("SELECT COUNT(*) AS n FROM approvals WHERE status = 'PENDIENTE'").get() as {
        n: number;
      }
    ).n,
    4,
    "TC-04, TC-06, TC-07 y TC-10 quedan en la bandeja",
  );
  assert.equal(
    (
      db.prepare("SELECT COUNT(*) AS n FROM approvals WHERE status = 'NEGADA'").get() as {
        n: number;
      }
    ).n,
    2,
    "TC-05 y TC-12 quedan resueltos como negados",
  );
});
