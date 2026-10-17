import assert from "node:assert/strict";
import test from "node:test";

import { closeDb, getDb, loadDb } from "./index.js";

test("loadDb crea la base y getDb la devuelve", () => {
  closeDb();
  const db = loadDb(":memory:");
  assert.equal(db, getDb());
  closeDb();
});

test("loadDb es idempotente", () => {
  closeDb();
  const db1 = loadDb(":memory:");
  const db2 = loadDb(":memory:");
  assert.equal(db1, db2);
  closeDb();
});

test("getDb lanza si no se ha cargado", () => {
  closeDb();
  assert.throws(() => getDb(), /no inicializada/i);
});

test("closeDb libera la instancia", () => {
  closeDb();
  loadDb(":memory:");
  closeDb();
  assert.throws(() => getDb(), /no inicializada/i);
});

test("foreign_keys esta ON", () => {
  closeDb();
  const db = loadDb(":memory:");
  const fk = db.pragma("foreign_keys") as { foreign_keys: number }[];
  assert.equal(fk[0].foreign_keys, 1);
  closeDb();
});

test("loadDb aplica schema y seed", () => {
  closeDb();
  const db = loadDb(":memory:");
  const tables = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get() as {
    n: number;
  };
  assert.ok(tables.n >= 12);
  const vendors = (db.prepare("SELECT COUNT(*) AS n FROM vendors").get() as { n: number }).n;
  assert.equal(vendors, 8);
  closeDb();
});
