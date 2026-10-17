# T4 · Fixtures/TC-*.json + ground_truth.json — Design

**Fecha:** 2026-10-17
**Estado:** aprobado, pendiente de plan e implementación
**Backlog:** `docs/backlog_implementacion_mvp.md` §T4, §6.1, §6.2
**Depende de:** T2 (mergeado)

## 1. Intent y por qué

T4 crea el set de 12 casos de prueba que mide la autonomía del agente sin gastar un centavo de API. Cada caso es un JSON que valida contra `ExtractedInvoice` (T2) y declara su veredicto esperado en `ground_truth.json`. El runner (T6) los ejecuta contra el motor (T5) y verifica que cada TC dispare la regla que su narrativa describe, no una anterior. Además, el runner afirma que el conjunto de `reason_code` producidos es igual al enum completo — así, agregar un `reason_code` nuevo sin un caso hace fallar la suite.

## 2. Goals

- 12 archivos `fixtures/TC-01.json` … `fixtures/TC-12.json`, cada uno un `ExtractedInvoice` válido.
- `fixtures/ground_truth.json` con el veredicto esperado, reason_code esperado y dependencias de cada TC.
- Al menos un PDF con estética de escaneo en `fixtures/` (artefacto suelto para la demo de extracción, T10).
- Cada TC incluye todos los campos opcionales de `ExtractedInvoice` con valores coherentes (subtotal + tax = total).
- `field_confidence` solo en TC-12 (con `due_date: 0.5`); los demás no lo incluyen.
- Nombres ficticios que coinciden con los proveedores del seed de T3.
- `just check` y `just fmt` limpios (el web no tiene tests; T4 no añade tests al web).

## 3. Non-goals (explícito)

- **No se implementa el runner.** El runner es T6. T4 solo crea los fixtures y el ground truth. El runner los consume.
- **No se implementa el motor.** El motor es T5. Los fixtures se validan contra `ExtractedInvoice` (T2), no contra el motor.
- **No se añaden tests al web.** El web no tiene tests hoy.
- **No se procesa el PDF escaneado.** Es un artefacto para la demo de extracción (T10), no para el runner.
- **No se implementa la API.** La API es T8-T10. Los fixtures son datos de prueba, no endpoints.

## 4. Constraints

- **Cada fixture valida contra `ExtractedInvoice`** (T2). Si un fixture no pasa `ExtractedInvoice.safeParse()`, T4 no está completo.
- **Nombres de proveedor coinciden con el seed de T3.** `vendor_tax_id` debe ser uno de los 8 tax_ids del seed (o un tax_id inexistente para TC-05 y TC-08, que es parte del caso).
- **Montos coherentes.** `subtotal + tax_amount = total_amount` cuando se incluyen. `total_usd` no se incluye (es del motor, no del fixture).
- **Monedas válidas.** Solo USD, MXN, COP, EUR.
- **Fechas ISO.** `issue_date` y `due_date` en formato `YYYY-MM-DD`.
- **`field_confidence` solo en TC-12.** Los demás no lo incluyen (el motor usa `undefined` → no dispara la regla 1 por confianza).
- **`line_items` coherentes.** Si se incluyen, `quantity * unit_price = total` por línea, y la suma de `total` de líneas = `subtotal` (o `total_amount` si no hay tax).
- **IDs de factura.** `invoice_number` sigue el patrón `INV-XXXX` (ficticio pero realista).

## 5. Decisiones tomadas en esta sesión

| Decisión | Elegido | Por qué |
|:---|:---|:---|
| Base por TC | Base fresca (`:memory:`) por TC, pre-estado montado por el runner | Hermeticidad: cada TC se debuggea aisladamente |
| Fixture = | `ExtractedInvoice` puro (solo datos de factura) | Valida contra T2; `ground_truth.json` lleva el resto |
| `ground_truth.json` lleva | `expected_verdict`, `expected_reason_code`, `dependsOn` | Orquestación separada de datos |
| `field_confidence` en non-TC-12 | No se incluye | El motor usa `undefined` → no dispara regla 1 por confianza |
| Campos opcionales | Todos incluidos con valores coherentes | Consistencia; TC-08 omite `vendor_tax_id` a propósito |
| Nombres ficticios | Reutilizar nombres del seed de T3 | Coincidencia con proveedores sembrados |
| TC-03 pre-estado | Runner reutiliza hash de TC-01, `file_name` diferente | Prueba dedup por hash, no por nombre |
| TC-10 pre-estado | Runner solo verifica veredicto final de TC-10 | Verificar ledger de TC-02 es responsabilidad de TC-02 |
| PDF escaneado | `fixtures/TC-08-scan.pdf` (artefacto suelto para T10) | No referenciado por fixtures ni por el runner |
| Guard del enum | Test separado en T6 | Hace que agregar un reason_code sin caso falle la suite |

