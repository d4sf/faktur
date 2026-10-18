import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { getDb, getDbPath } from "../db/index.js";
import { resetDatabase } from "../db/reset.js";
import { SEED_PROFILES, tableCounts } from "../db/seeders.js";
import type { SeedProfile } from "../db/seeders.js";

export interface AdminOptions {
  enabled: boolean;
  token?: string;
  production: boolean;
}

/** Motivo por el que el reset no está disponible; `null` cuando sí lo está. */
export type AdminReason = "disabled" | "missing_token" | null;

/**
 * Única fuente de verdad para decidir si el reset está bloqueado. El GET la usa
 * para `reason` y el POST para elegir el error: así la UI nunca ve `enabled:
 * true` en un endpoint que después rechaza por otra causa.
 */
function blockReason(options: AdminOptions): AdminReason {
  if (!options.enabled) return "disabled";
  if (options.production && options.token === undefined) return "missing_token";
  return null;
}

const resetRequestSchema = z.object({
  profile: z.string(),
  confirm: z.literal("REINICIAR"),
});

function isSeedProfile(value: string): value is SeedProfile {
  return (SEED_PROFILES as readonly string[]).includes(value);
}

function activePolicyVersion(db: ReturnType<typeof getDb>): string | null {
  const row = db.prepare("SELECT version FROM policies WHERE is_active = 1").get() as
    { version: string } | undefined;
  return row?.version ?? null;
}

/**
 * Rutas de administración del dataset. No leen `process.env`: reciben las
 * opciones ya validadas desde `buildApp` (y este, desde `server.ts`).
 */
export async function registerAdminRoutes(
  app: FastifyInstance,
  options: AdminOptions,
): Promise<void> {
  app.get("/api/admin/db", async () => {
    const db = getDb();

    return {
      enabled: options.enabled,
      reason: blockReason(options),
      profiles: [...SEED_PROFILES],
      counts: tableCounts(db),
      policy_version: activePolicyVersion(db),
    };
  });

  const adminLimit = app.rateLimits?.admin;
  app.post(
    "/api/admin/db/reset",
    adminLimit
      ? { config: { rateLimit: { max: adminLimit.max, timeWindow: adminLimit.timeWindow } } }
      : {},
    async (request, reply) => {
      const reason = blockReason(options);
      if (reason === "disabled") {
        return reply.code(403).send({ error: "db_reset_disabled" });
      }
      if (reason === "missing_token") {
        return reply.code(403).send({ error: "db_reset_token_missing" });
      }

      if (options.token !== undefined && request.headers["x-admin-token"] !== options.token) {
        return reply.code(401).send({ error: "admin_token_invalid" });
      }

      const parsed = resetRequestSchema.safeParse(request.body);
      if (!parsed.success || !isSeedProfile(parsed.data.profile)) {
        return reply.code(422).send({ error: "invalid_reset_request" });
      }

      const result = resetDatabase({ dbPath: getDbPath(), profile: parsed.data.profile });
      return reply.code(200).send(result);
    },
  );
}
