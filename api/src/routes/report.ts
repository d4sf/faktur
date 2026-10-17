import type { FastifyInstance } from "fastify";

import { getDb } from "../db/index.js";
import { buildReportCsv } from "../services/report.js";

export async function registerReportRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/report.csv", async (_request, reply) => {
    const csv = buildReportCsv(getDb());
    return reply
      .code(200)
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", 'attachment; filename="faktur-report.csv"')
      .send(csv);
  });
}
