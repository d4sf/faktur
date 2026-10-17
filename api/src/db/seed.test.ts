import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";

import { applySchema } from "./schema.js";
import { seed } from "./seed.js";

function freshDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applySchema(db);
  return db;
}

test("seed inserta 6 categorias", () => {
  const db = freshDb();
  seed(db);
  const count = (db.prepare("SELECT COUNT(*) AS n FROM categories").get() as { n: number }).n;
  assert.equal(count, 6);
  db.close();
});

test("seed inserta 8 vendors", () => {
  const db = freshDb();
  seed(db);
  const count = (db.prepare("SELECT COUNT(*) AS n FROM vendors").get() as { n: number }).n;
  assert.equal(count, 8);
  db.close();
});

test("seed inserta policy v1", () => {
  const db = freshDb();
  seed(db);
  const row = db.prepare("SELECT version, is_active FROM policies").get() as { version: string; is_active: number };
  assert.equal(row.version, "v1");
  assert.equal(row.is_active, 1);
  db.close();
});

test("seed inserta 6 budgets", () => {
  const db = freshDb();
  seed(db);
  const count = (db.prepare("SELECT COUNT(*) AS n FROM policy_category_budgets").get() as { n: number }).n;
  assert.equal(count, 6);
  db.close();
});

test("seed inserta 4 fx_rates", () => {
  const db = freshDb();
  seed(db);
  const count = (db.prepare("SELECT COUNT(*) AS n FROM fx_rates").get() as { n: number }).n;
  assert.equal(count, 4);
  db.close();
});

test("seed es idempotente", () => {
  const db = freshDb();
  seed(db);
  seed(db);
  const count = (db.prepare("SELECT COUNT(*) AS n FROM vendors").get() as { n: number }).n;
  assert.equal(count, 8);
  db.close();
});

test("seed incluye VENTA-POS-DUO como BLOCKLISTED", () => {
  const db = freshDb();
  seed(db);
  const row = db.prepare("SELECT status FROM vendors WHERE tax_id = 'VENTA-POS-DUO'").get() as { status: string };
  assert.equal(row.status, "BLOCKLISTED");
  db.close();
});

test("seed incluye Marketing con budget 4000", () => {
  const db = freshDb();
  seed(db);
  const row = db.prepare("SELECT budget_usd FROM policy_category_budgets WHERE category = 'Marketing'").get() as { budget_usd: number };
  assert.equal(row.budget_usd, 4000);
  db.close();
});

test("seed incluye las 6 categorias", () => {
  const db = freshDb();
  seed(db);
  const count = (db.prepare("SELECT COUNT(*) AS n FROM categories").get() as { n: number }).n;
  assert.equal(count, 6);
  const names = db.prepare("SELECT name FROM categories ORDER BY name").all().map((r: { name: string }) => r.name);
  assert.deepEqual(names, ["Diseno", "Infraestructura", "Legal", "Marketing", "Retail", "Software"]);
  db.close();
});
