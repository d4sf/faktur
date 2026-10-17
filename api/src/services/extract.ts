import { loadEnv } from "../config/env.js";
import { ExtractedInvoice } from "../domain/extraction.js";
import { toGeminiResponseSchema } from "../domain/geminiSchema.js";
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
    throw new ExtractionUnavailableError("missing_api_key");
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
