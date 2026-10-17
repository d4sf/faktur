import assert from "node:assert/strict";
import test from "node:test";

import { closeDb, loadDb } from "../db/index.js";
import { insertAiExplanation, getLatestAiExplanationByDecision } from "./aiExplanations.js";

test("inserta y recupera la última explicación por decisión", () => {
  const db = loadDb(":memory:");
  try {
    // Sembrar una factura y una decisión para satisfacer las FK.
    db.prepare(
      `INSERT INTO invoices (id, status, file_name, mime_type, file_hash, currency, total_amount, fx_rate_used, total_usd, extraction_json, ingested_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      "inv-1",
      "FRENADA",
      "t.json",
      "application/json",
      "a".repeat(64),
      "USD",
      100,
      1,
      100,
      "{}",
      "2026-10-17T00:00:00.000Z",
    );
    db.prepare(
      `INSERT INTO decisions (id, invoice_id, ingest_attempt_id, verdict, reason_code, explanation, policy_version, amount_usd_evaluated, decided_by, decided_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      "dec-1",
      "inv-1",
      null,
      "FRENAR",
      "ERR_INVALID_DATA",
      "motivo",
      "v1",
      100,
      "AGENTE",
      "2026-10-17T00:00:00.000Z",
    );

    const id = insertAiExplanation(
      {
        invoice_id: "inv-1",
        decision_id: "dec-1",
        policy_version: "v1",
        model: "gemini-3.8-flash",
        prompt_version: "v1",
        explanation: "Texto de prueba",
        created_at: "2026-10-17T10:00:00.000Z",
      },
      db,
    );
    assert.ok(id);
    const row = getLatestAiExplanationByDecision("dec-1", db);
    assert.equal(row?.explanation, "Texto de prueba");
    assert.equal(row?.decision_id, "dec-1");
  } finally {
    closeDb();
  }
});

test("devuelve null si no hay explicación para la decisión", () => {
  const db = loadDb(":memory:");
  try {
    assert.equal(getLatestAiExplanationByDecision("no-existe", db), null);
  } finally {
    closeDb();
  }
});
