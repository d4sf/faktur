import { existsSync } from "node:fs";
import { resolve } from "node:path";

import fastifyStatic from "@fastify/static";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";

import { registerApprovalRoutes } from "./routes/approvals.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerAuditRoutes } from "./routes/audit.js";
import { registerExplanationRoutes } from "./routes/explanations.js";
import { registerIngestRoutes } from "./routes/ingest.js";
import { registerIntegrationRoutes } from "./routes/integrations.js";
import { registerInvoiceRoutes } from "./routes/invoices.js";
import { registerPolicyRoutes } from "./routes/policies.js";
import { registerReportRoutes } from "./routes/report.js";
import { MAX_UPLOAD_BYTES } from "./services/ingest.js";

export interface BuildAppOptions {
  webDist?: string;
  logLevel?: string;
  admin?: { enabled: boolean; token?: string; production: boolean };
}

/**
 * `options` es entero opcional para que el test pueda llamar `buildApp()` sin
 * argumentos. El entorno no se lee acá: `config/env.ts` es el único módulo que
 * lo hace, y `server.ts` le pasa los valores ya validados.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: options.logLevel ?? "info" } });

  /**
   * Ningún error inesperado puede filtrar el mensaje crudo de SQLite, una ruta del disco ni un
   * stack. Las rutas traducen sus errores conocidos; esto es la red para el resto.
   */
  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "unhandled error");
    const statusCode = (error as { statusCode?: number }).statusCode;
    const status =
      statusCode !== undefined && statusCode >= 400 && statusCode < 500 ? statusCode : 500;
    return reply.code(status).send({ error: "internal_error" });
  });

  app.get("/api/health", async () => ({ status: "ok" }));

  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
  await app.register(registerReportRoutes);
  await app.register(registerInvoiceRoutes);
  await app.register(registerExplanationRoutes);
  await app.register(registerIntegrationRoutes);
  await app.register(registerIngestRoutes);
  await app.register(registerApprovalRoutes);
  await app.register(registerAuditRoutes);
  await app.register(registerPolicyRoutes);
  await app.register(registerAdminRoutes, options.admin ?? { enabled: false, production: false });

  const webDist = options.webDist ?? resolve(process.cwd(), "web/dist");
  const hasWebDist = existsSync(webDist);
  if (hasWebDist) {
    await app.register(fastifyStatic, { root: webDist });
  }

  app.setNotFoundHandler((request, reply) => {
    if (request.raw.url?.startsWith("/api/") || !hasWebDist) {
      return reply.code(404).send({ error: "not_found" });
    }
    return reply.sendFile("index.html");
  });

  return app;
}
