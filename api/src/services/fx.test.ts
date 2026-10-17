import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, test } from "node:test";

import type Database from "better-sqlite3";

import { closeDb, loadDb } from "../db/index.js";
import { createAttempt } from "../repositories/ingest.js";
import { extractInvoice, persistExtraction } from "./extract.js";
import { CurrencyNotAllowedError, toUsd } from "./fx.js";

let db: Database.Database;

beforeEach(() => {
  db = loadDb(":memory:");
});

afterEach(() => {
  closeDb();
});

test("EUR 5000 -> 5400.00 y la tasa queda congelada", async () => {
  const { total_usd, fx_rate_used } = toUsd(5000, "EUR", db);
  assert.equal(total_usd, 5400);
  assert.equal(fx_rate_used, 1.08);

  const extracted = await extractInvoice({
    buffer: readFileSync(new URL("../../../fixtures/TC-06.json", import.meta.url)),
    mimeType: "application/json",
  });
  const attemptId = createAttempt({
    invoice_id: null,
    file_name: "tc-06.json",
    mime_type: "application/json",
    byte_size: 10,
    file_hash: "e".repeat(64),
    attempt_status: "RECIBIDA",
    duplicate_of_invoice_id: null,
  });
  const { invoice_id } = persistExtraction(attemptId, extracted, db);

  // Cambiar la tabla de tasas después no reescribe la factura ya evaluada (RI-9).
  db.prepare("UPDATE fx_rates SET rate_to_usd = 1.1 WHERE currency = 'EUR'").run();

  const invoice = db
    .prepare("SELECT total_usd, fx_rate_used FROM invoices WHERE id = ?")
    .get(invoice_id) as { total_usd: number; fx_rate_used: number };
  assert.equal(invoice.total_usd, 5400);
  assert.equal(invoice.fx_rate_used, 1.08);
  assert.equal(toUsd(5000, "EUR", db).total_usd, 5500);
});

test("una moneda fuera de fx_rates lanza currency_not_allowed", () => {
  assert.throws(() => toUsd(100, "GBP", db), CurrencyNotAllowedError);
});

test("una moneda fuera de allowed_currencies lanza currency_not_allowed", () => {
  db.prepare("UPDATE policies SET allowed_currencies = ? WHERE version = 'v1'").run(
    JSON.stringify(["USD"]),
  );

  assert.throws(() => toUsd(100, "EUR", db), CurrencyNotAllowedError);
});

test("redondea a dos decimales en la frontera", () => {
  assert.deepEqual(toUsd(123.456, "USD", db), { total_usd: 123.46, fx_rate_used: 1 });
});
