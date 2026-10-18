# Guía de prueba — Mejora de precisión en extracción

Feature: mejoras al prompt de extracción (instrucciones por campo, normalización, few-shot, retry, sanity checks, logging del raw response).

---

## 0. Precondiciones

```bash
cd /home/daniel_alejandro/faktur
bash ./scripts/compose.sh ps          # debe mostrar app Up (healthy)
```

Si no está arriba:

```bash
COMPOSE_ENV=dev bash ./scripts/compose.sh up -d --build
```

Verificar health:

```bash
curl -s http://127.0.0.1:3000/api/health   # {"status":"ok"}
```

Verificar que la API key esté cargada:

```bash
bash ./scripts/compose.sh exec app sh -c 'echo "KEY=${GEMINI_API_KEY:+set} MODEL=$GEMINI_MODEL"'
```

Si aparece `KEY=` vacío, recrear el contenedor:

```bash
COMPOSE_ENV=dev bash ./scripts/compose.sh up -d --force-recreate app
```

---

## 1. Pruebas automatizadas

### 1.1 API

```bash
bash ./scripts/compose.sh exec app sh -c 'cd /app/api && npm test'
```

Esperado: `tests N / pass N / fail 0`. Tests relevantes:

- `src/services/extract.test.ts` — extracción JSON, retry, validación.
- `src/domain/ruleEngine.test.ts` — sanity checks (subtotal+tax, fechas).
- `src/domain/ruleEngine.boundary.test.ts` — umbrales.
- `src/db/factories.test.ts` — `extraction_raw` en invoices.

### 1.2 Web

```bash
bash ./scripts/compose.sh exec app sh -c 'cd /app/web && npm test'
```

### 1.3 Typecheck + build

```bash
bash ./scripts/compose.sh exec app sh -c 'cd /app/api && npx tsc --noEmit && npm run build'
bash ./scripts/compose.sh exec app sh -c 'cd /app/web && npx tsc --noEmit && npm run build'
```

---

## 2. Prueba manual con tu PDF problemático

### 2.1 Subir el PDF

```bash
cd /home/daniel_alejandro/faktur

# Subir el PDF
RESP=$(curl -s -X POST http://127.0.0.1:3000/api/invoices \
  -F "file=@/ruta/a/tu/factura.pdf;type=application/pdf")
echo "$RESP"
```

Guardar el `invoice_id` y el `attempt_id`:

```bash
INVOICE_ID=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('invoice_id',''))")
ATTEMPT_ID=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('attempt_id',''))")
echo "INVOICE_ID=$INVOICE_ID"
echo "ATTEMPT_ID=$ATTEMPT_ID"
```

### 2.2 Ver la extracción (JSON validado)

```bash
curl -s "http://127.0.0.1:3000/api/invoices/$INVOICE_ID" | python3 -m json.tool
```

Verificar en el campo `record.invoice`:
- `invoice_number`: ¿correcto?
- `total_amount`: ¿correcto?
- `currency`: ¿USD/MXN/COP/EUR?
- `vendor_name`, `vendor_tax_id`: ¿correctos?
- `issue_date`, `due_date`: ¿YYYY-MM-DD?
- `subtotal`, `tax_amount`: ¿presentes y consistentes?
- `line_items`: ¿descripciones y montos correctos?

### 2.3 Ver el raw response del modelo (para diagnosticar)

El raw response se guarda en la columna `extraction_raw` de `invoices`. Consultarlo directamente:

```bash
bash ./scripts/compose.sh exec app sh -c "cd /app/api && node -e \"
const db=require('better-sqlite3')(process.env.DATA_DIR+'/faktur.db');
const r=db.prepare('SELECT extraction_json, extraction_raw, extraction_confidence FROM invoices WHERE id=?').get('$INVOICE_ID');
console.log('=== EXTRACTED (validado) ===');
console.log(JSON.stringify(JSON.parse(r.extraction_json), null, 2));
console.log('=== RAW (respuesta cruda del modelo, truncada a 4000 chars) ===');
console.log(r.extraction_raw);
console.log('=== CONFIDENCE ===', r.extraction_confidence);
\""
```

