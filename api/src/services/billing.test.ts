import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import type Database from "better-sqlite3";

import { closeDb, loadDb } from "../db/index.js";
import { invoiceFactory, vendorFactory } from "../db/factories.js";
import { getPlan, PLANS } from "../domain/plans.js";
import { BillingError, getBillingState, setBillingPlan } from "./billing.js";

let db: Database.Database;
let previousDataDir: string | undefined;

beforeEach(() => {
  previousDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = "/tmp/opencode/billing-test";
  db = loadDb(":memory:");
});

afterEach(() => {
  closeDb();
  if (previousDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previousDataDir;
});

const OCTOBER_18 = new Date("2026-10-18T12:00:00.000Z");

test("expone los tres planes del modelo de negocio", () => {
  assert.deepEqual(
    PLANS.map((plan) => [plan.id, plan.price_usd, plan.invoice_limit]),
    [
      ["starter", 99, 100],
      ["growth", 299, 500],
      ["scale", 799, 2000],
    ],
  );
});

test("sin plan guardado devuelve Growth por defecto y cero facturas del mes", () => {
  const state = getBillingState(db, OCTOBER_18);

  assert.equal(state.plan, "growth");
  assert.equal(state.price_usd, 299);
  assert.equal(state.invoice_limit, 500);
  assert.equal(state.invoices_this_month, 0);
  assert.equal(state.overage_invoices, 0);
  assert.equal(state.overage_usd, 0);
  assert.deepEqual(state.month_start, "2026-10-01T00:00:00.000Z");
});

test("setBillingPlan persist el plan elegido", () => {
  const state = setBillingPlan(db, "starter");

  assert.equal(state.plan, "starter");
  assert.equal(getBillingState(db, OCTOBER_18).plan, "starter");
});

test("cuenta solo las facturas ingeridas dentro del mes calendario UTC", () => {
  invoiceFactory(db, { ingested_at: "2026-10-01T00:00:00.000Z" });
  invoiceFactory(db, { ingested_at: "2026-10-02T00:00:00.000Z" });
  invoiceFactory(db, { ingested_at: "2026-10-17T23:59:59.999Z" });
  invoiceFactory(db, { ingested_at: "2026-09-30T23:59:59.999Z" });

  const state = getBillingState(db, OCTOBER_18);

  assert.equal(state.invoices_this_month, 3);
});

test("calcula el excedente cuando se supera el límite del plan", () => {
  setBillingPlan(db, "starter");
  const vendor = vendorFactory(db);
  for (let index = 0; index < 101; index += 1) {
    invoiceFactory(db, {
      vendor_id: vendor.id,
      ingested_at: "2026-10-10T00:00:00.000Z",
    });
  }

  const state = getBillingState(db, OCTOBER_18);

  assert.equal(state.invoices_this_month, 101);
  assert.equal(state.overage_invoices, 1);
  assert.equal(state.overage_usd, 0.5);
});

test("rechaza un plan inexistente con BillingError invalid_plan", () => {
  assert.throws(
    () => setBillingPlan(db, "enterprise"),
    (error: unknown) => error instanceof BillingError && error.code === "invalid_plan",
  );
  assert.equal(getPlan("enterprise"), undefined);
});