## 6. Estructura de archivos

| Archivo | Acción | Responsabilidad |
|:---|:---|:---|
| `fixtures/TC-01.json` … `fixtures/TC-12.json` | Crear | Un `ExtractedInvoice` válido por caso |
| `fixtures/ground_truth.json` | Crear | Veredicto esperado, reason_code, dependsOn por TC |
| `fixtures/TC-08-scan.pdf` | Crear (o placeholder) | PDF con estética de escaneo para demo de extracción (T10) |

## 7. Esquema de `ground_truth.json`

```json
{
  "TC-01": {
    "expected_verdict": "PAGAR",
    "expected_reason_code": "SUCCESS_TOUCHLESS_STP",
    "dependsOn": []
  },
  "TC-03": {
    "expected_verdict": "FRENAR",
    "expected_reason_code": "ERR_DUPLICATE_INVOICE",
    "dependsOn": ["TC-01"]
  },
  "TC-10": {
    "expected_verdict": "ESCALAR",
    "expected_reason_code": "ALERT_BUDGET_TIGHT",
    "dependsOn": ["TC-02"]
  },
  "TC-12": {
    "expected_verdict": "ESCALAR",
    "expected_reason_code": "ALERT_LOW_CONFIDENCE",
    "dependsOn": []
  }
}
```

Cada TC tiene `expected_verdict` (PAGAR/FRENAR/ESCALAR), `expected_reason_code` (uno de los 10), y `dependsOn` (array de TC ids, vacío si no tiene dependencias).

## 7.5 Ejemplo de fixture (TC-01)

```json
{
  "invoice_number": "INV-9022",
  "vendor_name": "CloudServers Inc",
  "vendor_tax_id": "CLOUD-SERVERS-INC",
  "issue_date": "2026-10-01",
  "due_date": "2026-10-15",
  "currency": "USD",
  "subtotal": 400,
  "tax_amount": 20,
  "total_amount": 420,
  "line_items": [
    { "description": "Cloud server hosting", "quantity": 1, "unit_price": 400, "total": 400 }
  ]
}
```

Nota: no incluye `field_confidence` (solo TC-12 lo incluye).

## 7.6 Ejemplo de ground_truth.json (parcial)

```json
{
  "TC-01": {
    "expected_verdict": "PAGAR",
    "expected_reason_code": "SUCCESS_TOUCHLESS_STP",
    "dependsOn": []
  },
  "TC-03": {
    "expected_verdict": "FRENAR",
    "expected_reason_code": "ERR_DUPLICATE_INVOICE",
    "dependsOn": ["TC-01"]
  }
}
```

## 8. Los 12 fixtures (resumen)

