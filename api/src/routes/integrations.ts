import type { FastifyInstance } from "fastify";

import { getDb } from "../db/index.js";
import {
  InvalidIntegrationUrlError,
  deleteSlackWebhookUrl,
  getSlackWebhookUrl,
  setSlackWebhookUrl,
  testSlackWebhook,
} from "../services/integrations.js";

export async function registerIntegrationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/integrations/slack", async () => {
    const url = getSlackWebhookUrl(getDb());
    return {
      configured: url !== null,
      url: url === null ? null : `…${url.slice(-8)}`,
    };
  });

  app.put<{ Body: { url?: unknown } }>("/api/integrations/slack", async (request, reply) => {
    const body = (request.body ?? {}) as { url?: unknown };
    if (typeof body.url !== "string" || body.url.trim() === "") {
      return reply.code(400).send({ error: "invalid_body" });
    }
    try {
      setSlackWebhookUrl(body.url, getDb());
      return reply.code(200).send({ configured: true });
    } catch (error) {
      if (error instanceof InvalidIntegrationUrlError) {
        return reply.code(422).send({ error: "invalid_url", detail: (error as Error).message });
      }
      throw error;
    }
  });

  app.delete("/api/integrations/slack", async () => {
    deleteSlackWebhookUrl(getDb());
    return { configured: false };
  });

  app.post<{ Body: { url?: unknown } }>("/api/integrations/slack/test", async (request, reply) => {
    const body = (request.body ?? {}) as { url?: unknown };
    let url: string | null = null;
    if (body.url !== undefined) {
      if (typeof body.url !== "string" || body.url.trim() === "") {
        return reply.code(400).send({ error: "invalid_body" });
      }
      url = body.url.trim();
    } else {
      url = getSlackWebhookUrl(getDb());
    }
    if (url === null) {
      return reply.code(400).send({ error: "no_url_configured" });
    }
    const result = await testSlackWebhook(url);
    return reply.code(result.ok ? 200 : 502).send(result);
  });
}