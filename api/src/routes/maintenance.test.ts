import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { buildApp } from "../app.js";
import { closeDb, loadDb } from "../db/index.js";

let previousSecret: string | undefined;
let previousDataDir: string | undefined;

beforeEach(() => {
  previousSecret = process.env.MAINTENANCE_SECRET;
  previousDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = "/tmp/opencode/maint-test";
  process.env.MAINTENANCE_SECRET = "secret123";
  loadDb(":memory:");
});

afterEach(() => {
  closeDb();
  if (previousSecret === undefined) delete process.env.MAINTENANCE_SECRET;
  else process.env.MAINTENANCE_SECRET = previousSecret;
  if (previousDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previousDataDir;
});

test("GET /api/maintenance devuelve enabled true por defecto", async () => {
  const app = await buildApp({ logLevel: "silent" });
  try {
    const res = await app.inject({ method: "GET", url: "/api/maintenance" });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { enabled: true });
  } finally {
    await app.close();
  }
});

test("POST /api/maintenance con secret válido desactiva el sitio", async () => {
  const app = await buildApp({ logLevel: "silent" });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/maintenance",
      headers: { "x-maintenance-secret": "secret123" },
      payload: { enabled: false },
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { enabled: false });

    const get = await app.inject({ method: "GET", url: "/api/maintenance" });
    assert.deepEqual(get.json(), { enabled: false });

    // La página raíz devuelve HTML "Flush"
    const root = await app.inject({ method: "GET", url: "/" });
    assert.equal(root.statusCode, 200);
    assert.match(root.headers["content-type"] as string, /text\/html/);
    assert.match(root.body, /Flush/);
  } finally {
    await app.close();
  }
});

test("POST /api/maintenance con secret válido reactiva el sitio", async () => {
  const app = await buildApp({ logLevel: "silent" });
  try {
    await app.inject({
      method: "POST",
      url: "/api/maintenance",
      headers: { "x-maintenance-secret": "secret123" },
      payload: { enabled: false },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/maintenance",
      headers: { "x-maintenance-secret": "secret123" },
      payload: { enabled: true },
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { enabled: true });

    const root = await app.inject({ method: "GET", url: "/" });
    // En modo activo, / devuelve el SPA (index.html) o 404 si no hay dist; no "Flush" centrado
    assert.doesNotMatch(root.body, /<h1>Flush<\/h1>/);
  } finally {
    await app.close();
  }
});

test("POST /api/maintenance con secret inválido devuelve 403", async () => {
  const app = await buildApp({ logLevel: "silent" });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/maintenance",
      headers: { "x-maintenance-secret": "wrong" },
      payload: { enabled: false },
    });
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.json(), { error: "invalid_secret" });
  } finally {
    await app.close();
  }
});

test("POST /api/maintenance con body inválido devuelve 400", async () => {
  const app = await buildApp({ logLevel: "silent" });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/maintenance",
      headers: { "x-maintenance-secret": "secret123" },
      payload: { enabled: "no" },
    });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json(), { error: "invalid_body" });
  } finally {
    await app.close();
  }
});

test("en modo desactivado, /api/health sigue funcionando", async () => {
  const app = await buildApp({ logLevel: "silent" });
  try {
    await app.inject({
      method: "POST",
      url: "/api/maintenance",
      headers: { "x-maintenance-secret": "secret123" },
      payload: { enabled: false },
    });
    const res = await app.inject({ method: "GET", url: "/api/health" });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { status: "ok" });
  } finally {
    await app.close();
  }
});

test("sin MAINTENANCE_SECRET configurado, POST devuelve 503", async () => {
  const prev = process.env.MAINTENANCE_SECRET;
  delete process.env.MAINTENANCE_SECRET;
  const app = await buildApp({ logLevel: "silent" });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/maintenance",
      headers: { "x-maintenance-secret": "secret123" },
      payload: { enabled: false },
    });
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.json(), { error: "maintenance_secret_not_configured" });
  } finally {
    if (prev === undefined) delete process.env.MAINTENANCE_SECRET;
    else process.env.MAINTENANCE_SECRET = prev;
    await app.close();
  }
});