Comparar `extraction_json` (validado) vs `extraction_raw` (crudo):
- Si el raw tiene un campo que el validado no tiene → el schema lo descartó (campo extra).
- Si el raw tiene un valor distinto al validado → Zod lo transformó o rechazó.
- Si el raw está vacío o es null → el modelo no devolvió respuesta (error de red/API).

### 2.4 Ver la decisión resultante

```bash
curl -s "http://127.0.0.1:3000/api/invoices/$INVOICE_ID" | python3 -c "
import sys, json
d = json.load(sys.stdin)
r = d['record']
print('Veredicto:', r['verdict'])
print('Reason code:', r['reason_code'])
print('Motivo:', r['explanation'])
print('Confianza:', r['invoice'].get('field_confidence') if isinstance(r['invoice'], dict) else 'N/A')
"
```

Verificar:
- Si los números no cuadran → veredicto ESCALAR con motivo "subtotal + impuesto no cuadra con el total" (sanity check).
- Si la confianza es baja → ESCALAR con `ALERT_LOW_CONFIDENCE`.
- Si todo cuadra → PAGAR o la regla que corresponda.

---

## 3. Prueba del retry automático

El retry se activa cuando la primera respuesta del modelo falla la validación Zod. Para probarlo, necesitás un documento que el modelo extraiga mal la primera vez. Es difícil de forzar manualmente, pero podés verificar en los logs.

### 3.1 Ver los logs del contenedor

```bash
bash ./scripts/compose.sh logs app 2>&1 | tail -50
```

Buscar:
- Si hubo un reintento: el servicio llama al modelo dos veces (dos requests a Gemini).
- Si el reintento recuperó: la factura se procesa normalmente.
- Si falló definitivamente: `extraction_invalid` en la respuesta.

### 3.2 Forzar un caso de retry (con un JSON mock inválido)

El retry solo aplica a documentos reales (PDF/imagen), no a JSON mock (que valida localmente). Para probar el retry con un mock, no es posible directamente. Los tests automatizados (`extract.test.ts`) cubren este caso:

```bash
bash ./scripts/compose.sh exec app sh -c 'cd /app/api && npx tsx --test src/services/extract.test.ts'
```

El test "el retry recupera una respuesta que falló la validación la primera vez" verifica que el reintento funciona.

---

## 4. Prueba de sanity checks

### 4.1 Crear un JSON mock con números inconsistentes

```bash
cd /home/daniel_alejandro/faktur
cat > /tmp/factura-inconsistente.json <<'EOF'
{
  "invoice_number": "INV-TEST-001",
  "vendor_name": "Proveedor Test",
  "vendor_tax_id": "TEST-TAX-001",
  "issue_date": "2026-10-01",
  "due_date": "2026-10-31",
  "currency": "USD",
  "subtotal": 100,
  "tax_amount": 20,
  "total_amount": 500,
  "field_confidence": {
    "invoice_number": 0.99,
    "vendor_tax_id": 0.98,
    "total_amount": 0.99,
    "currency": 1.0,
    "due_date": 0.95
  }
}
EOF

# Subir
RESP=$(curl -s -X POST http://127.0.0.1:3000/api/invoices \
  -F "file=@/tmp/factura-inconsistente.json;type=application/json")
echo "$RESP"
# Esperado: verdict "ESCALAR", reason_code "ALERT_LOW_CONFIDENCE",
# motivo "Los datos extraídos son inconsistentes: subtotal + impuesto no cuadra con el total"
```

### 4.2 Crear un JSON mock con fechas inconsistentes

