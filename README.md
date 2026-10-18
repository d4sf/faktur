# FLUSH — Copiloto de gobernanza financiera autónoma

[![CI](https://github.com/d4sf/flush/actions/workflows/ci.yml/badge.svg)](https://github.com/d4sf/flush/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
![Stack](https://img.shields.io/badge/stack-TypeScript%20%7C%20Fastify%20%7C%20React-informational)

Agente que revisa facturas y decide **PAGAR / FRENAR / ESCALAR**. El LLM solo
extrae datos; la decisión la toma un motor de reglas determinista con 8 reglas y
10 `reason_code` canónicos. Cero pagos fuera de política: si algo no se puede
verificar, no se paga (fail-closed, default ESCALAR, nunca PAGAR).

Servicio en producción: **https://blinka-payagent.onrender.com/**

---

## Requisitos

- **Podman** (o Docker) con **Compose v2**. No hace falta Node en el host: todo
  (dependencias, typecheck, lint, tests, build) corre dentro del contenedor.
- Opcional: `just` (si no está, usá `bash ./scripts/compose.sh <args>` como
  puente).

## Instalación y configuración

```bash
git clone git@github.com:d4sf/flush.git
cd flush

# 1. Variables de entorno (copiar y ajustar)
cp .env.example .env
# Editar .env: GEMINI_API_KEY, puertos, etc.

# 2. Levantar el entorno de desarrollo
COMPOSE_ENV=dev bash ./scripts/compose.sh up -d --build
# o, si tenés just: just up

# 3. Verificar que está sano
bash ./scripts/compose.sh ps            # app Up (healthy)
curl -s http://127.0.0.1:3000/api/health   # {"status":"ok"}
```

La UI queda en `http://127.0.0.1:5173` y la API en `http://127.0.0.1:3000`.
Vite proxea `/api` a la API en dev; en producción Fastify sirve el SPA del mismo
origen.

### Variables de entorno principales (`.env`)

| Variable | Default | Descripción |
|---|---|---|
| `GEMINI_API_KEY` | — | Clave de Gemini. Sin ella, `/extract` responde 503; el resto funciona. |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Modelo de extracción. |
| `DATA_DIR` | `/app/data` | Directorio de la base SQLite y uploads. |
| `PORT` | `3000` | Puerto interno de la API. |
| `LOG_LEVEL` | `info` | Nivel de log de Fastify. |
| `NOTIFIER_WEBHOOK_URL` | — | Webhook genérico (fallback si no hay Slack configurado). |
| `RATE_LIMIT_MAX` | `120` | Límite global por IP (req/min). |
| `RATE_LIMIT_UPLOAD_MAX` | `10` | Límite de uploads por IP. |
| `RATE_LIMIT_EXPLAIN_MAX` | `5` | Límite de explicaciones con IA por IP. |
| `ALLOW_DB_RESET` | `false` | Habilita el reset de base desde `/datos` (solo dev). |
| `ADMIN_TOKEN` | — | Token para `POST /api/admin/db/reset` en producción. |

### Producción (Docker)

```bash
COMPOSE_ENV=prod bash ./scripts/compose.sh up -d --build   # o: just prod
# API + UI en http://127.0.0.1:3000
```

La imagen es multi-stage (deps → build → runtime). El entrypoint (`scripts/entrypoint.sh`)
ajusta el owner de `data/` y baja de root a `app` con `su-exec`.

---

## Ejecución de pruebas y tests

```bash
# Todo (API + web)
bash ./scripts/compose.sh exec app sh -c 'cd /app && npm test'

# Solo API
bash ./scripts/compose.sh exec app sh -c 'cd /app/api && npm test'

# Solo web
bash ./scripts/compose.sh exec app sh -c 'cd /app/web && npm test'

# Typecheck + lint + tests (lo que corre CI)
bash ./scripts/compose.sh exec app sh -c 'cd /app/api && npx tsc --noEmit && npm run lint 2>/dev/null; npm test'
bash ./scripts/compose.sh exec app sh -c 'cd /app/web && npx tsc --noEmit && npm test'

# Smoke end-to-end (checklist de aceptación del MVP)
bash ./scripts/compose.sh exec app sh -c 'cd /app/api && npm run smoke'
```

Para correr un test puntual:

```bash
bash ./scripts/compose.sh exec app sh -c 'cd /app/api && npx tsx --test src/<archivo>.test.ts'
```

> El script `test` de cada workspace es una lista explícita: al crear un test nuevo
> hay que añadirlo a mano en `api/package.json` o `web/package.json`.

---

## Funcionalidad

### Flujo principal

```
Subir factura (PDF/imagen/JSON)
  → Extraer a JSON (Gemini, tipado)
    → Evaluar 8 reglas (código puro, fail-closed)
      → PAGAR (pasa todo)
      → FRENAR (inválido o no aprobable)
      → ESCALAR (válido pero dudoso) → bandeja humana → aprueba/niega
```

### Casos de uso y cómo probarlos

**1. Subir una factura y ver la decisión (sin tocar nada)**

- Local: `http://127.0.0.1:5173/subir` → arrastrá `fixtures/TC-01.json`.
- Web: `https://blinka-payagent.onrender.com/subir` → subí un JSON.
- Esperado: veredicto 🟢 PAGAR, motivo "Dentro de política: $420 < umbral $1.000".

**2. Mover el umbral y ver PAGAR → ESCALAR**

- Local/web: `/reglas` → bajar el slider de umbral de $1.000 a $300 → "Simular" → las facturas afectadas se muestran como ESCALAR en la simulación. "Aplicar" crea una versión nueva de la política.
- Las decisiones ya tomadas no se tocan (congeladas con su `policy_version`).

**3. Reenvío duplicado → FRENAR con motivo legible**

- Local: subir dos veces `fixtures/TC-01.json`.
- Web: subir el mismo archivo dos veces.
- Esperado: segunda subida → 🟡... no: 🔴 FRENAR, `ERR_DUPLICATE_INVOICE`, motivo "La factura INV-9022 de CloudServers Inc ya fue registrada el 12/10".

**4. Escalada aprobada y registrada**

- Local/web: `/bandeja` → elegir un ESCALAR → "Aprobar pago" (con comentario) → la factura pasa a APROBADA y se descuenta el presupuesto una sola vez. Doble clic devuelve 200 sin duplicar el pago.

**5. Factura con datos faltantes → nunca se paga**

- Subir `fixtures/TC-08.json` (Entidad Fantasma, sin `tax_id`).
- Esperado: 🔴 FRENAR, `ERR_INVALID_DATA`, "Falta el identificador fiscal del beneficiario". Nunca PAGAR.

**6. Descargar el CSV con motivo en cada fila**

- Local/web: botón "Exportar CSV" en `/` (tablero) o `/reporte`.
- Esperado: 11+ filas con `motivo_legible` en lenguaje natural y `policy_version`.

**7. Explicación con IA** (post-MVP)

- Local/web: abrir el sheet de detalle de una factura FRENAR o ESCALAR → botón "Explicar con IA".
- Esperado: texto en español, formal, con los números del caso y 1–3 pasos. No cambia el veredicto.
- Más detalle: `docs/testing-ai-explanation.md`.

**8. Integración con Slack** (post-MVP)

- Local/web: `/integraciones` → pegar la URL de un incoming webhook de Slack → "Guardar" → "Probar webhook".
- El webhook se dispara en ESCALAR, NEGADA y FRENAR (no en PAGAR).
- Más detalle: `docs/testing-slack-integration.md`.

### Los 12 casos de prueba (TC-01..TC-12)

| TC | Proveedor | Monto | Moneda | Dispara | Veredicto |
|:--|:--|---:|:--|:--:|:--|
| TC-01 | CloudServers Inc | $420 | USD | — | 🟢 PAGAR |
| TC-02 | DevStudio Latam | $850 | USD | — | 🟢 PAGAR |
| TC-03 | CloudServers Inc | $420 | USD | regla 2 | 🔴 FRENAR |
| TC-04 | Growth Agency | $3.500 | USD | regla 7 | 🟡 ESCALAR |
| TC-05 | Nuevo Redactor | $350 | USD | regla 4 | 🟡 ESCALAR |
| TC-06 | Legal Global | €5.000 | EUR | regla 6 | 🟡 ESCALAR |
| TC-07 | Freelance Design | $1.200 | USD | regla 5 | 🟡 ESCALAR |
| TC-08 | Entidad Fantasma | $900 | USD | regla 1 | 🔴 FRENAR |
| TC-09 | SaaS Tools Ltd | $120 | USD | — | 🟢 PAGAR |
| TC-10 | DevStudio Latam | $950 | USD | regla 6 | 🟡 ESCALAR |
| TC-11 | Venta Pos Duo | $200 | USD | regla 3 | 🔴 FRENAR |
| TC-12 | SaaS Tools Ltd | $120 | USD | regla 1 | 🟡 ESCALAR |

Se validan sin LLM ni red con `npm run test` (runner contra `ground_truth.json`).

---

## Arquitectura

- **npm workspaces** (`api/`, `web/`) con un único `node_modules`. No hay `tsconfig.json` en el root.
- **API**: Fastify 5, ESM (`"type": "module"`, `module: NodeNext` → imports relativos con `.js`). Entrada `api/src/server.ts` (env `PORT`, `WEB_DIST`).
- **Web**: React 19 + Vite. En dev Vite proxea `/api` a `127.0.0.1:3000`; en prod Fastify sirve `web/dist` con fallback SPA.
- **Regla de oro**: toda ruta nueva de API debe empezar con `/api/`, si no responde `index.html` con 200.

### Endpoints principales

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/invoices` | Subir factura (multipart) |
| `POST` | `/api/invoices/:id/decide` | Decidir (corre el motor) |
| `GET` | `/api/invoices` | Listado con filtros |
| `GET` | `/api/invoices/:id` | Detalle + línea de tiempo |
| `POST` | `/api/invoices/:id/explain` | Explicación con IA (post-MVP) |
| `GET` | `/api/approvals` | Bandeja HITL |
| `POST` | `/api/approvals/:id` | Resolver aprobación |
| `GET` | `/api/policy` / `PUT` | Leer / actualizar política (versionada) |
| `POST` | `/api/policy/preview` | Simular política hipotética |
| `GET` | `/api/audit-trail` | Métricas + registros |
| `GET` | `/api/report.csv` | Reporte CSV reproducible |
| `GET/PUT/DELETE` | `/api/integrations/slack` | Configurar webhook de Slack (post-MVP) |
| `POST` | `/api/integrations/slack/test` | Probar webhook (post-MVP) |
| `GET/POST` | `/api/admin/db` / `reset` | Administración del dataset (dev) |

---

## Documentación

El plan de trabajo y las decisiones de producto están en
[`docs/backlog_implementacion_mvp.md`](docs/backlog_implementacion_mvp.md):
26 tareas, 20 specs, grafo de dependencias y un apartado §7 con las decisiones
tomadas y por qué.

| Documento | Qué es |
|---|---|
| `docs/decisiones/0001-stack-ts-node-react.md` | Por qué TS/Node + React y no Python |
| `docs/decisiones/0003-ai-explanation.md` | Explicación con IA (post-MVP) |
| `docs/decisiones/0004-slack-integration.md` | Integración con Slack (post-MVP) |
| `docs/decisiones/0005-rate-limiting.md` | Rate limiting y throttling |
| `docs/propuesta_modelo_ER_faktur.md` | Modelo de datos: entidades, integridad, casos |
| `diagramas/` | ER, secuencia, estados y flujo de decisión |
| `docs/PRD_Faktur.md` | Requisitos del producto (propuesto el 17/10/2026) |
| `docs/planteamiento_mvp_reto_blinka.md` | El camino más corto a un agente funcionando |
| `docs/testing-ai-explanation.md` | Guía de pruebas de la explicación con IA |
| `docs/testing-slack-integration.md` | Guía de pruebas de la integración con Slack |
| `docs/testing-rate-limiting.md` | Guía de pruebas de rate limiting |

Los dos últimos del primer bloque son registros de lo que se propuso: llevan
arriba una tabla con lo que se decidió después y su texto original no se edita.

## Imágenes

- `Dockerfile.dev`: Node 22 + dependencias, hot reload; el código se monta
  como volumen y `node_modules` queda en un volumen nombrado.
- `Dockerfile`: multi-stage (deps → build → runtime), sirve la UI compilada
  desde la API. Arranca como root solo para lo que hace
  `scripts/entrypoint.sh` —ajustar el owner de `data/`— y baja a `app` con
  `su-exec` antes de ejecutar nada.

## Datos de la demo

`just prod` monta `./data` en el contenedor. El entrypoint le cambia el owner a
uid 100, así que **después del primer arranque el usuario del host pierde
escritura** sobre `data/`:

```bash
sudo chown -R "$(id -u):$(id -g)" data    # recuperar el control del directorio
```

Para resetear entre tomas:

```bash
COMPOSE_ENV=prod bash ./scripts/compose.sh exec app rm -rf /app/data/*
# o desde /datos en la UI, o POST /api/admin/db/reset
```

El reset con confirmación desde `/datos` (o `POST /api/admin/db/reset`) borra la
base y vacía `uploads/`. Perfiles, conteos y códigos de error en
[`docs/datos-demo.md`](docs/datos-demo.md).

## Licencia

Apache License 2.0 — ver [`LICENSE`](LICENSE).