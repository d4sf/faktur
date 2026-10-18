# Guía de prueba — Integración con Slack (webhook)

Feature: pantalla **"Integraciones"** (`/integraciones`) para configurar la URL de un incoming webhook de Slack, y envío de un mensaje cuando una factura se escala a un humano (ESCALAR) o es rechazada por un humano (NEGADA).

Endpoint base: `/api/integrations/slack` (`GET`, `PUT`, `DELETE`, `POST /test`).

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

---

## 1. Pruebas automatizadas (sin red ni Slack real)

### 1.1 API

```bash
bash ./scripts/compose.sh exec app sh -c 'cd /app/api && npm test'
```

Esperado: `tests N / pass N / fail 0`. Tests nuevos relevantes:

- `src/db/schema.test.ts` — 14 tablas incluyendo `settings`.
- `src/repositories/settings.test.ts` — get/set/overwrite/delete.
- `src/services/integrations.test.ts` — validación URL, delete, test ping inválido.
- `src/routes/integrations.test.ts` — GET/PUT/DELETE/POST test (6 casos).

### 1.2 Web

```bash
bash ./scripts/compose.sh exec app sh -c 'cd /app/web && npm test'
```

Esperado: 22 tests pass.

### 1.3 Typecheck + build

```bash
bash ./scripts/compose.sh exec app sh -c 'cd /app/api && npx tsc --noEmit && npm run build'
bash ./scripts/compose.sh exec app sh -c 'cd /app/web && npx tsc --noEmit && npm run build'
```

---

## 2. Prueba manual de los endpoints (sin Slack real)

### 2.1 Estado inicial (no configurado)

```bash
curl -s http://127.0.0.1:3000/api/integrations/slack
# Esperado: {"configured":false,"url":null}
```

### 2.2 Guardar una URL válida

```bash
curl -s -X PUT http://127.0.0.1:3000/api/integrations/slack \
  -H "Content-Type: application/json" \
  -d '{"url":"https://hooks.slack.com/services/T000/B000/XXXX"}'
# Esperado: {"configured":true}
```

Verificar que se guardó (URL enmascarada):

```bash
curl -s http://127.0.0.1:3000/api/integrations/slack
# Esperado: {"configured":true,"url":"…XXXX"}  (solo últimos 8 chars)
```

### 2.3 Rechazar URL inválida

```bash
# http (no https)
curl -s -o /dev/null -w "%{http_code}\n" -X PUT http://127.0.0.1:3000/api/integrations/slack \
  -H "Content-Type: application/json" -d '{"url":"http://hooks.slack.com/services/T/B/X"}'
# Esperado: 422

# no es URL
curl -s -X PUT http://127.0.0.1:3000/api/integrations/slack \
  -H "Content-Type: application/json" -d '{"url":"no-es-url"}'
# Esperado: 422 {"error":"invalid_url",...}
```

### 2.4 Body inválido

```bash
curl -s -X PUT http://127.0.0.1:3000/api/integrations/slack \
  -H "Content-Type: application/json" -d '{"url":""}'
# Esperado: 400 {"error":"invalid_body"}
```

### 2.5 Eliminar la configuración

```bash
curl -s -X DELETE http://127.0.0.1:3000/api/integrations/slack
# Esperado: {"configured":false}

curl -s http://127.0.0.1:3000/api/integrations/slack
# Esperado: {"configured":false,"url":null}
```

### 2.6 Probar webhook (sin URL configurada)

```bash
curl -s -X POST http://127.0.0.1:3000/api/integrations/slack/test \
  -H "Content-Type: application/json" -d '{}'
# Esperado: 400 {"error":"no_url_configured"}
```

---

## 3. Prueba con un webhook real (Slack o webhook.site)

### 3.1 Obtener una URL de prueba

Opción A — Slack real:
1. Ir a https://api.slack.com/apps → "Create New App" → "From scratch".
2. "Incoming Webhooks" → activar → "Add New Webhook to Workspace" → elegir canal.
3. Copiar la URL generada (`https://hooks.slack.com/services/...`).

Opción B — webhook.site (para pruebas sin Slack):
1. Ir a https://webhook.site → copiar la URL única (`https://webhook.site/<uuid>`).

### 3.2 Configurar la URL

```bash
URL="https://hooks.slack.com/services/T000/B000/XXXX"   # o la de webhook.site
curl -s -X PUT http://127.0.0.1:3000/api/integrations/slack \
  -H "Content-Type: application/json" -d "{\"url\":\"$URL\"}"
# Esperado: {"configured":true}
```

### 3.3 Probar el webhook

```bash
# Usando la URL guardada
curl -s -X POST http://127.0.0.1:3000/api/integrations/slack/test \
  -H "Content-Type: application/json" -d '{}'
# Esperado: {"ok":true,"status":200}

# O probando una URL sin guardarla
curl -s -X POST http://127.0.0.1:3000/api/integrations/slack/test \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"$URL\"}"
# Esperado: {"ok":true,"status":200}
```

Verificar en Slack (o en webhook.site) que llegó el mensaje "Ping de prueba — Blinka PayAgent".

### 3.4 Prueba de ping fallido (URL inexistente)

```bash
curl -s -X POST http://127.0.0.1:3000/api/integrations/slack/test \
  -H "Content-Type: application/json" \
  -d '{"url":"https://hooks.slack.com/services/T000/B000/NOEXISTE"}'
# Esperado: {"ok":false,"status":404,"error":"slack_webhook_failed: 404"} (o similar)
```

---

## 4. Prueba end-to-end (disparo real del webhook)

