import type { FastifyInstance } from "fastify";

import { getDb } from "../db/index.js";
import { loadEnv } from "../config/env.js";
import { isMaintenanceMode, setMaintenanceMode } from "../services/maintenance.js";

export async function registerMaintenanceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/maintenance", async () => {
    return { enabled: !isMaintenanceMode(getDb()) };
  });

  app.post<{ Body: { enabled?: unknown } }>("/api/maintenance", async (request, reply) => {
    const envSecret = loadEnv().MAINTENANCE_SECRET;
    if (envSecret === undefined) {
      return reply.code(503).send({ error: "maintenance_secret_not_configured" });
    }
    const provided = request.headers["x-maintenance-secret"];
    if (provided !== envSecret) {
      return reply.code(403).send({ error: "invalid_secret" });
    }
    const body = (request.body ?? {}) as { enabled?: unknown };
    if (typeof body.enabled !== "boolean") {
      return reply.code(400).send({ error: "invalid_body" });
    }
    setMaintenanceMode(!body.enabled, getDb());
    return reply.code(200).send({ enabled: body.enabled });
  });
}
