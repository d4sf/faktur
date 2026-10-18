import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { getDb } from "../db/index.js";
import { defaultNotifier, dispatchNotification, queueNotification } from "./notifier.js";
import type { EvaluationResult } from "../domain/ruleEngine.js";
import { getDecisionForAttempt, insertDecision } from "../repositories/decisions.js";
import {
  createAttempt,
  findAttemptByHash,
  findInvoiceByHash,
  getAttempt,
} from "../repositories/ingest.js";

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/json",
] as const;

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export class InvalidFileTypeError extends Error {
  constructor(mimeType: string) {
    super(`invalid_file_type: ${mimeType}`);
    this.name = "InvalidFileTypeError";
  }
}

export type IngestResult = {
  attempt_id: string;
  invoice_id: string | null;
  status: "RECIBIDA" | "DUPLICADA" | "RECHAZADA";
  decision?: EvaluationResult;
};

export type IngestInput = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
};

function policyVersion(): string {
  const row = getDb().prepare("SELECT version FROM policies WHERE is_active = 1").get() as
    { version: string } | undefined;
  if (row === undefined) throw new Error("no_active_policy");
  return row.version;
}

function uploadsDir(): string {
  const dataDir = process.env.DATA_DIR ?? join(process.cwd(), "data");
  const dir = join(dataDir, "uploads");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Calcula el SHA-256 **antes** de cualquier llamada externa, escribe siempre un intento y, si
 * el hash ya se vio, produce la decisión FRENAR anclada al intento en vez de crear factura.
 * La factura nace recién en la extracción, porque `invoices` exige los cinco campos NOT NULL.
 */
export function ingestFile(input: IngestInput): IngestResult {
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(input.mimeType)) {
    throw new InvalidFileTypeError(input.mimeType);
  }

  const hash = createHash("sha256").update(input.buffer).digest("hex");
  const canonical = findInvoiceByHash(hash);
  const previousAttempt = findAttemptByHash(hash);
  const isDuplicate = canonical !== null || previousAttempt !== null;

  const duplicateOf = canonical?.id ?? previousAttempt?.invoice_id ?? null;
  const attemptId = createAttempt({
    invoice_id: null,
    file_name: input.fileName,
    mime_type: input.mimeType,
    byte_size: input.buffer.length,
    file_hash: hash,
    attempt_status: isDuplicate ? "DUPLICADA" : "RECIBIDA",
    duplicate_of_invoice_id: duplicateOf,
  });

  if (isDuplicate) {
    const registeredAt = canonical?.ingested_at ?? previousAttempt?.submitted_at ?? null;
    const explanation =
      registeredAt === null
        ? "Reenvío duplicado: el archivo ya fue registrado"
        : `Reenvío duplicado: el archivo ya fue registrado el ${registeredAt.slice(0, 10)}`;

    const decId = insertDecision({
      invoice_id: null,
      ingest_attempt_id: attemptId,
      verdict: "FRENAR",
      reason_code: "ERR_DUPLICATE_INVOICE",
      explanation,
      policy_version: policyVersion(),
      amount_usd_evaluated: 0,
      decided_by: "AGENTE",
    });

    const db = getDb();
    const duplicateInvoiceId = duplicateOf;
    if (duplicateInvoiceId !== null) {
      const notifier = defaultNotifier(db);
      const nid = queueNotification({
        invoice_id: duplicateInvoiceId,
        decision_id: decId,
        channel: notifier.channel,
        reason_code: "ERR_DUPLICATE_INVOICE",
        explanation,
        amount_usd: 0,
      });
      void dispatchNotification(nid, notifier.notifier, db);
    }

    return {
      attempt_id: attemptId,
      invoice_id: duplicateOf,
      status: "DUPLICADA",
      decision: { verdict: "FRENAR", reason_code: "ERR_DUPLICATE_INVOICE", explanation },
    };
  }

  const path = join(uploadsDir(), hash);
  if (!existsSync(path)) writeFileSync(path, input.buffer);

  return { attempt_id: attemptId, invoice_id: null, status: "RECIBIDA" };
}

/** La decisión del reenvío, útil para el encadenado HTTP sin volver a consultar. */
export function decisionForAttempt(attemptId: string): EvaluationResult | undefined {
  const decision = getDecisionForAttempt(attemptId);
  if (decision === null) return undefined;
  return {
    verdict: decision.verdict,
    reason_code: decision.reason_code,
    explanation: decision.explanation,
  };
}

export function attemptExists(attemptId: string): boolean {
  return getAttempt(attemptId) !== null;
}

export function storedUploadPath(hash: string): string {
  return join(uploadsDir(), hash);
}
