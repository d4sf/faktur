import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { buildApp } from "../app.js";
import { closeDb, loadDb } from "../db/index.js";

let previousDataDir: string | undefined;

beforeEach(() => {
  previousDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = "/tmp/opencode/billing-routes-test";
  loadDb(":memory:");
});

afterEach(() => {
  closeDb();
  if (previousDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previousDataDir;
});

test("GET /api/billing devuelve los tres planes y el plan actual", async () => {
  const app = await buildApp({ logLevel: "silent" });
  try {
    const res = await app.inject({ method: "GET", url: "/api/billing" });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.plan, "growth");
    assert.deepEqual(
      body.plans.map((plan: { id: string }) => plan.id),
      ["starter", "growth", "scale"],
    );
  } finally {
    await app.close();
  }
});

test("PUT /api/billing/plan persiste el plan elegido", async () => {
  const app = await buildApp({ logLevel: "silent" });
  try {
    const put = await app.inject({
      method: "PUT",
      url: "/api/billing/plan",
      payload: { plan: "starter" },
    });
    assert.equal(put.statusCode, 200);
    assert.equal(put.json().plan, "starter");

    const get = await app.inject({ method: "GET", url: "/api/billing" });
    assert.equal(get.json().plan, "starter");
  } finally {
    await app.close();
  }
});

test("PUT /api/billing/plan rechaza un plan inexistente con 400", async () => {
  const app = await buildApp({ logLevel: "silent" });
  try {
    const res = await app.inject({
      method: "PUT",
      url: "/api/billing/plan",
      payload: { plan: "enterprise" },
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, "invalid_plan");
  } finally {
    await app.close();
  }
});

test("PUT /api/billing/plan rechaza un body sin plan con 400", async () => {
  const app = await buildApp({ logLevel: "silent" });
  try {
    const missing = await app.inject({
      method: "PUT",
      url: "/api/billing/plan",
      payload: {},
    });
    assert.equal(missing.statusCode, 400);
    assert.equal(missing.json().error, "invalid_plan");

    const wrongType = await app.inject({
      method: "PUT",
      url: "/api/billing/plan",
      payload: { plan: 42 },
    });
    assert.equal(wrongType.statusCode, 400);
    assert.equal(wrongType.json().error, "invalid_plan");
  } finally {
    await app.close();
  }
});
