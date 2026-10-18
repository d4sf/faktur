import assert from "node:assert/strict";
import test from "node:test";

import { closeDb, loadDb } from "../db/index.js";
import { isMaintenanceMode, setMaintenanceMode } from "./maintenance.js";

test("por defecto el modo desactivado está apagado", () => {
  const db = loadDb(":memory:");
  try {
    assert.equal(isMaintenanceMode(db), false);
  } finally {
    closeDb();
  }
});

test("setMaintenanceMode(true) activa el modo desactivado", () => {
  const db = loadDb(":memory:");
  try {
    setMaintenanceMode(true, db);
    assert.equal(isMaintenanceMode(db), true);
  } finally {
    closeDb();
  }
});

test("setMaintenanceMode(false) desactiva el modo desactivado", () => {
  const db = loadDb(":memory:");
  try {
    setMaintenanceMode(true, db);
    setMaintenanceMode(false, db);
    assert.equal(isMaintenanceMode(db), false);
  } finally {
    closeDb();
  }
});
