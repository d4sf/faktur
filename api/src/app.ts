import { existsSync } from "node:fs";
import { resolve } from "node:path";

import fastifyStatic from "@fastify/static";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";

import { registerApprovalRoutes } from "./routes/approvals.js";
import { registerAuditRoutes } from "./routes/audit.js";
import { registerIngestRoutes } from "./routes/ingest.js";
import { registerInvoiceRoutes } from "./routes/invoices.js";
import { registerReportRoutes } from "./routes/report.js";
import { MAX_UPLOAD_BYTES } from "./services/ingest.js";

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

  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
  await app.register(registerReportRoutes);
  await app.register(registerInvoiceRoutes);
  await app.register(registerIngestRoutes);
  await app.register(registerApprovalRoutes);
  await app.register(registerAuditRoutes);

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
