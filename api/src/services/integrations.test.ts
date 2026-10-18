import assert from "node:assert/strict";
import test from "node:test";

import { closeDb, loadDb } from "../db/index.js";
import {
  InvalidIntegrationUrlError,
  deleteSlackWebhookUrl,
  getSlackWebhookUrl,
  setSlackWebhookUrl,
  testSlackWebhook,
} from "./integrations.js";

test("getSlackWebhookUrl devuelve null si no hay config", () => {
  const db = loadDb(":memory:");
  try {
    assert.equal(getSlackWebhookUrl(db), null);
  } finally {
    closeDb();
  }
});

test("setSlackWebhookUrl guarda y getSlackWebhookUrl recupera", () => {
  const db = loadDb(":memory:");
  try {
    setSlackWebhookUrl("https://hooks.slack.com/services/T/B/X", db);
    assert.equal(getSlackWebhookUrl(db), "https://hooks.slack.com/services/T/B/X");
  } finally {
    closeDb();
  }
});

test("setSlackWebhookUrl rechaza URL no https", () => {
  const db = loadDb(":memory:");
  try {
    assert.throws(
      () => setSlackWebhookUrl("http://hooks.slack.com/services/T/B/X", db),
      InvalidIntegrationUrlError,
    );
  } finally {
    closeDb();
  }
});

test("setSlackWebhookUrl rechaza URL inválida", () => {
  const db = loadDb(":memory:");
  try {
    assert.throws(() => setSlackWebhookUrl("no-es-url", db), InvalidIntegrationUrlError);
  } finally {
    closeDb();
  }
});

test("deleteSlackWebhookUrl borra la config", () => {
  const db = loadDb(":memory:");
  try {
    setSlackWebhookUrl("https://hooks.slack.com/services/T/B/X", db);
    deleteSlackWebhookUrl(db);
    assert.equal(getSlackWebhookUrl(db), null);
  } finally {
    closeDb();
  }
});

test("testSlackWebhook devuelve ok false si la URL es inválida", async () => {
  const result = await testSlackWebhook("no-es-url");
  assert.equal(result.ok, false);
});