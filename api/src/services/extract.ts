import { randomUUID } from "node:crypto";

import type Database from "better-sqlite3";

import { loadEnv } from "../config/env.js";
import { ExtractedInvoice, globalConfidence } from "../domain/extraction.js";
import { toGeminiResponseSchema } from "../domain/geminiSchema.js";
import { getAttempt, linkAttemptToInvoice } from "../repositories/ingest.js";
import { insertDecision } from "../repositories/decisions.js";
import { getActivePolicyRow } from "../repositories/policies.js";
import { round2, toUsd } from "./fx.js";
import { InvalidFileTypeError } from "./ingest.js";

export type GeminiCaller = (request: {
  model: string;
  contents: unknown;
  config: unknown;
}) => Promise<unknown>;

export class ExtractionUnavailableError extends Error {
  constructor(reason: string) {
    super(`extraction_unavailable: ${reason}`);
    this.name = "ExtractionUnavailableError";
  }
}

/**
 * Error específico de configuración: falta `GEMINI_API_KEY`. Se distingue del 503
 * genérico para que la UI pueda decir qué hacer (editar `.env`) en vez de
 * "servicio no disponible".
 */
export class ExtractionNotConfiguredError extends ExtractionUnavailableError {
  constructor() {
    super("missing_api_key");
    this.name = "ExtractionNotConfiguredError";
  }
}

export class ExtractionInvalidError extends Error {
  constructor(detail: string) {
    super(`extraction_invalid: ${detail}`);
    this.name = "ExtractionInvalidError";
  }
}

export const EXTRACTION_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/json",
] as const;

const PROMPT = `Extraé los datos de esta factura y devolvé solamente el JSON que cumple el schema.
Normalizá todas las fechas a YYYY-MM-DD. La moneda debe ser una de USD, MXN, COP o EUR.
No inventes campos: si un dato no está en el documento, omitilo.`;

function responseBody(response: unknown): unknown {
  if (typeof response === "string") return JSON.parse(response);

  if (response !== null && typeof response === "object") {
    const text = (response as { text?: unknown }).text;
    if (typeof text === "function") return JSON.parse((text as () => string)());
    if (typeof text === "string") return JSON.parse(text);
  }

  return response;
}

async function defaultCaller(request: {
  model: string;
  contents: unknown;
  config: unknown;
}): Promise<unknown> {
  const apiKey = loadEnv().GEMINI_API_KEY;
  if (apiKey === undefined) {
    throw new ExtractionNotConfiguredError();
  }

  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey });
  return ai.models.generateContent({
    model: request.model,
    contents: request.contents as never,
    config: request.config as never,
  });
}

/**
 * Manda el archivo al modelo y valida la respuesta con `ExtractedInvoice`. El LLM percibe,
 * no decide: lo único que sale de acá es el JSON validado (los campos extra se descartan).
 *
 * Un JSON mock se valida localmente sin red: es el camino de la demo y del seed.
 */
export async function extractInvoice(
  input: { buffer: Buffer; mimeType: string },
  caller: GeminiCaller = defaultCaller,
): Promise<ExtractedInvoice> {
  if (!(EXTRACTION_MIME_TYPES as readonly string[]).includes(input.mimeType)) {
    throw new InvalidFileTypeError(input.mimeType);
  }

  if (input.mimeType === "application/json") {
    try {
      return ExtractedInvoice.parse(JSON.parse(input.buffer.toString("utf8")));
    } catch (error) {
      throw new ExtractionInvalidError((error as Error).message);
    }
  }

  const model = loadEnv().GEMINI_MODEL;
  let raw: unknown;
  try {
    raw = await caller({
      model,
      contents: [
        { inlineData: { mimeType: input.mimeType, data: input.buffer.toString("base64") } },
        { text: PROMPT },
      ],
      config: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: toGeminiResponseSchema(),
      },
    });
  } catch (error) {
    if (error instanceof ExtractionUnavailableError) throw error;
    throw new ExtractionUnavailableError((error as Error).message);
  }

  let parsed: unknown;
  try {
    parsed = responseBody(raw);
  } catch (error) {
    throw new ExtractionInvalidError((error as Error).message);
  }

  const result = ExtractedInvoice.safeParse(parsed);
  if (!result.success) {
    throw new ExtractionInvalidError(result.error.issues.map((i) => i.message).join("; "));
  }
  return result.data;
}

