import type { FastifyInstance } from "fastify";

import { getDb } from "../db/index.js";
import { InvalidPolicyError, previewPolicy, readPolicy, updatePolicy } from "../services/policy.js";

export async function registerPolicyRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/policy", async () => readPolicy(getDb()));

  app.put("/api/policy", async (request, reply) => {
    try {
      const policy = updatePolicy(request.body, getDb());
      return reply.code(201).send(policy);
    } catch (error) {
      if (error instanceof InvalidPolicyError) {
        return reply.code(422).send({ error: "invalid_policy" });
      }
      throw error;
    }
  });

  const previewLimit = app.rateLimits?.policyPreview;
  app.post(
    "/api/policy/preview",
    previewLimit ? { config: { rateLimit: { max: previewLimit.max, timeWindow: previewLimit.timeWindow } } } : {},
    async (request, reply) => {
    try {
      return { affected: previewPolicy(request.body, getDb()) };
    } catch (error) {
      if (error instanceof InvalidPolicyError) {
        return reply.code(422).send({ error: "invalid_policy" });
      }
      throw error;
    }
  });
}
