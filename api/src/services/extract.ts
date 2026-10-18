import { randomUUID } from "node:crypto";

import type Database from "better-sqlite3";

import { loadEnv } from "../config/env.js";
import { ExtractedInvoice, globalConfidence } from "../domain/extraction.js";
import { toGeminiResponseSchema } from "../domain/geminiSchema.js";
import { getAttempt, linkAttemptToInvoice } from "../repositories/ingest.js";
import { insertDecision } from "../repositories/decisions.js";
import { getActivePolicyRow } from "../repositories/policies.js";
import { defaultNotifier, dispatchNotification, queueNotification } from "./notifier.js";
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

export type ExtractionResult = {
  extracted: ExtractedInvoice;
  raw: string;
};

const PROMPT = `Sos un extractor de datos de facturas. Tu única tarea es leer el documento adjunto y devolver un JSON que cumpla exactamente el schema. No inventes datos.

REGLAS DE EXTRACCIÓN:
- invoice_number: el número o folio de la factura (string). Buscalo en el encabezado, cerca de "Invoice", "Factura", "Folio", "N°", "No.".
- total_amount: el monto total a pagar (número, sin símbolos ni separadores de miles). Buscalo en "Total", "Total a pagar", "Grand Total", "Importe total".
- currency: la moneda en código ISO (USD, MXN, COP o EUR). Normalizá: "usd"/"dólares"/"$" → "USD", "mxn"/"pesos" → "MXN", "cop" → "COP", "eur"/"€" → "EUR". Si no está explícita, inferila del símbolo o del país del emisor.
- vendor_name: nombre del emisor/proveedor (string).
- vendor_tax_id: identificador fiscal del emisor (RFC, CUIT, NIT, EIN, RUT, etc.). Si no aparece, omitilo.
- issue_date: fecha de emisión en YYYY-MM-DD.
- due_date: fecha de vencimiento en YYYY-MM-DD.
- subtotal: subtotal antes de impuestos (número).
- tax_amount: monto de impuestos (número).
- line_items: lista de conceptos con description, quantity, unit_price, total.
- field_confidence: objeto con confianza (0 a 1) para invoice_number, vendor_tax_id, total_amount, currency, due_date. Reportalo siempre.

REGLAS DE NORMALIZACIÓN:
- Fechas: siempre YYYY-MM-DD. "12/10/2026", "Oct 12, 2026", "12-Oct-2026" → "2026-10-12".
- Moneda: siempre código ISO de 3 letras en mayúsculas.
- Montos: número sin símbolos, sin separadores de miles, con punto decimal (ej. 1234.56).
- Si un campo no está en el documento, omitilo. Nunca inventes montos, fechas ni nombres.

INSTRUCCIONES PARA DOCUMENTOS ESCANEADOS O FOTOS:
- Si el documento está escaneado, es una foto o tiene baja calidad, leé con cuidado las cifras manuscritas o impresas con baja resolución.
- Verificá dos veces los montos y las fechas.
- Si no podés leer un campo con confianza, reportá confianza baja (< 0.7) en field_confidence.

EJEMPLO:
Entrada: factura de "CloudServers Inc", folio INV-9022, emisión 2026-10-01, vencimiento 2026-10-15, USD, subtotal 400, impuesto 20, total 420.
Salida:
{
  "invoice_number": "INV-9022",
  "vendor_name": "CloudServers Inc",
  "vendor_tax_id": "CLOUD-SERVERS-INC",
  "issue_date": "2026-10-01",
  "due_date": "2026-10-15",
  "currency": "USD",
  "subtotal": 400,
  "tax_amount": 20,
  "total_amount": 420,
  "field_confidence": {
    "invoice_number": 0.99,
    "vendor_tax_id": 0.98,
    "total_amount": 0.99,
    "currency": 1.0,
    "due_date": 0.95
  }
}

Devolvé solamente el JSON que cumple el schema. No agregues texto fuera del JSON.`;

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

