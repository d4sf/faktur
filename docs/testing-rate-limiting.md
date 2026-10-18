# Guía de prueba — Rate Limiting y Throttling

Feature: rate limiting por IP en la API (global + por endpoint) y throttling en la web.

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

> **Importante:** las variables `RATE_LIMIT_*` se leen al arrancar el contenedor.
> `compose.yml` ya las pasa desde `.env`. Si cambiás alguna, recreá el contenedor:
> ```bash
> COMPOSE_ENV=dev bash ./scripts/compose.sh up -d --force-recreate app
> ```
> Verificá que quedaron cargadas:
> ```bash
> bash ./scripts/compose.sh exec app sh -c 'echo "MAX=$RATE_LIMIT_MAX WINDOW=$RATE_LIMIT_WINDOW_MS"'
> ```

---

## 1. Pruebas automatizadas

### 1.1 API

```bash
bash ./scripts/compose.sh exec app sh -c 'cd /app/api && npm test'
```

Esperado: `tests N / pass N / fail 0`. Tests nuevos relevantes:

- `src/routes/rateLimit.test.ts` — 3 casos (global 429 + Retry-After + easter egg, health exento, modo desactivado).

### 1.2 Web

```bash
bash ./scripts/compose.sh exec app sh -c 'cd /app/web && npm test'
```

Esperado: 24 tests pass.

### 1.3 Typecheck + lint + build

```bash
bash ./scripts/compose.sh exec app sh -c 'cd /app/api && npx tsc --noEmit && npm run build'
bash ./scripts/compose.sh exec app sh -c 'cd /app/web && npx tsc --noEmit && npm run build'
bash ./scripts/compose.sh exec app sh -c 'cd /app && npx eslint .'
```

Esperado: sin errores.

---

## 2. Prueba manual — rate limiting global

El límite global por defecto es 120 req/min por IP. Para probar fácilmente, bajá el límite con la env var y recreá el contenedor.

### 2.1 Configurar límite bajo

```bash
# .env
RATE_LIMIT_MAX=3
RATE_LIMIT_WINDOW_MS=60000
```

Recrear el contenedor:

```bash
COMPOSE_ENV=dev bash ./scripts/compose.sh up -d --force-recreate app
bash ./scripts/compose.sh exec app sh -c 'until wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; do sleep 1; done; echo ready'
```

### 2.2 Hacer 4 requests seguidos

```bash
for i in 1 2 3 4; do
  echo "=== request $i ==="
  curl -s -o /tmp/resp.txt -w "HTTP %{http_code}\n" http://127.0.0.1:3000/api/audit-trail
  cat /tmp/resp.txt | head -c 200
  echo
done
```

Esperado:
- Requests 1-3: `HTTP 200`.
- Request 4: `HTTP 429` con body:

```json
{
  "error": "rate_limit_exceeded",
  "retry_after": 60,
  "data": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}
```

Y el header `Retry-After: 60`.

### 2.3 Verificar headers de rate limit

```bash
curl -s -D - -o /dev/null http://127.0.0.1:3000/api/audit-trail | grep -i "ratelimit\|retry-after"
```

Esperado:
```
x-ratelimit-limit: 3
x-ratelimit-remaining: 2
x-ratelimit-reset: 60
```

---

## 3. Prueba manual — endpoints exentos

### 3.1 Health (no se limita)

Con el límite global en 3, hacer 10 requests a `/api/health`:

```bash
for i in $(seq 1 10); do
  curl -s -o /dev/null -w "%{http_code} " http://127.0.0.1:3000/api/health
done
echo
# Esperado: 200 200 200 200 200 200 200 200 200 200
```

### 3.2 SSE stream (no se limita por minuto)

```bash
timeout 3 curl -s -N http://127.0.0.1:3000/api/approvals/stream
# Esperado: data: {"type":"CONNECTED"} y luego se corta por timeout
```

---

## 4. Prueba manual — límites por endpoint

### 4.1 Upload (límite 10 por defecto)

Configurar límite bajo para upload:

```bash
# .env
RATE_LIMIT_UPLOAD_MAX=2
RATE_LIMIT_UPLOAD_WINDOW_MS=60000
```

Recrear y probar:

```bash
COMPOSE_ENV=dev bash ./scripts/compose.sh up -d --force-recreate app
bash ./scripts/compose.sh exec app sh -c 'until wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; do sleep 1; done; echo ready'

cd /home/daniel_alejandro/faktur
for i in 1 2 3; do
  echo "=== upload $i ==="
  curl -s -o /tmp/resp.txt -w "HTTP %{http_code}\n" \
    -X POST http://127.0.0.1:3000/api/invoices \
    -F "file=@fixtures/TC-01.json;type=application/json"
  cat /tmp/resp.txt | head -c 120
  echo
done
```

Esperado:
- Uploads 1-2: `HTTP 201` (o 200 si duplicado).
- Upload 3: `HTTP 429` con `rate_limit_exceeded`.

### 4.2 Explain (límite 5 por defecto)

```bash
# .env
RATE_LIMIT_EXPLAIN_MAX=2
RATE_LIMIT_EXPLAIN_WINDOW_MS=60000
```

Recrear, subir una factura FRENAR (TC-08) para obtener un `invoice_id`, luego:

```bash
INVOICE_ID=<id>
for i in 1 2 3; do
  echo "=== explain $i ==="
  curl -s -o /tmp/resp.txt -w "HTTP %{http_code}\n" \
    -X POST "http://127.0.0.1:3000/api/invoices/$INVOICE_ID/explain" \
    -H "Content-Type: application/json" -d '{}'
  cat /tmp/resp.txt | head -c 120
  echo
done
```