| TC | invoice_number | vendor_tax_id | total_amount | currency | issue_date | due_date | subtotal | tax_amount | line_items | field_confidence | Notas |
|:--|:---|:---|---:|:---|:---|:---|---:|---:|:---|:---|:---|
| TC-01 | INV-9022 | CLOUD-SERVERS-INC | 420 | USD | 2026-10-01 | 2026-10-15 | 400 | 20 | 1 línea | no | PAGAR |
| TC-02 | INV-2024-089 | DEVSTUDIO-LATAM | 850 | USD | 2026-10-02 | 2026-10-20 | 800 | 50 | 1 línea | no | PAGAR |
| TC-03 | INV-9022 | CLOUD-SERVERS-INC | 420 | USD | 2026-10-01 | 2026-10-15 | 400 | 20 | 1 línea | no | Duplicado de TC-01 (mismo hash) |
| TC-04 | INV-GA-3500 | GROWTH-AGENCY | 3500 | USD | 2026-10-03 | 2026-10-25 | 3300 | 200 | 1 línea | no | Umbral (>$1000) |
| TC-05 | INV-NR-350 | NUEVO-REDATOR | 350 | USD | 2026-10-04 | 2026-10-18 | 330 | 20 | 1 línea | no | Proveedor nuevo (tax_id no en seed) |
| TC-06 | INV-LG-5000 | LEGAL-GLOBAL | 5000 | EUR | 2026-10-05 | 2026-10-30 | 4630 | 370 | 1 línea | no | EUR + presupuesto periodo |
| TC-07 | INV-FD-1200 | FREELANCE-DESIGN | 1200 | USD | 2026-10-06 | 2026-10-22 | 1100 | 100 | 1 línea | no | Drift (3x promedio) |
| TC-08 | INV-EF-900 | (omitido) | 900 | USD | 2026-10-07 | 2026-10-21 | 850 | 50 | 1 línea | no | Sin tax_id (fantasma) |
| TC-09 | INV-ST-120 | SAAS-TOOLS-LTD | 120 | USD | 2026-10-08 | 2026-10-23 | 110 | 10 | 1 línea | no | PAGAR (microgasto) |
| TC-10 | INV-DS-950 | DEVSTUDIO-LATAM | 950 | USD | 2026-10-09 | 2026-10-24 | 900 | 50 | 1 línea | no | Presupuesto categoría (depende de TC-02) |
| TC-11 | INV-VPD-200 | VENTA-POS-DUO | 200 | USD | 2026-10-10 | 2026-10-26 | 190 | 10 | 1 línea | no | Bloqueado |
| TC-12 | INV-ST-120B | SAAS-TOOLS-LTD | 120 | USD | 2026-10-11 | 2026-10-27 | 110 | 10 | 1 línea | sí (due_date: 0.5) | Confianza baja |

Notas:
- TC-05 usa `NUEVO-REDATOR` como tax_id (proveedor no en seed → regla 4).
- TC-08 omite `vendor_tax_id` (el fixture no lo incluye, para probar que el motor frene en la regla 1, no el parser).
- TC-12 reutiliza SAAS-TOOLS-LTD con el mismo monto que TC-09 pero diferente folio, para que todas las reglas de dinero pasen y solo dispare la confianza.
- `vendor_name` se incluye en todos (ej. "CloudServers Inc", "DevStudio Latam", etc.).
- `line_items` incluye una línea por factura: `{ description, quantity: 1, unit_price: subtotal, total: subtotal }`.

## 9. Criterio de aceptación (del backlog)

- Los 12 fixtures validan contra `ExtractedInvoice` (`ExtractedInvoice.safeParse(fixture).success === true`).
- El runner (T6) da el mismo resultado en cualquier orden (gracias a base fresca por TC + dependsOn).
- Cada TC dispara la regla que el caso narraría, no una anterior.
- El runner afirma que el conjunto de `reason_code` producidos es igual al enum completo (guard).

## 10. Lo que queda al builder

- Decidir los valores exactos de `issue_date` y `due_date` para cada TC (coherentes con el mes de octubre 2026).
- Decidir si `line_items` tiene 1 o más líneas por factura. Recomendación: 1 línea para simplificar, excepto TC-06 (EUR) que podría tener 2 líneas.
- Generar el PDF escaneado (puede ser un PDF existente con una foto torcida/borrosa, o generar uno con herramientas). Si no hay PDF disponible, dejar un placeholder y documentarlo.
- Decidir el formato exacto de `ground_truth.json` (pretty-printed, 2 espacios de indentación).

## 11. Fuera de scope (explícito)

- El runner (T6) — T4 solo crea fixtures y ground truth.
- El motor (T5) — T4 valida contra `ExtractedInvoice`, no contra el motor.
- Tests del web (no existen hoy).
- La API (T8-T10).
- Validación de que cada TC dispara la regla correcta — eso es T6.

## 12. Riesgos

- **Coherencia interna de los montos.** Si `subtotal + tax_amount ≠ total_amount`, el motor podría detectar inconsistencia (aunque T5 no valida esto explícitamente). Mitigación: verificar coherencia al crear cada fixture.
- **`vendor_tax_id` que no existe en el seed.** TC-05 (NUEVO-REDATOR) y TC-08 (omitido) son intencionales. El seed no los incluye. El motor debe manejar ambos casos (regla 4 y regla 1).
- **`field_confidence` solo en TC-12.** Si un fixture accidentalmente incluye `field_confidence`, el motor podría evaluar la regla 1. Mitigación: revisar que solo TC-12 lo tenga.
- **PDF escaneado no disponible.** Si no hay un PDF con estética de escaneo, dejar un placeholder y documentarlo. El runner no lo usa; solo T10 (extracción) lo necesita.