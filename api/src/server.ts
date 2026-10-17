import { buildApp } from "./app.js";
import { ensureDataDir } from "./config/dataDir.js";
import { loadEnv } from "./config/env.js";

const env = loadEnv();

ensureDataDir(env.DATA_DIR);

const app = await buildApp({ webDist: env.WEB_DIST, logLevel: env.LOG_LEVEL });

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
