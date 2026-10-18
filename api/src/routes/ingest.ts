import { readFileSync } from "node:fs";

import type { FastifyInstance } from "fastify";
import "@fastify/rate-limit";

import { getDb } from "../db/index.js";
import { getAttempt, updateAttemptStatus } from "../repositories/ingest.js";
import {
  ExtractionInvalidError,
  ExtractionNotConfiguredError,
  ExtractionUnavailableError,
  extractInvoice,
  persistExtraction,
} from "../services/extract.js";
import { CurrencyNotAllowedError } from "../services/fx.js";
import { InvalidFileTypeError, storedUploadPath } from "../services/ingest.js";

export async function registerIngestRoutes(app: FastifyInstance): Promise<void> {
  const extractLimit = app.rateLimits?.upload;
  app.post<{ Params: { id: string } }>(
    "/api/ingest-attempts/:id/extract",
    extractLimit
      ? { config: { rateLimit: { max: extractLimit.max, timeWindow: extractLimit.timeWindow } } }
      : {},
    async (request, reply) => {
      const attempt = getAttempt(request.params.id);
      if (attempt === null) return reply.code(404).send({ error: "not_found" });
      if (attempt.invoice_id !== null || attempt.attempt_status !== "RECIBIDA") {
        return reply.code(409).send({ error: "already_processed" });
      }

      let buffer: Buffer;
      try {
        buffer = readFileSync(storedUploadPath(attempt.file_hash));
      } catch {
        return reply.code(404).send({ error: "not_found" });
      }

      try {
        const { extracted, raw } = await extractInvoice({ buffer, mimeType: attempt.mime_type });
        const persisted = persistExtraction(attempt.id, extracted, getDb(), raw);
        if (persisted.duplicate) {
          return reply.code(200).send({
            attempt_id: attempt.id,
            invoice_id: persisted.duplicate_of,
            status: "DUPLICADA",
            ...persisted.decision,
          });
        }
        return reply.code(200).send({ attempt_id: attempt.id, invoice_id: persisted.invoice_id });
      } catch (error) {
        if (error instanceof InvalidFileTypeError) {
          return reply.code(400).send({ error: "invalid_file_type" });
        }
        if (error instanceof ExtractionNotConfiguredError) {
          return reply.code(503).send({ error: "extraction_not_configured" });
        }
        if (error instanceof ExtractionUnavailableError) {
          return reply.code(503).send({ error: "extraction_unavailable" });
        }
        if (error instanceof ExtractionInvalidError) {
          updateAttemptStatus(attempt.id, "RECHAZADA");
          return reply.code(422).send({ error: "extraction_invalid" });
        }
        if (error instanceof CurrencyNotAllowedError) {
          updateAttemptStatus(attempt.id, "RECHAZADA");
          return reply.code(422).send({ error: "currency_not_allowed" });
        }
        throw error;
      }
    },
  );
}
