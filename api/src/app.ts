import { existsSync } from "node:fs";
import { resolve } from "node:path";

import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";

export interface BuildAppOptions {
  webDist?: string;
  logLevel?: string;
}

/**
 * `options` es entero opcional para que el test pueda llamar `buildApp()` sin
 * argumentos. El entorno no se lee acá: `config/env.ts` es el único módulo que
 * lo hace, y `server.ts` le pasa los valores ya validados.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: options.logLevel ?? "info" } });

  app.get("/api/health", async () => ({ status: "ok" }));

  const webDist = options.webDist ?? resolve(process.cwd(), "web/dist");
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });

    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith("/api/")) {
        return reply.code(404).send({ error: "not_found" });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}
