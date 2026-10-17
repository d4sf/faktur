import type { FastifyInstance } from "fastify";

import { getDb } from "../db/index.js";
import { getAuditTrail } from "../services/metrics.js";

export async function registerAuditRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/audit-trail", async () => getAuditTrail(getDb()));
}
