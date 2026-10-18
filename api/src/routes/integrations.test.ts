import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { buildApp } from "../app.js";
import { closeDb, loadDb } from "../db/index.js";

let previousDataDir: string | undefined;

beforeEach(() => {
  previousDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = "/tmp/opencode/integrations-test";
  loadDb(":memory:");
});

afterEach(() => {
  closeDb();
  if (previousDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previousDataDir;
});

test("GET /api/integrations/slack devuelve not configured inicialmente", async () => {
  const app = await buildApp({ logLevel: "silent" });
  try {
    const res = await app.inject({ method: "GET", url: "/api/integrations/slack" });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { configured: false, url: null });
  } finally {
    await app.close();
  }
});

test("PUT /api/integrations/slack guarda una URL válida", async () => {
  const app = await buildApp({ logLevel: "silent" });
  try {
    const res = await app.inject({
      method: "PUT",
      url: "/api/integrations/slack",
      payload: { url: "https://hooks.slack.com/services/T/B/X" },
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { configured: true });

    const get = await app.inject({ method: "GET", url: "/api/integrations/slack" });
    assert.equal(get.json().configured, true);
    assert.notEqual(get.json().url, null);
  } finally {
    await app.close();
  }
});

test("PUT /api/integrations/slack rechaza URL inválida con 422", async () => {
  const app = await buildApp({ logLevel: "silent" });
  try {
    const res = await app.inject({
      method: "PUT",
      url: "/api/integrations/slack",
      payload: { url: "http://not-https" },
    });
    assert.equal(res.statusCode, 422);
    assert.equal(res.json().error, "invalid_url");
  } finally {
    await app.close();
  }
});

test("PUT /api/integrations/slack rechaza body inválido con 400", async () => {
  const app = await buildApp({ logLevel: "silent" });
  try {
    const res = await app.inject({
      method: "PUT",
      url: "/api/integrations/slack",
      payload: { url: "" },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, "invalid_body");
  } finally {
    await app.close();
  }
});

test("DELETE /api/integrations/slack borra la config", async () => {
  const app = await buildApp({ logLevel: "silent" });
  try {
    await app.inject({
      method: "PUT",
      url: "/api/integrations/slack",
      payload: { url: "https://hooks.slack.com/services/T/B/X" },
    });
    const del = await app.inject({ method: "DELETE", url: "/api/integrations/slack" });
    assert.equal(del.statusCode, 200);
    assert.deepEqual(del.json(), { configured: false });

    const get = await app.inject({ method: "GET", url: "/api/integrations/slack" });
    assert.equal(get.json().configured, false);
  } finally {
    await app.close();
  }
});

test("POST /api/integrations/slack/test sin url ni config devuelve 400", async () => {
  const app = await buildApp({ logLevel: "silent" });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/integrations/slack/test",
      payload: {},
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, "no_url_configured");
  } finally {
    await app.close();
  }
});