Esperado:
- Explains 1-2: `HTTP 201` (o 200 si cacheado).
- Explain 3: `HTTP 429`.

### 4.3 Admin reset (límite 3 por defecto)

```bash
# .env
RATE_LIMIT_ADMIN_MAX=2
RATE_LIMIT_ADMIN_WINDOW_MS=60000
ALLOW_DB_RESET=true
```

Recrear y probar (con token si aplica):

```bash
for i in 1 2 3; do
  echo "=== reset $i ==="
  curl -s -o /tmp/resp.txt -w "HTTP %{http_code}\n" \
    -X POST http://127.0.0.1:3000/api/admin/db/reset \
    -H "Content-Type: application/json" \
    -H "X-Admin-Token: $ADMIN_TOKEN" \
    -d '{"profile":"empty","confirm":"REINICIAR"}'
  cat /tmp/resp.txt | head -c 120
  echo
done
```

Esperado:
- Resets 1-2: `HTTP 200`.
- Reset 3: `HTTP 429`.

### 4.4 Webhook test (límite 5 por defecto)

```bash
# .env
RATE_LIMIT_WEBHOOK_TEST_MAX=2
RATE_LIMIT_WEBHOOK_TEST_WINDOW_MS=60000
```

Recrear y probar:

```bash
URL="https://hooks.slack.com/services/T/B/X"
for i in 1 2 3; do
  echo "=== test $i ==="
  curl -s -o /tmp/resp.txt -w "HTTP %{http_code}\n" \
    -X POST http://127.0.0.1:3000/api/integrations/slack/test \
    -H "Content-Type: application/json" -d "{\"url\":\"$URL\"}"
  cat /tmp/resp.txt | head -c 120
  echo
done
```

Esperado:
- Tests 1-2: `HTTP 200` o `502` (según respuesta del webhook).
- Test 3: `HTTP 429`.

### 4.5 Policy preview (límite 5 por defecto)

```bash
# .env
RATE_LIMIT_EXPLAIN_MAX=2   # policyPreview usa el mismo default que explain
RATE_LIMIT_EXPLAIN_WINDOW_MS=60000
```

Recrear y probar:

```bash
for i in 1 2 3; do
  echo "=== preview $i ==="
  curl -s -o /tmp/resp.txt -w "HTTP %{http_code}\n" \
    -X POST http://127.0.0.1:3000/api/policy/preview \
    -H "Content-Type: application/json" -d '{}'
  cat /tmp/resp.txt | head -c 80
  echo
done
```

Esperado:
- Previews 1-2: `HTTP 200` o `422` (si el body es inválido).
- Preview 3: `HTTP 429`.

---

## 5. Prueba manual — desactivar el rate limiter

```bash
# En el contenedor, pasar rateLimit: false no es posible por env.
# Para desactivar, poner límites muy altos:
# .env
RATE_LIMIT_MAX=100000
RATE_LIMIT_WINDOW_MS=60000
```

Recrear y verificar que 100 requests seguidos a `/api/audit-trail` devuelven 200:

```bash
COMPOSE_ENV=dev bash ./scripts/compose.sh up -d --force-recreate app
bash ./scripts/compose.sh exec app sh -c 'until wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; do sleep 1; done; echo ready'

ok=0
for i in $(seq 1 100); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/audit-trail)
  [ "$code" = "200" ] && ok=$((ok+1))
done
echo "200 OK: $ok / 100"
# Esperado: 200 OK: 100 / 100
```

---

## 6. Prueba manual — throttling en la web

### 6.1 Throttle de navegación (sidebar)

1. Abrir http://127.0.0.1:5173
2. Hacer clics rápidos (más de 3 en menos de 1 segundo) en diferentes items del sidebar.
3. Verificar que la navegación se ignora si los clics son más rápidos de 300 ms entre sí (no se cambia de página).

### 6.2 Botones disabled durante peticiones

1. En `/integraciones`, pegar una URL y clic en "Guardar" → el botón cambia a "Guardando…" y se deshabilita hasta que termine.
2. En el sheet de detalle de una factura, clic en "Explicar con IA" → el botón se deshabilita y muestra "Generando explicación…" hasta que termina.
3. En `/reglas`, clic en "Aplicar" → los botones se deshabilitan durante la simulación/aplicación.
4. En la bandeja, al aprobar/rechazar, los botones se deshabilitan durante la resolución.

---

## 7. Verificar que el easter egg está presente

```bash
# Con límite bajo (RATE_LIMIT_MAX=2), hacer 3 requests
curl -s http://127.0.0.1:3000/api/audit-trail >/dev/null
curl -s http://127.0.0.1:3000/api/audit-trail >/dev/null
curl -s http://127.0.0.1:3000/api/audit-trail
```

Esperado: el tercer response contiene:

```json
{
  "error": "rate_limit_exceeded",
  "retry_after": 60,
  "data": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}
```

---

## 8. Limpieza (restaurar defaults)

```bash
# .env — restaurar valores por defecto
RATE_LIMIT_MAX=120
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_UPLOAD_MAX=10
RATE_LIMIT_UPLOAD_WINDOW_MS=60000
RATE_LIMIT_EXPLAIN_MAX=5
RATE_LIMIT_EXPLAIN_WINDOW_MS=60000
RATE_LIMIT_ADMIN_MAX=3
RATE_LIMIT_ADMIN_WINDOW_MS=60000
RATE_LIMIT_WEBHOOK_TEST_MAX=5
RATE_LIMIT_WEBHOOK_TEST_WINDOW_MS=60000
```

Recrear el contenedor:

```bash
COMPOSE_ENV=dev bash ./scripts/compose.sh up -d --force-recreate app
bash ./scripts/compose.sh exec app sh -c 'until wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; do sleep 1; done; echo ready'
```