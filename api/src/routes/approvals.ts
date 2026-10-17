import type { FastifyInstance } from "fastify";

import { getDb } from "../db/index.js";
import type { ApprovalStatus } from "../domain/audit.js";
import { listApprovals } from "../repositories/approvals.js";
import { ApprovalError, resolveApproval } from "../services/approvals.js";

const STATUS_MAP: Record<string, ApprovalStatus> = {
  pendiente: "PENDIENTE",
  aprobada: "APROBADA",
  negada: "NEGADA",
};

export async function registerApprovalRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { status?: string } }>("/api/approvals", async (request, reply) => {
    const raw = request.query.status;
    if (raw === undefined) return listApprovals(getDb());

    const status = STATUS_MAP[raw.toLowerCase()];
    if (status === undefined) return reply.code(400).send({ error: "invalid_status" });
    return listApprovals(getDb(), status);
  });

  app.post<{ Params: { id: string } }>("/api/approvals/:id", async (request, reply) => {
    const body = request.body as
      { approve?: unknown; resolved_by?: unknown; comment?: unknown } | undefined;
    if (
      body === undefined ||
      typeof body.approve !== "boolean" ||
      typeof body.resolved_by !== "string" ||
      body.resolved_by.trim() === "" ||
      (body.comment !== undefined && typeof body.comment !== "string")
    ) {
      return reply.code(400).send({ error: "invalid_body" });
    }

    try {
      const result = resolveApproval(
        request.params.id,
        {
          approve: body.approve,
          resolved_by: body.resolved_by,
          ...(body.comment === undefined ? {} : { comment: body.comment }),
        },
        getDb(),
      );
      return reply.code(200).send(result);
    } catch (error) {
      if (error instanceof ApprovalError) {
        return reply.code(error.code === "not_found" ? 404 : 409).send({ error: error.code });
      }
      throw error;
    }
  });
}
