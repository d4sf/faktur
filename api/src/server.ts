import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";

/**
 * Crear los directorios al arrancar y no en el primer INSERT: un EACCES que
 * aparece tres requests más tarde se lee como "la app anda raro" en vez de como
 * "falta un permiso", y en dev corre como root y nunca se dispararía.
 */
function ensureDataDir(dataDir: string): void {
  try {
    mkdirSync(dataDir, { recursive: true });
    mkdirSync(join(dataDir, "uploads"), { recursive: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    if (code === "EACCES" || code === "EROFS") {
      throw new Error(
        `No se pudo escribir en DATA_DIR (${dataDir}): ${code}.\n` +
          `El proceso corre como uid ${process.getuid?.()}. Revisá el owner del ` +
          `directorio en el host o el entrypoint que lo prepara.`,
      );
    }

    throw error;
  }
}

const env = loadEnv();

ensureDataDir(env.DATA_DIR);

const app = await buildApp({ webDist: env.WEB_DIST, logLevel: env.LOG_LEVEL });

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}