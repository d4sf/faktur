import { existsSync } from "node:fs";
import { resolve } from "node:path";

import fastifyRateLimit from "@fastify/rate-limit";
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
import { registerMaintenanceRoutes } from "./routes/maintenance.js";
import { registerPolicyRoutes } from "./routes/policies.js";
import { registerReportRoutes } from "./routes/report.js";
import { MAX_UPLOAD_BYTES } from "./services/ingest.js";
import { MAINTENANCE_HTML, isMaintenanceMode } from "./services/maintenance.js";
import { getDb } from "./db/index.js";

export type RateLimitBucket = { max: number; timeWindow: number };

export type RateLimitConfig = {
  global?: RateLimitBucket;
  upload?: RateLimitBucket;
  explain?: RateLimitBucket;
  admin?: RateLimitBucket;
  webhookTest?: RateLimitBucket;
  policyPreview?: RateLimitBucket;
};

export interface BuildAppOptions {
  webDist?: string;
  logLevel?: string;
  admin?: { enabled: boolean; token?: string; production: boolean };
  rateLimit?: false | RateLimitConfig;
}

declare module "fastify" {
  interface FastifyInstance {
    rateLimits: Required<RateLimitConfig> | null;
  }
}

const RICK_ASTLEY_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

const DEFAULTS: Required<RateLimitConfig> = {
  global: { max: 120, timeWindow: 60000 },
  upload: { max: 10, timeWindow: 60000 },
  explain: { max: 5, timeWindow: 60000 },
  admin: { max: 3, timeWindow: 60000 },
  webhookTest: { max: 5, timeWindow: 60000 },
  policyPreview: { max: 5, timeWindow: 60000 },
};

function resolveConfig(options: BuildAppOptions): Required<RateLimitConfig> | null {
  if (options.rateLimit === false) return null;
  const user = options.rateLimit ?? {};
  return {
    global: user.global ?? DEFAULTS.global,
    upload: user.upload ?? DEFAULTS.upload,
    explain: user.explain ?? DEFAULTS.explain,
    admin: user.admin ?? DEFAULTS.admin,
    webhookTest: user.webhookTest ?? DEFAULTS.webhookTest,
    policyPreview: user.policyPreview ?? DEFAULTS.policyPreview,
  };
}

/**
 * `options` es entero opcional para que el test pueda llamar `buildApp()` sin
 * argumentos. El entorno no se lee acá: `config/env.ts` es el único módulo que
 * lo hace, y `server.ts` le pasa los valores ya validados.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: options.logLevel ?? "info" }, trustProxy: true });

  /**
   * Ningún error inesperado puede filtrar el mensaje crudo de SQLite, una ruta del disco ni un
   * stack. Las rutas traducen sus errores conocidos; esto es la red para el resto.
   */
  app.setErrorHandler((error, request, reply) => {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 429) {
      const body = error as { error?: string; retry_after?: number; data?: string };
      return reply.code(429).send({
        error: body.error ?? "rate_limit_exceeded",
        retry_after: body.retry_after,
        data: body.data ?? RICK_ASTLEY_URL,
      });
    }
    request.log.error({ err: error }, "unhandled error");
    const status =
      statusCode !== undefined && statusCode >= 400 && statusCode < 500 ? statusCode : 500;
    return reply.code(status).send({ error: "internal_error" });
  });

  const rateLimits = resolveConfig(options);
  app.decorate("rateLimits", rateLimits);

  app.addHook("onRequest", async (request, reply) => {
    if (request.url.startsWith("/api/")) return;
    try {
      if (!isMaintenanceMode(getDb())) return;
    } catch {
      return;
    }
    return reply.type("text/html").code(200).send(MAINTENANCE_HTML);
  });

  app.get("/api/health", async () => ({ status: "ok" }));

  if (rateLimits !== null) {
    await app.register(fastifyRateLimit, {
      global: true,
      max: rateLimits.global.max,
      timeWindow: rateLimits.global.timeWindow,
      allowList: (req) => req.url === "/api/health" || req.url.startsWith("/api/approvals/stream"),
      errorResponseBuilder: (_request, context) => ({
        statusCode: 429,
        error: "rate_limit_exceeded",
        retry_after: Math.ceil(context.ttl / 1000),
        data: RICK_ASTLEY_URL,
      }),
    });
  }

  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
  await app.register(registerReportRoutes);
  await app.register(registerInvoiceRoutes, { rateLimits });
  await app.register(registerIngestRoutes, { rateLimits });
  await app.register(registerApprovalRoutes, { rateLimits });
  await app.register(registerAuditRoutes);
  await app.register(registerPolicyRoutes, { rateLimits });
  await app.register(registerAdminRoutes, options.admin ?? { enabled: false, production: false });
  await app.register(registerExplanationRoutes, { rateLimits });
  await app.register(registerIntegrationRoutes, { rateLimits });
  await app.register(registerMaintenanceRoutes);

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
