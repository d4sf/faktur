import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { buildApp } from "../app.js";
import { closeDb, loadDb } from "../db/index.js";

let previousDataDir: string | undefined;

beforeEach(() => {
  previousDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = "/tmp/opencode/ratelimit-test";
  loadDb(":memory:");
});

afterEach(() => {
  closeDb();
  if (previousDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previousDataDir;
});

test("global: el (max+1)-ésimo request devuelve 429 con Retry-After y data (rick astley)", async () => {
  const app = await buildApp({
    logLevel: "silent",
    rateLimit: { global: { max: 2, timeWindow: 60000 } },
  });
  try {
    const a = await app.inject({ method: "GET", url: "/api/audit-trail" });
    const b = await app.inject({ method: "GET", url: "/api/audit-trail" });
    const c = await app.inject({ method: "GET", url: "/api/audit-trail" });
    assert.equal(a.statusCode, 200);
    assert.equal(b.statusCode, 200);
    assert.equal(c.statusCode, 429);
    assert.ok(c.headers["retry-after"]);
    const body = c.json();
    assert.equal(body.error, "rate_limit_exceeded");
    assert.equal(body.data, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    assert.equal(typeof body.retry_after, "number");
  } finally {
    await app.close();
  }
});

test("health: no se limita", async () => {
  const app = await buildApp({
    logLevel: "silent",
    rateLimit: { global: { max: 1, timeWindow: 60000 } },
  });
  try {
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({ method: "GET", url: "/api/health" });
      assert.equal(res.statusCode, 200);
    }
  } finally {
    await app.close();
  }
});

test("rateLimit: false desactiva el limiter", async () => {
  const app = await buildApp({ logLevel: "silent", rateLimit: false });
  try {
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({ method: "GET", url: "/api/audit-trail" });
      assert.equal(res.statusCode, 200);
    }
  } finally {
    await app.close();
  }
});
