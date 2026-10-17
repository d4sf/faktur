import assert from "node:assert/strict";
import test from "node:test";

import { loadEnv, requireGeminiKey } from "./env.js";

test("sin variables devuelve los defaults", () => {
  const env = loadEnv({});
  assert.equal(env.PORT, 3000);
  assert.equal(env.LOG_LEVEL, "info");
  assert.equal(env.GEMINI_MODEL, "gemini-3.8-flash");
  assert.equal(env.NODE_ENV, "development");
  assert.ok(env.DATA_DIR.endsWith("/data"));
  assert.ok(env.WEB_DIST.endsWith("web/dist"));
});

test("sin GEMINI_API_KEY no lanza", () => {
  const env = loadEnv({});
  assert.equal(env.GEMINI_API_KEY, undefined);
});

test("PORT se convierte a número", () => {
  assert.equal(loadEnv({ PORT: "8080" }).PORT, 8080);
});

test("PORT no numérico lanza y lo nombra", () => {
  assert.throws(() => loadEnv({ PORT: "abc" }), /PORT/);
});

test("NODE_ENV fuera del enum lanza", () => {
  assert.throws(() => loadEnv({ NODE_ENV: "produccion" }), /NODE_ENV/);
});

test("reporta todas las variables malas en un solo error", () => {
  assert.throws(
    () => loadEnv({ PORT: "abc", NOTIFIER_WEBHOOK_URL: "no-es-una-url" }),
    (error: Error) => {
      assert.match(error.message, /PORT/);
      assert.match(error.message, /NOTIFIER_WEBHOOK_URL/);
      return true;
    },
  );
});

test("cadena vacía se normaliza a undefined", () => {
  const env = loadEnv({ GEMINI_API_KEY: "", NOTIFIER_WEBHOOK_URL: "   " });
  assert.equal(env.GEMINI_API_KEY, undefined);
  assert.equal(env.NOTIFIER_WEBHOOK_URL, undefined);
});

test("NOTIFIER_WEBHOOK_URL válida no lanza", () => {
  const env = loadEnv({ NOTIFIER_WEBHOOK_URL: "https://hooks.example/x" });
  assert.equal(env.NOTIFIER_WEBHOOK_URL, "https://hooks.example/x");
});

test("requireGeminiKey lanza nombrando la variable", () => {
  assert.throws(() => requireGeminiKey(loadEnv({})), /GEMINI_API_KEY/);
});

test("requireGeminiKey devuelve la llave cuando está", () => {
  assert.equal(requireGeminiKey(loadEnv({ GEMINI_API_KEY: "k" })), "k");
});

test("ALLOW_DB_RESET apagado por default y parsea true/false", () => {
  assert.equal(loadEnv({}).ALLOW_DB_RESET, false);
  assert.equal(loadEnv({ ALLOW_DB_RESET: "true" }).ALLOW_DB_RESET, true);
  assert.equal(loadEnv({ ALLOW_DB_RESET: "false" }).ALLOW_DB_RESET, false);
});

test("ALLOW_DB_RESET fuera del enum lanza", () => {
  assert.throws(() => loadEnv({ ALLOW_DB_RESET: "si" }), /ALLOW_DB_RESET/);
});

test("ADMIN_TOKEN definido se conserva y vacío queda undefined", () => {
  assert.equal(loadEnv({ ADMIN_TOKEN: "s3cret" }).ADMIN_TOKEN, "s3cret");
  assert.equal(loadEnv({ ADMIN_TOKEN: "" }).ADMIN_TOKEN, undefined);
  assert.equal(loadEnv({ ADMIN_TOKEN: "   " }).ADMIN_TOKEN, undefined);
  assert.equal(loadEnv({}).ADMIN_TOKEN, undefined);
});