export type PersistExtractionResult =
  | { duplicate: false; invoice_id: string }
  | {
      duplicate: true;
      invoice_id: null;
      duplicate_of: string;
      decision: { verdict: "FRENAR"; reason_code: "ERR_DUPLICATE_INVOICE"; explanation: string };
    };

/**
 * Persiste la extracción completa en una transacción: la factura nace en `EXTRAIDA` con la
 * tasa congelada, sus `line_items` y el intento enlazado. `invoices` exige todos los NOT NULL,
 * así que una fila parcial no puede existir.
 *
 * Antes del INSERT chequea el segundo nivel de dedup (S5): mismo `(vendor, invoice_number)` con
 * otro hash. En ese caso no crea factura: marca el intento `DUPLICADA`, lo ancla a la canónica y
 * escribe la decisión FRENAR anclada al intento, igual que el dedup por hash.
 */
export function persistExtraction(
  attemptId: string,
  extracted: ExtractedInvoice,
  db: Database.Database,
): PersistExtractionResult {
  return db.transaction(() => {
    const attempt = getAttempt(attemptId);
    if (attempt === null) throw new Error("attempt_not_found");
    if (attempt.invoice_id !== null) throw new Error("already_processed");

    const vendor = db
      .prepare("SELECT id FROM vendors WHERE tax_id = ?")
      .get(extracted.vendor_tax_id ?? "") as { id: string } | undefined;

    const logicalDuplicate =
      vendor === undefined
        ? undefined
        : (db
            .prepare(
              "SELECT id, ingested_at FROM invoices WHERE vendor_id = ? AND invoice_number = ?",
            )
            .get(vendor.id, extracted.invoice_number) as
            { id: string; ingested_at: string } | undefined);

    if (logicalDuplicate !== undefined) {
      db.prepare(
        `UPDATE ingest_attempts SET attempt_status = 'DUPLICADA', duplicate_of_invoice_id = ?
         WHERE id = ?`,
      ).run(logicalDuplicate.id, attemptId);

      const policy = getActivePolicyRow(db);
      if (policy === null) throw new Error("no_active_policy");

      const explanation = `La factura ${extracted.invoice_number} ya fue registrada el ${logicalDuplicate.ingested_at.slice(0, 10)}`;
      insertDecision({
        invoice_id: null,
        ingest_attempt_id: attemptId,
        verdict: "FRENAR",
        reason_code: "ERR_DUPLICATE_INVOICE",
        explanation,
        policy_version: policy.version,
        amount_usd_evaluated: 0,
        decided_by: "AGENTE",
      });

      return {
        duplicate: true as const,
        invoice_id: null,
        duplicate_of: logicalDuplicate.id,
        decision: {
          verdict: "FRENAR" as const,
          reason_code: "ERR_DUPLICATE_INVOICE" as const,
          explanation,
        },
      };
    }

    const { total_usd, fx_rate_used } = toUsd(extracted.total_amount, extracted.currency, db);
    const invoiceId = randomUUID();
    const confidence = globalConfidence(extracted.field_confidence);

    db.prepare(
      `INSERT INTO invoices (id, vendor_id, invoice_number, status, file_name, mime_type,
        file_hash, issue_date, due_date, currency, subtotal, tax_amount, total_amount,
        fx_rate_used, total_usd, extraction_confidence, extraction_json, ingested_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      invoiceId,
      vendor?.id ?? null,
      extracted.invoice_number,
      "EXTRAIDA",
      attempt.file_name,
      attempt.mime_type,
      attempt.file_hash,
      extracted.issue_date ?? null,
      extracted.due_date ?? null,
      extracted.currency,
      extracted.subtotal === undefined ? null : round2(extracted.subtotal),
      extracted.tax_amount === undefined ? null : round2(extracted.tax_amount),
      round2(extracted.total_amount),
      fx_rate_used,
      total_usd,
      confidence ?? null,
      JSON.stringify(extracted),
      new Date().toISOString(),
    );

    const insertItem = db.prepare(
      `INSERT INTO line_items (id, invoice_id, description, quantity, unit_price, total)
       VALUES (?,?,?,?,?,?)`,
    );
    for (const item of extracted.line_items ?? []) {
      insertItem.run(
        randomUUID(),
        invoiceId,
        item.description,
        item.quantity,
        round2(item.unit_price),
        round2(item.total),
      );
    }

    linkAttemptToInvoice(attemptId, invoiceId);
    return { duplicate: false as const, invoice_id: invoiceId };
  })();
}
