import assert from "node:assert/strict";
import test from "node:test";

import { closeDb, loadDb } from "../db/index.js";
import { deleteSetting, getSetting, setSetting } from "./settings.js";

test("getSetting devuelve null si no existe", () => {
  const db = loadDb(":memory:");
  try {
    assert.equal(getSetting("k", db), null);
  } finally {
    closeDb();
  }
});

test("setSetting guarda y getSetting recupera", () => {
  const db = loadDb(":memory:");
  try {
    setSetting("k", "v", db);
    assert.equal(getSetting("k", db), "v");
  } finally {
    closeDb();
  }
});

test("setSetting sobrescribe el valor", () => {
  const db = loadDb(":memory:");
  try {
    setSetting("k", "v1", db);
    setSetting("k", "v2", db);
    assert.equal(getSetting("k", db), "v2");
  } finally {
    closeDb();
  }
});

test("deleteSetting elimina la clave", () => {
  const db = loadDb(":memory:");
  try {
    setSetting("k", "v", db);
    deleteSetting("k", db);
    assert.equal(getSetting("k", db), null);
  } finally {
    closeDb();
  }
});
