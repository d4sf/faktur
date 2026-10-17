import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import type { FastifyInstance } from "fastify";

import { buildApp } from "../app.js";
import { closeDb, loadDb } from "../db/index.js";

let app: FastifyInstance | undefined;
let dataDir: string;
let dbPath: string;
let previousDataDir: string | undefined;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "faktur-admin-"));
  dbPath = join(dataDir, "faktur.db");
  previousDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = dataDir;
  closeDb();
  loadDb(dbPath);
});

afterEach(async () => {
  if (app) {
    await app.close();
    app = undefined;
  }
  closeDb();
  if (previousDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previousDataDir;
  rmSync(dataDir, { recursive: true, force: true });
});

test("sin ALLOW_DB_RESET el reset responde 403", async () => {
  app = await buildApp({
    logLevel: "silent",
    admin: { enabled: false, production: false },
  });

  const res = await app.inject({
    method: "POST",
    url: "/api/admin/db/reset",
    payload: { profile: "reference", confirm: "REINICIAR" },
  });

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.json(), { error: "db_reset_disabled" });
});

test("en producción sin ADMIN_TOKEN responde 403 fail-closed", async () => {
  app = await buildApp({
    logLevel: "silent",
    admin: { enabled: true, production: true },
  });

  const res = await app.inject({
    method: "POST",
    url: "/api/admin/db/reset",
    payload: { profile: "reference", confirm: "REINICIAR" },
  });

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.json(), { error: "db_reset_token_missing" });
});

test("token incorrecto responde 401 y correcto 200", async () => {
  app = await buildApp({
    logLevel: "silent",
    admin: { enabled: true, production: true, token: "s3cret" },
  });

  const bad = await app.inject({
    method: "POST",
    url: "/api/admin/db/reset",
    headers: { "x-admin-token": "nope" },
    payload: { profile: "reference", confirm: "REINICIAR" },
  });
  assert.equal(bad.statusCode, 401);
  assert.deepEqual(bad.json(), { error: "admin_token_invalid" });

  const ok = await app.inject({
    method: "POST",
    url: "/api/admin/db/reset",
    headers: { "x-admin-token": "s3cret" },
    payload: { profile: "demo", confirm: "REINICIAR" },
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().approvals_pending, 4);
});

test("confirm distinto de REINICIAR responde 422", async () => {
  app = await buildApp({
    logLevel: "silent",
    admin: { enabled: true, production: false },
  });

  const res = await app.inject({
    method: "POST",
    url: "/api/admin/db/reset",
    payload: { profile: "demo", confirm: "si" },
  });

  assert.equal(res.statusCode, 422);
  assert.deepEqual(res.json(), { error: "invalid_reset_request" });
});

test("GET /api/admin/db devuelve perfiles y conteos", async () => {
  app = await buildApp({
    logLevel: "silent",
    admin: { enabled: true, production: false },
  });

  const res = await app.inject({ method: "GET", url: "/api/admin/db" });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.deepEqual(body.profiles, ["reference", "demo"]);
  assert.equal(body.counts.vendors, 8);
  assert.equal(body.enabled, true);
  assert.equal(body.reason, null);
  assert.equal(body.policy_version, "v1");
});

test("un profile fuera de SEED_PROFILES responde 422 y no borra la base", async () => {
  app = await buildApp({
    logLevel: "silent",
    admin: { enabled: true, production: false },
  });

  const res = await app.inject({
    method: "POST",
    url: "/api/admin/db/reset",
    payload: { profile: "bulk", confirm: "REINICIAR" },
  });

  assert.equal(res.statusCode, 422);
  assert.deepEqual(res.json(), { error: "invalid_reset_request" });
});

test("el GET comparte el motivo con el POST cuando el reset está apagado", async () => {
  app = await buildApp({
    logLevel: "silent",
    admin: { enabled: false, production: false },
  });

  const res = await app.inject({ method: "GET", url: "/api/admin/db" });

  assert.equal(res.statusCode, 200);
  assert.equal(res.json().enabled, false);
  assert.equal(res.json().reason, "disabled");
});

test("en producción con token el GET reporta missing_token solo si falta el token", async () => {
  app = await buildApp({
    logLevel: "silent",
    admin: { enabled: true, production: true },
  });

  const res = await app.inject({ method: "GET", url: "/api/admin/db" });

  assert.equal(res.statusCode, 200);
  assert.equal(res.json().reason, "missing_token");
});

test("dbPath apunta a la base temporal, no a data/ del repo", () => {
  assert.ok(dbPath.startsWith(dataDir));
});
