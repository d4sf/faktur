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