async function callModel(
  model: string,
  contents: unknown,
  config: unknown,
  caller: GeminiCaller,
): Promise<unknown> {
  try {
    return await caller({ model, contents, config });
  } catch (error) {
    if (error instanceof ExtractionUnavailableError) throw error;
    throw new ExtractionUnavailableError((error as Error).message);
  }
}

function parseResponse(raw: unknown): ExtractedInvoice {
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

/**
 * Manda el archivo al modelo y valida la respuesta con `ExtractedInvoice`. El LLM percibe,
 * no decide: lo único que sale de acá es el JSON validado (los campos extra se descartan).
 *
 * Un JSON mock se valida localmente sin red: es el camino de la demo y del seed.
 *
 * Si la validación Zod falla, se hace un reintento con el error en el prompt.
 * Si falla de nuevo, se lanza `ExtractionInvalidError` (fail-closed).
 */
export async function extractInvoice(
  input: { buffer: Buffer; mimeType: string },
  caller: GeminiCaller = defaultCaller,
): Promise<ExtractionResult> {
  if (!(EXTRACTION_MIME_TYPES as readonly string[]).includes(input.mimeType)) {
    throw new InvalidFileTypeError(input.mimeType);
  }

  if (input.mimeType === "application/json") {
    try {
      const extracted = ExtractedInvoice.parse(JSON.parse(input.buffer.toString("utf8")));
      return { extracted, raw: input.buffer.toString("utf8") };
    } catch (error) {
      throw new ExtractionInvalidError((error as Error).message);
    }
  }

  const model = loadEnv().GEMINI_MODEL;
  const contents = [
    { inlineData: { mimeType: input.mimeType, data: input.buffer.toString("base64") } },
    { text: PROMPT },
  ];
  const config = {
    temperature: 0,
    responseMimeType: "application/json",
    responseSchema: toGeminiResponseSchema(),
    mediaResolution: "MEDIA_RESOLUTION_HIGH",
  };

  const rawResponse = await callModel(model, contents, config, caller);
  const rawText = typeof rawResponse === "string" ? rawResponse : JSON.stringify(rawResponse);

  let extracted: ExtractedInvoice;
  try {
    extracted = parseResponse(rawResponse);
  } catch (firstError) {
    if (!(firstError instanceof ExtractionInvalidError)) throw firstError;
    // Retry con feedback
    const retryContents = [
      { inlineData: { mimeType: input.mimeType, data: input.buffer.toString("base64") } },
      { text: `${PROMPT}\n\nTu respuesta anterior falló la validación por: ${firstError.message}. Corregila y devolvé solo el JSON válido.` },
    ];
    const retryResponse = await callModel(model, retryContents, config, caller);
    extracted = parseResponse(retryResponse);
  }

  return { extracted, raw: rawText.slice(0, 4000) };
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
  raw?: string,
): PersistExtractionResult {
  let notificationId: string | undefined;
  let notifierInstance: import("./notifier.js").Notifier | undefined;

  const result = db.transaction((): PersistExtractionResult => {
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
      const decId = insertDecision({
        invoice_id: null,
        ingest_attempt_id: attemptId,
        verdict: "FRENAR",
        reason_code: "ERR_DUPLICATE_INVOICE",
        explanation,
        policy_version: policy.version,
        amount_usd_evaluated: 0,
        decided_by: "AGENTE",
      });

      const notifier = defaultNotifier(db);
      notificationId = queueNotification({
        invoice_id: logicalDuplicate.id,
        decision_id: decId,
        channel: notifier.channel,
        reason_code: "ERR_DUPLICATE_INVOICE",
        explanation,
        amount_usd: 0,
        ...(extracted.vendor_name === undefined ? {} : { vendor_name: extracted.vendor_name }),
      });
      notifierInstance = notifier.notifier;

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
        fx_rate_used, total_usd, extraction_confidence, extraction_json, extraction_raw, ingested_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
      raw === undefined ? null : raw.slice(0, 4000),
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

  if (notificationId !== undefined && notifierInstance !== undefined) {
    void dispatchNotification(notificationId, notifierInstance, db);
  }

  return result;
}