```bash
cat > /tmp/factura-fechas.json <<'EOF'
{
  "invoice_number": "INV-TEST-002",
  "vendor_name": "Proveedor Test",
  "vendor_tax_id": "TEST-TAX-002",
  "issue_date": "2026-10-31",
  "due_date": "2026-10-01",
  "currency": "USD",
  "subtotal": 100,
  "tax_amount": 20,
  "total_amount": 120,
  "field_confidence": {
    "invoice_number": 0.99,
    "vendor_tax_id": 0.98,
    "total_amount": 0.99,
    "currency": 1.0,
    "due_date": 0.95
  }
}
EOF

RESP=$(curl -s -X POST http://127.0.0.1:3000/api/invoices \
  -F "file=@/tmp/factura-fechas.json;type=application/json")
echo "$RESP"
# Esperado: verdict "ESCALAR", reason_code "ALERT_LOW_CONFIDENCE",
# motivo "Los datos extraídos son inconsistentes: la fecha de vencimiento es anterior a la de emisión"
```

### 4.3 Crear un JSON mock con total <= 0

```bash
cat > /tmp/factura-cero.json <<'EOF'
{
  "invoice_number": "INV-TEST-003",
  "vendor_name": "Proveedor Test",
  "vendor_tax_id": "TEST-TAX-003",
  "issue_date": "2026-10-01",
  "due_date": "2026-10-31",
  "currency": "USD",
  "subtotal": 0,
  "tax_amount": 0,
  "total_amount": 0,
  "field_confidence": {
    "invoice_number": 0.99,
    "vendor_tax_id": 0.98,
    "total_amount": 0.99,
    "currency": 1.0,
    "due_date": 0.95
  }
}
EOF

RESP=$(curl -s -X POST http://127.0.0.1:3000/api/invoices \
  -F "file=@/tmp/factura-cero.json;type=application/json")
echo "$RESP"
# Esperado: error de validación (total_amount debe ser > 0) → 422 extraction_invalid
# o FRENAR por ERR_INVALID_DATA (si pasa el schema). Con el schema tightening,
# total_amount: z.number().positive() rechaza 0 → 422 extraction_invalid.
```

---

## 5. Prueba de instrucciones para scans (PDF escaneado)

### 5.1 Subir un PDF escaneado

Si tenés un PDF con estética de escaneo (imagen de factura):

```bash
RESP=$(curl -s -X POST http://127.0.0.1:3000/api/invoices \
  -F "file=@/ruta/a/factura-escaneada.pdf;type=application/pdf")
echo "$RESP"
```

Verificar la extracción (§2.2 y §2.3). Comparar con la versión anterior del prompt (si tenés un backup) para ver si mejoró.

### 5.2 Verificar el raw response

```bash
INVOICE_ID=<id>
bash ./scripts/compose.sh exec app sh -c "cd /app/api && node -e \"
const db=require('better-sqlite3')(process.env.DATA_DIR+'/faktur.db');
const r=db.prepare('SELECT extraction_json, extraction_raw, extraction_confidence FROM invoices WHERE id=?').get('$INVOICE_ID');
console.log('CONFIDENCE:', r.extraction_confidence);
console.log('RAW LENGTH:', r.extraction_raw ? r.extraction_raw.length : 0);
\""
```

---

## 6. Prueba de normalización (fechas y moneda)

### 6.1 Fechas en formato no ISO

```bash
cat > /tmp/factura-fechas2.json <<'EOF'
{
  "invoice_number": "INV-DATE-TEST",
  "vendor_name": "Proveedor Fecha",
  "vendor_tax_id": "TAX-DATE",
  "issue_date": "2026-10-01",
  "due_date": "2026-10-31",
  "currency": "EUR",
  "subtotal": 100,
  "tax_amount": 20,
  "total_amount": 120,
  "field_confidence": {
    "invoice_number": 0.99,
    "vendor_tax_id": 0.98,
    "total_amount": 0.99,
    "currency": 1.0,
    "due_date": 0.9
  }
}
EOF

# Este es un JSON mock, así que se valida localmente. Para probar normalización
# de fechas en PDF/imagen, subí un documento con fechas en formato "12/10/2026"
# o "Oct 12, 2026" y verificá que el raw response las normaliza a "2026-10-12".
```

---

## 7. Verificar que el raw se guarda correctamente

