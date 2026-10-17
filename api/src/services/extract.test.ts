import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ExtractionInvalidError,
  ExtractionUnavailableError,
  extractInvoice,
  type GeminiCaller,
} from "./extract.js";

const PDF = Buffer.from("%PDF-1.4 factura de prueba");

const VALID = {
  invoice_number: "INV-GA-3500",
  vendor_name: "Growth Agency",
  vendor_tax_id: "GROWTH-AGENCY",
  issue_date: "2026-10-03",
  due_date: "2026-10-25",
  currency: "USD",
  subtotal: 3300,
  tax_amount: 200,
  total_amount: 3500,
};

function callerReturning(payload: unknown): GeminiCaller {
  return async () => ({ text: JSON.stringify(payload) });
}

test("una respuesta valida se normaliza a ExtractedInvoice y descarta campos extra", async () => {
  const result = await extractInvoice(
    { buffer: PDF, mimeType: "application/pdf" },
    callerReturning({ ...VALID, campo_inventado: "se descarta" }),
  );

  assert.equal(result.invoice_number, "INV-GA-3500");
  assert.equal(result.currency, "USD");
  assert.equal("campo_inventado" in result, false);
});

test("manda temperature 0 y el response schema al modelo", async () => {
  let seen: { model: string; config: unknown } | undefined;
  const caller: GeminiCaller = async (request) => {
    seen = request as typeof seen;
    return { text: JSON.stringify(VALID) };
  };

  await extractInvoice({ buffer: PDF, mimeType: "application/pdf" }, caller);

  assert.equal(seen?.model.length !== 0, true);
  const config = seen?.config as { temperature: number; responseSchema: unknown };
  assert.equal(config.temperature, 0);
  assert.equal(typeof config.responseSchema, "object");
});

test("una respuesta invalida no se reintenta ni se adivina", async () => {
  await assert.rejects(
    extractInvoice(
      { buffer: PDF, mimeType: "application/pdf" },
      callerReturning({ invoice_number: "INV-X" }),
    ),
    ExtractionInvalidError,
  );
});

test("sin API key y sin caller responde extraction_unavailable, no un 500 opaco", async () => {
  const previous = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  try {
    await assert.rejects(
      extractInvoice({ buffer: PDF, mimeType: "application/pdf" }),
      ExtractionUnavailableError,
    );
  } finally {
    if (previous !== undefined) process.env.GEMINI_API_KEY = previous;
  }
});

test("un JSON mock valida localmente sin red ni API key", async () => {
  const buffer = readFileSync(new URL("../../../fixtures/TC-01.json", import.meta.url));

  const result = await extractInvoice({ buffer, mimeType: "application/json" });

  assert.equal(result.invoice_number, "INV-9022");
  assert.equal(result.total_amount, 420);
});
