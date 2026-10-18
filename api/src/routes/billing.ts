import type { FastifyInstance } from "fastify";

import { getDb } from "../db/index.js";
import { BillingError, getBillingState, setBillingPlan } from "../services/billing.js";

/**
 * Facturación del MVP: solo lectura del plan y del consumo del mes, más el cambio de plan.
 * No hay cobro real, ni pasarela de pago, ni facturas emitidas.
 */
export async function registerBillingRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/billing", async () => getBillingState(getDb()));

  app.put("/api/billing/plan", async (request, reply) => {
    const body = request.body as { plan?: unknown } | undefined;
    if (body === undefined || typeof body.plan !== "string") {
      return reply.code(400).send({ error: "invalid_plan" });
    }

    try {
      return setBillingPlan(getDb(), body.plan);
    } catch (error) {
      if (error instanceof BillingError) {
        return reply.code(400).send({ error: error.code });
      }
      throw error;
    }
  });
}
