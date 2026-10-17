import type { FastifyInstance } from "fastify";

import { getDb } from "../db/index.js";
import {
  ExplanationInvalidError,
  ExplanationNotConfiguredError,
  ExplanationUnavailableError,
  explainInvoice,
} from "../services/aiExplanation.js";

export async function registerExplanationRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string }; Body: { regenerate?: unknown } }>(
    "/api/invoices/:id/explain",
    async (request, reply) => {
      const body = (request.body ?? {}) as { regenerate?: unknown };
      if (body.regenerate !== undefined && typeof body.regenerate !== "boolean") {
        return reply.code(400).send({ error: "invalid_body" });
      }
      try {
        const result = await explainInvoice(request.params.id, getDb(), {
          regenerate: body.regenerate === true,
        });
        return reply.code(result.cached ? 200 : 201).send(result);
      } catch (error) {
        request.log.error({ err: error }, "ai explanation failed");
        if (error instanceof ExplanationNotConfiguredError) {
          return reply.code(503).send({ error: "explanation_not_configured" });
        }
        if (error instanceof ExplanationUnavailableError) {
          const detail = (error as Error).message.slice(0, 300);
          return reply.code(503).send({ error: "explanation_unavailable", detail });
        }
        if (error instanceof ExplanationInvalidError) {
          return reply.code(422).send({ error: "explanation_invalid" });
        }
        const msg = (error as Error).message;
        if (msg === "invoice_not_found") {
          return reply.code(404).send({ error: "not_found" });
        }
        if (msg === "not_explainable") {
          return reply.code(409).send({ error: "not_explainable" });
        }
        throw error;
      }
    },
  );
}