```bash
# Subir cualquier factura
RESP=$(curl -s -X POST http://127.0.0.1:3000/api/invoices \
  -F "file=@fixtures/TC-01.json;type=application/json")
INVOICE_ID=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('invoice_id',''))")

# Verificar que extraction_raw se guardó
bash ./scripts/compose.sh exec app sh -c "cd /app/api && node -e \"
const db=require('better-sqlite3')(process.env.DATA_DIR+'/faktur.db');
const r=db.prepare('SELECT extraction_raw FROM invoices WHERE id=?').get('$INVOICE_ID');
console.log('extraction_raw length:', r.extraction_raw ? r.extraction_raw.length : 'null');
console.log('extraction_raw preview:', r.extraction_raw ? r.extraction_raw.slice(0, 200) : 'null');
\""
```

Esperado: `extraction_raw length: <número > 0` y preview del JSON crudo.

---

## 8. Casos borde

### 8.1 JSON mock con campo extra

```bash
cat > /tmp/factura-extra.json <<'EOF'
{
  "invoice_number": "INV-EXTRA",
  "vendor_name": "Proveedor Extra",
  "vendor_tax_id": "TAX-EXTRA",
  "issue_date": "2026-10-01",
  "due_date": "2026-10-31",
  "currency": "USD",
  "subtotal": 100,
  "tax_amount": 20,
  "total_amount": 120,
  "campo_inventado": "se descarta",
  "field_confidence": {
    "invoice_number": 0.99,
    "vendor_tax_id": 0.98,
    "total_amount": 0.99,
    "currency": 1.0,
    "due_date": 0.95
  }
}
EOF

RESP=$(curl -s -X POST http://127.0.0.1:3000/api/invoices \
  -F "file=@/tmp/factura-extra.json;type=application/json")
echo "$RESP"
# Esperado: se procesa normalmente (campo extra se descarta). Verificar en el detalle
# que "campo_inventado" no aparece en la extracción.
```

### 8.2 Moneda no permitida (sanity + regla 1)

```bash
cat > /tmp/factura-moneda.json <<'EOF'
{
  "invoice_number": "INV-MONEDA",
  "vendor_name": "Proveedor Moneda",
  "vendor_tax_id": "TAX-MONEDA",
  "issue_date": "2026-10-01",
  "due_date": "2026-10-31",
  "currency": "GBP",
  "subtotal": 100,
  "tax_amount": 20,
  "total_amount": 120,
  "field_confidence": {
    "invoice_number": 0.99,
    "vendor_tax_id": 0.98,
    "total_amount": 0.99,
    "currency": 0.9,
    "due_date": 0.95
  }
}
EOF

RESP=$(curl -s -X POST http://127.0.0.1:3000/api/invoices \
  -F "file=@/tmp/factura-moneda.json;type=application/json")
echo "$RESP"
# Esperado: FRENAR, ERR_INVALID_DATA (moneda no permitida)
```

### 8.3 Confianza baja → ESCALAR

```bash
cat > /tmp/factura-baja-conf.json <<'EOF'
{
  "invoice_number": "INV-BAJA",
  "vendor_name": "Proveedor Baja",
  "vendor_tax_id": "TAX-BAJA",
  "issue_date": "2026-10-01",
  "due_date": "2026-10-31",
  "currency": "USD",
  "subtotal": 100,
  "tax_amount": 20,
  "total_amount": 120,
  "field_confidence": {
    "invoice_number": 0.99,
    "vendor_tax_id": 0.98,
    "total_amount": 0.99,
    "currency": 1.0,
    "due_date": 0.5
  }
}
EOF

RESP=$(curl -s -X POST http://127.0.0.1:3000/api/invoices \
  -F "file=@/tmp/factura-baja-conf.json;type=application/json")
echo "$RESP"
# Esperado: ESCALAR, ALERT_LOW_CONFIDENCE, motivo con due_date y 0.5 < 0.7
```

---

## 9. Limpieza

```bash
# Borrar archivos temporales
rm -f /tmp/factura-*.json /tmp/factura-*.pdf

# Reiniciar base de demo
bash ./scripts/compose.sh exec app sh -c 'cd /app/api && npm run db:demo'
```