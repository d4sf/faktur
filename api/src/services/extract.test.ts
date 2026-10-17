import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { closeDb, loadDb } from "../db/index.js";
import { createAttempt } from "../repositories/ingest.js";
import {
  ExtractionInvalidError,
  ExtractionNotConfiguredError,
  extractInvoice,
  persistExtraction,
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

test("sin API key y sin caller responde extraction_not_configured, no un 500 opaco", async () => {
  const previous = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  try {
    await assert.rejects(
      extractInvoice({ buffer: PDF, mimeType: "application/pdf" }),
      ExtractionNotConfiguredError,
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

test("persiste una extraccion sin vendor_tax_id con line_items e intento enlazado", async () => {
  const db = loadDb(":memory:");

  try {
    const extracted = await extractInvoice({
      buffer: readFileSync(new URL("../../../fixtures/TC-08.json", import.meta.url)),
      mimeType: "application/json",
    });
    const attemptId = createAttempt({
      invoice_id: null,
      file_name: "TC-08.json",
      mime_type: "application/json",
      byte_size: 10,
      file_hash: "f".repeat(64),
      attempt_status: "RECIBIDA",
      duplicate_of_invoice_id: null,
    });

    const { invoice_id } = persistExtraction(attemptId, extracted, db);

    const invoice = db
      .prepare(
        "SELECT status, vendor_id, total_usd, extraction_confidence, extraction_json FROM invoices WHERE id = ?",
      )
      .get(invoice_id) as {
      status: string;
      vendor_id: string | null;
      total_usd: number;
      extraction_confidence: number | null;
      extraction_json: string;
    };
    const attempt = db
      .prepare("SELECT invoice_id FROM ingest_attempts WHERE id = ?")
      .get(attemptId) as { invoice_id: string | null };
    const items = db
      .prepare("SELECT COUNT(*) AS n FROM line_items WHERE invoice_id = ?")
      .get(invoice_id) as { n: number };

    assert.equal(invoice.status, "EXTRAIDA");
    assert.equal(invoice.vendor_id, null, "Entidad Fantasma no está en vendors");
    assert.equal(invoice.total_usd, 900);
    assert.equal(invoice.extraction_confidence, null);
    assert.match(invoice.extraction_json, /INV-EF-900/);
    assert.equal(attempt.invoice_id, invoice_id);
    assert.equal(items.n, 1);
  } finally {
    closeDb();
  }
});
