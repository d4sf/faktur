import type { FastifyInstance } from "fastify";

import { InvalidFileTypeError, ingestFile, type IngestResult } from "../services/ingest.js";

function body(result: IngestResult): Record<string, unknown> {
  return {
    attempt_id: result.attempt_id,
    invoice_id: result.invoice_id,
    status: result.status,
    ...(result.decision ? result.decision : {}),
  };
}

export async function registerInvoiceRoutes(app: FastifyInstance): Promise<void> {
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

    try {
      const buffer = await file.toBuffer();
      const result = ingestFile({
        buffer,
        fileName: file.filename,
        mimeType: file.mimetype,
      });

      return reply.code(result.status === "DUPLICADA" ? 200 : 202).send(body(result));
    } catch (error) {
      if (error instanceof InvalidFileTypeError) {
        return reply.code(400).send({ error: "invalid_file_type" });
      }
      if ((error as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE") {
        return reply.code(413).send({ error: "file_too_large" });
      }
      throw error;
    }
  });
}
