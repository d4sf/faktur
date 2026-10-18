import { join } from "node:path";

import { buildApp } from "./app.js";
import { ensureDataDir } from "./config/dataDir.js";
import { loadEnv } from "./config/env.js";
import { closeDb, loadDb } from "./db/index.js";

const env = loadEnv();

ensureDataDir(env.DATA_DIR);
loadDb(join(env.DATA_DIR, "faktur.db"));

const app = await buildApp({
  webDist: env.WEB_DIST,
  logLevel: env.LOG_LEVEL,
  admin: {
    enabled: env.ALLOW_DB_RESET,
    token: env.ADMIN_TOKEN,
    production: env.NODE_ENV === "production",
  },
  rateLimit: {
    global: { max: env.RATE_LIMIT_MAX, timeWindow: env.RATE_LIMIT_WINDOW_MS },
    upload: { max: env.RATE_LIMIT_UPLOAD_MAX, timeWindow: env.RATE_LIMIT_UPLOAD_WINDOW_MS },
    explain: { max: env.RATE_LIMIT_EXPLAIN_MAX, timeWindow: env.RATE_LIMIT_EXPLAIN_WINDOW_MS },
    admin: { max: env.RATE_LIMIT_ADMIN_MAX, timeWindow: env.RATE_LIMIT_ADMIN_WINDOW_MS },
    webhookTest: {
      max: env.RATE_LIMIT_WEBHOOK_TEST_MAX,
      timeWindow: env.RATE_LIMIT_WEBHOOK_TEST_WINDOW_MS,
    },
    policyPreview: {
      max: env.RATE_LIMIT_EXPLAIN_MAX,
      timeWindow: env.RATE_LIMIT_EXPLAIN_WINDOW_MS,
    },
  },
});

async function shutdown(): Promise<void> {
  await app.close();
  closeDb();
}

process.once("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
