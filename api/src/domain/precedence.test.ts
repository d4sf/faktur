import assert from "node:assert/strict";
import test from "node:test";

import { HARD_BRAKE_RULES, PRECEDENCE } from "./precedence.js";
import { REASON_CODES } from "./decision.js";

test("hay ocho numeros de regla, del 1 al 8, sin huecos", () => {
  const rules = [...new Set(PRECEDENCE.map((c) => c.rule))];
  assert.deepEqual(rules, [1, 2, 3, 4, 5, 6, 7, 8]);
});

test("hay diez condiciones: la 1 y la 6 tienen dos salidas", () => {
  assert.equal(PRECEDENCE.length, 10);
  assert.equal(PRECEDENCE.filter((c) => c.rule === 1).length, 2);
  assert.equal(PRECEDENCE.filter((c) => c.rule === 6).length, 2);
});

test("las reglas 4 a 7 solo escalan; las 2 y 3 solo frenan; la 1 tiene doble salida", () => {
  // La 1 es la unica con dos salidas: datos_ilegibles frena, confianza_baja escala. El plan
  // escribia `rule <= 3 -> FRENAR` y por eso este test fallaba: confianza_baja es regla 1 y
  // ESCALAR. El test anterior asumia que las reglas 1..3 eran solo FRENAR, pero la regla 1
  // del spec §7.4 tiene dos condiciones. El invariante real es el de los dos bucles de abajo.
  for (const c of PRECEDENCE.filter((c) => c.rule >= 4 && c.rule <= 7)) {
    assert.equal(c.verdict, "ESCALAR", c.id);
  }
  for (const c of PRECEDENCE.filter((c) => c.rule === 2 || c.rule === 3)) {
    assert.equal(c.verdict, "FRENAR", c.id);
  }
  assert.ok(
    PRECEDENCE.some((c) => c.rule === 1 && c.verdict === "FRENAR"),
    "regla 1 debe frenar",
  );
  assert.ok(
    PRECEDENCE.some((c) => c.rule === 1 && c.verdict === "ESCALAR"),
    "regla 1 debe escalar",
  );
  assert.deepEqual(HARD_BRAKE_RULES, [1, 2, 3]);
});

test("la regla 8 paga y es la ultima", () => {
  const last = PRECEDENCE[PRECEDENCE.length - 1];
  assert.equal(last.rule, 8);
  assert.equal(last.verdict, "PAGAR");
  assert.equal(last.reason_code, "SUCCESS_TOUCHLESS_STP");
});

test("todo reason_code de la precedencia esta en el enum", () => {
  const known = new Set<string>(REASON_CODES);
  for (const c of PRECEDENCE) {
    assert.equal(known.has(c.reason_code), true, c.id);
  }
});

test("los rule son ascendentes y los id son unicos", () => {
  for (let i = 1; i < PRECEDENCE.length; i++) {
    assert.ok(PRECEDENCE[i - 1].rule <= PRECEDENCE[i].rule);
  }
  assert.equal(new Set(PRECEDENCE.map((c) => c.id)).size, PRECEDENCE.length);
});