### 4.1 Preparar: configurar URL + sembrar datos demo

```bash
cd /home/daniel_alejandro/faktur
# Configurar URL (si no lo hiciste)
curl -s -X PUT http://127.0.0.1:3000/api/integrations/slack \
  -H "Content-Type: application/json" -d "{\"url\":\"$URL\"}"

# Sembrar datos demo (opcional)
bash ./scripts/compose.sh exec app sh -c 'cd /app/api && npm run db:demo'
```

### 4.2 Caso 1 — Escalada (ESCALAR) dispara webhook

Subir una factura que escale (TC-04, Growth Agency, $3.500):

```bash
RESP=$(curl -s -X POST http://127.0.0.1:3000/api/invoices \
  -F "file=@fixtures/TC-04.json;type=application/json")
echo "$RESP"
# Esperado: verdict "ESCALAR", reason_code "ALERT_THRESHOLD_EXCEEDED"
```

Verificar en Slack/webhook.site que llegó un mensaje con:
- Factura INV-GA-3500
- Proveedor Growth Agency
- Monto $3500.00 USD
- Motivo "Supera el umbral de aprobación autónoma..."
- (Si hay explicación con IA cacheada, se incluye "Explicación IA: ...")

### 4.3 Caso 2 — Rechazo humano (NEGADA) dispara webhook

1. Ir a la bandeja de aprobaciones: http://127.0.0.1:5173/bandeja
2. Elegir una factura escalada (ESCALAR).
3. Clic en "Rechazar factura" → confirmar.

Verificar en Slack/webhook.site que llegó un mensaje con:
- Motivo original de la escalada
- Monto de la factura
- (Si hay explicación con IA cacheada, se incluye)

### 4.4 Caso 3 — FRENAR NO dispara webhook

Subir una factura que frene (TC-08, Entidad Fantasma):

```bash
curl -s -X POST http://127.0.0.1:3000/api/invoices \
  -F "file=@fixtures/TC-08.json;type=application/json"
# Esperado: verdict "FRENAR"
```

Verificar que **NO** llegó ningún mensaje a Slack/webhook.site.

### 4.5 Caso 4 — PAGAR NO dispara webhook

Subir TC-01 (CloudServers, $420):

```bash
curl -s -X POST http://127.0.0.1:3000/api/invoices \
  -F "file=@fixtures/TC-01.json;type=application/json"
# Esperado: verdict "PAGAR"
```

Verificar que **NO** llegó ningún mensaje.

---

## 5. Prueba de la UI

1. Abrir http://127.0.0.1:5173
2. En el sidebar, clic en **"Integraciones"**.
3. Verificar:
   - Estado inicial: "No configurado".
   - Input para URL del webhook.
   - Botón "Guardar", "Probar webhook", "Eliminar" (solo si configurado).
   - Instrucciones para obtener la URL en Slack.
4. Pegar una URL válida → "Guardar" → estado cambia a "Configurado" con URL enmascarada.
5. "Probar webhook" → mensaje de éxito o error.
6. "Eliminar" → estado vuelve a "No configurado".

---

## 6. Verificar persistencia en DB

```bash
bash ./scripts/compose.sh exec app sh -c 'cd /app/api && node -e "
const db=require(\"better-sqlite3\")(process.env.DATA_DIR+\"/faktur.db\");
console.log(db.prepare(\"SELECT * FROM settings\").all());
"'
```

Esperado: una fila con `key='slack_webhook_url'` y la URL guardada.

---

## 7. Verificar outbox (notifications)

```bash
bash ./scripts/compose.sh exec app sh -c 'cd /app/api && node -e "
const db=require(\"better-sqlite3\")(process.env.DATA_DIR+\"/faktur.db\");
console.log(db.prepare(\"SELECT id, channel, status, created_at FROM notifications ORDER BY created_at DESC LIMIT 5\").all());
"'
```

Esperado: filas con `channel='WEBHOOK'` y `status='ENVIADA'` (o `'FALLIDA'` si el webhook falló) para los eventos ESCALAR/NEGADA. Las facturas FRENAR/PAGAR no generan fila.

---

## 8. Casos borde

### 8.1 Webhook caído → FALLIDA, decisión no se revierte

Configurar una URL inexistente, escalar una factura. La decisión debe quedar ESCALADA y la notificación `FALLIDA`. La API responde normalmente (no 500).

### 8.2 Configurar URL después de encolar

Si se encola una notificación como CONSOLE (sin URL) y luego se configura la URL, las notificaciones ya encoladas no se reenvían por Slack (channel congelado). Solo las nuevas usan Slack. Es el comportamiento esperado en MVP.

### 8.3 Precedencia settings → env var

Si `NOTIFIER_WEBHOOK_URL` está en `.env` y también hay una URL en `settings`, se usa la de `settings`. Verificar borrando la fila de settings: vuelve a usar la env var.

---

## 9. Limpieza

```bash
# Borrar configuración de Slack
curl -s -X DELETE http://127.0.0.1:3000/api/integrations/slack

# Borrar notificaciones (opcional)
bash ./scripts/compose.sh exec app sh -c 'cd /app/api && node -e "const db=require(\"better-sqlite3\")(process.env.DATA_DIR+\"/faktur.db\"); db.prepare(\"DELETE FROM notifications\").run(); db.prepare(\"DELETE FROM settings\").run(); console.log(\"limpio\");"'

# Reiniciar base de demo
bash ./scripts/compose.sh exec app sh -c 'cd /app/api && npm run db:demo'
```