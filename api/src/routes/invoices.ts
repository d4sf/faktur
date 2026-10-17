import { readFileSync } from "node:fs";

import type { FastifyInstance } from "fastify";

import { getDb } from "../db/index.js";
import { getAttempt, updateAttemptStatus } from "../repositories/ingest.js";
import { decideInvoice } from "../services/decide.js";
import {
  ExtractionInvalidError,
  ExtractionUnavailableError,
  extractInvoice,
  persistExtraction,
} from "../services/extract.js";
import { CurrencyNotAllowedError } from "../services/fx.js";
import {
  InvalidFileTypeError,
  ingestFile,
  storedUploadPath,
  type IngestResult,
} from "../services/ingest.js";

function body(result: IngestResult): Record<string, unknown> {
  return {
    attempt_id: result.attempt_id,
    invoice_id: result.invoice_id,
    status: result.status,
    ...(result.decision ? result.decision : {}),
  };
}

function errorReply(error: unknown): { status: number; code: string } | null {
  if (error instanceof InvalidFileTypeError) return { status: 400, code: "invalid_file_type" };
  if (error instanceof ExtractionUnavailableError) {
    return { status: 503, code: "extraction_unavailable" };
  }
  if (error instanceof ExtractionInvalidError) return { status: 422, code: "extraction_invalid" };
  if (error instanceof CurrencyNotAllowedError) {
    return { status: 422, code: "currency_not_allowed" };
  }
  return null;
}

export async function registerInvoiceRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Flujo completo: hash → intento → extracción → persistencia → decisión.
   * Un reenvío duplicado responde 200 con su FRENAR, nunca un 409 ni un 500.
   */
  app.post("/api/invoices", async (request, reply) => {
    let file;
    try {
      file = await request.file();
    } catch (error) {
      if ((error as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE") {
        return reply.code(413).send({ error: "file_too_large" });
      }
      return reply.code(400).send({ error: "invalid_multipart" });
    }

    if (file === undefined) return reply.code(400).send({ error: "missing_file" });
    if (file.file.truncated) return reply.code(413).send({ error: "file_too_large" });

    let result: IngestResult;
    try {
      const buffer = await file.toBuffer();
      result = ingestFile({ buffer, fileName: file.filename, mimeType: file.mimetype });
    } catch (error) {
      if ((error as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE") {
        return reply.code(413).send({ error: "file_too_large" });
      }
      const mapped = errorReply(error);
      if (mapped !== null) return reply.code(mapped.status).send({ error: mapped.code });
      throw error;
    }

    if (result.status === "DUPLICADA") return reply.code(200).send(body(result));

    const attempt = getAttempt(result.attempt_id);
    if (attempt === null) return reply.code(404).send({ error: "not_found" });

    try {
      const buffer = readFileSync(storedUploadPath(attempt.file_hash));
      const extracted = await extractInvoice({ buffer, mimeType: attempt.mime_type });
      const { invoice_id } = persistExtraction(attempt.id, extracted, getDb());
      const decision = decideInvoice(invoice_id, getDb());

      return reply.code(201).send({
        attempt_id: attempt.id,
        invoice_id,
        verdict: decision.verdict,
        reason_code: decision.reason_code,
        explanation: decision.explanation,
      });
    } catch (error) {
      const mapped = errorReply(error);
      if (mapped === null) throw error;
      if (mapped.code === "extraction_invalid" || mapped.code === "currency_not_allowed") {
        updateAttemptStatus(attempt.id, "RECHAZADA");
      }
      return reply.code(mapped.status).send({ error: mapped.code });
    }
  });

  app.post<{ Params: { id: string } }>("/api/invoices/:id/decide", async (request, reply) => {
    try {
      const decision = decideInvoice(request.params.id, getDb());
      return reply.code(200).send({
        verdict: decision.verdict,
        reason_code: decision.reason_code,
        explanation: decision.explanation,
        policy_version: decision.policy_version,
        decision_id: decision.id,
      });
    } catch (error) {
      if ((error as Error).message === "invoice_not_found") {
        return reply.code(404).send({ error: "not_found" });
      }
      if ((error as Error).message === "status_transition_invalid") {
        return reply.code(409).send({ error: "status_transition_invalid" });
      }
      throw error;
    }
  });
}
