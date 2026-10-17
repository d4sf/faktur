import type { FastifyInstance } from "fastify";

import { getDb } from "../db/index.js";
import type { ApprovalStatus } from "../domain/audit.js";
import { listApprovals } from "../repositories/approvals.js";
import { ApprovalError, resolveApproval } from "../services/approvals.js";
import { approvalEvents, notifyApprovalChange } from "../services/approvalEvents.js";

const STATUS_MAP: Record<string, ApprovalStatus> = {
  pendiente: "PENDIENTE",
  aprobada: "APROBADA",
  negada: "NEGADA",
};

export async function registerApprovalRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Canal push en tiempo real mediante Server-Sent Events (SSE).
   * Notifica instantáneamente a los clientes cuando una factura escala o se resuelve,
   * sin necesidad de hacer polling repetitivo.
   */
  app.get("/api/approvals/stream", async (request, reply) => {
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no");

    reply.raw.write(`data: ${JSON.stringify({ type: "CONNECTED" })}\n\n`);

    const onUpdate = (event: { type: string; id?: string }) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    approvalEvents.on("change", onUpdate);

    request.raw.on("close", () => {
      approvalEvents.off("change", onUpdate);
    });

    await new Promise<void>((resolve) => {
      request.raw.on("close", () => resolve());
    });
  });

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
      notifyApprovalChange({ type: "APPROVAL_RESOLVED", id: request.params.id });
      return reply.code(200).send(result);
    } catch (error) {
      if (error instanceof ApprovalError) {
        return reply.code(error.code === "not_found" ? 404 : 409).send({ error: error.code });
      }
      throw error;
    }
  });
}
