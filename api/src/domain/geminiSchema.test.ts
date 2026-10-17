import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

import { toGeminiResponseSchema } from "./geminiSchema.js";

const emitted = toGeminiResponseSchema();

test("la raiz no lleva $schema", () => {
  assert.equal("$schema" in emitted, false);
});

test("no hay $defs ni $ref de reutilizacion", () => {
  const text = JSON.stringify(emitted);
  assert.ok(!text.includes("$defs"), text.slice(0, 200));
  assert.ok(!text.includes("$ref"), text.slice(0, 200));
});

test("conserva line_items con sus cuatro propiedades", () => {
  const items = (emitted.properties as Record<string, unknown>)?.line_items as {
    type: string;
    items: { properties: Record<string, unknown> };
  };
  assert.equal(items.type, "array");
  assert.deepEqual(Object.keys(items.items.properties).sort(), [
    "description",
    "quantity",
    "total",
    "unit_price",
  ]);
});

test("trae field_confidence y no trae extraction_confidence", () => {
  const props = emitted.properties as Record<string, unknown>;
  assert.ok(props?.field_confidence);
  assert.equal("extraction_confidence" in (props ?? {}), false);
});

test("currency sale como enum cerrado de las cuatro", () => {
  const props = emitted.properties as Record<string, { enum?: unknown }>;
  assert.deepEqual(props?.currency?.enum, ["USD", "MXN", "COP", "EUR"]);
});

test("un schema que produce $defs hace lanzar", () => {
  const Reused = z.object({ a: z.string() });
  const conDefs = z.object({ x: Reused, y: Reused });
  assert.throws(() => toGeminiResponseSchema(conDefs, { reused: "ref" }), /\$defs/);
});
