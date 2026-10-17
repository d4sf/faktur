# Guía de despliegue en Render

Esta guía explica paso a paso cómo desplegar Faktur en Render usando Docker, con disco persistente para SQLite, health check y variables de entorno. Está escrita para alguien que nunca ha usado Render.

## Prerrequisitos

- Una cuenta en [Render](https://render.com) (puedes usar GitHub para registrarte).
- El repositorio `d4sf/faktur` en GitHub (ya existe).
- Los secrets de GitHub configurados (se explica en el paso 5).
- Opcional: una API key de Gemini (`GEMINI_API_KEY`) si quieres probar la extracción con LLM. Sin ella, el motor de reglas, el CSV y la bandeja funcionan igual.

## Lo que Render va a hacer

Render va a leer el archivo `render.yaml` de la raíz del repo y crear automáticamente:

- Un servicio web Docker (`blinka-payagent`).
- Un disco persistente de 1 GB montado en `/app/data` (solo en planes de pago).
- Variables de entorno preconfiguradas.
- Health check en `/api/health`.

El `Dockerfile` construye la imagen (deps → build → runtime) y el `entrypoint.sh` arregla permisos del disco antes de bajar a usuario no-root.

## Paso 1 — Crear el servicio en Render

1. Entra a [dashboard.render.com](https://dashboard.render.com).
2. Haz clic en **"New +"** → **"Blueprint"** (o "New Blueprint Instance").
3. Conecta tu cuenta de GitHub si no lo has hecho.
4. Selecciona el repositorio `d4sf/faktur`.
5. Render detecta automáticamente el `render.yaml` en la raíz.
6. Revisa la configuración que Render muestra:
   - **Service name:** `blinka-payagent`
   - **Runtime:** Docker
   - **Dockerfile path:** `./Dockerfile`
   - **Health check path:** `/api/health`
   - **Disk:** `faktur-data`, 1 GB, montado en `/app/data`
7. Render te pedirá los valores de `GEMINI_API_KEY`, `NOTIFIER_WEBHOOK_URL` y `ADMIN_TOKEN` (marcados como `sync: false`). Déjalos vacíos si no los tienes, **excepto `ADMIN_TOKEN`**: si quieres poder reiniciar la base de datos desde la UI (perfil "demo"), pon un valor simple (ej. `demo123`). Sin él, el reset fallará con `db_reset_token_missing`.
8. Haz clic en **"Apply"** (o "Create Blueprint").

Render empezará a construir la imagen Docker. Esto tarda ~3-5 minutos. Puedes ver el progreso en la pestaña **"Logs"** del servicio.

## Paso 2 — Verificar que el servicio arrancó

1. Cuando el build termine, Render te dará una URL del tipo `https://blinka-payagent.onrender.com`.
2. Abre esa URL en el browser. Deberías ver el scaffold del frontend (sidebar con 8 rutas, Bento Grid, toggle de tema).
3. Verifica el health check: `https://blinka-payagent.onrender.com/api/health` → `{"status":"ok"}`.
4. Si el servicio no arranca, revisa los logs en el dashboard de Render. Los errores más comunes:
   - **"file not found: /app/scripts/entrypoint.sh"** → el `COPY` del entrypoint falló en el build. Verifica que `scripts/entrypoint.sh` esté en el repo.
   - **"EACCES: permission denied"** → el entrypoint no hizo `chown`. Verifica que el `Dockerfile` no tenga `USER app` (no lo tiene).
   - **"Cannot find module '/app/api/dist/server.js'"** → el build de TypeScript falló. Revisa el log de build.

## Paso 3 — Configurar los secrets de GitHub (para deploy automático desde CI)

Para que el workflow de GitHub Actions triggeree deploys en Render después de que CI pase:

1. En Render, ve a **Account Settings** → **API Keys** → **Create API Key**. Copia la key (solo se muestra una vez).
2. En el dashboard de Render, abre tu servicio `blinka-payagent` y copia el **Service ID** de la URL (algo como `srv-xxxxxxxxxxxxxxxx`).
3. En GitHub, ve a tu repositorio → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
4. Crea dos secrets:
   - `RENDER_API_KEY` = la API key de Render (paso 1).
   - `RENDER_SERVICE_ID` = el ID del servicio (paso 2).

A partir de ahora, cada push a `main` que pase CI (typecheck + lint + tests + build de imagen) triggerea automáticamente un deploy en Render.

## Paso 4 — El primer deploy manual

El primer deploy no puede triggerearse desde CI (el servicio aún no existe). Render lo hace automáticamente cuando creas el servicio desde el blueprint. Verifica que:

1. El servicio está en estado **"Live"** (verde) en el dashboard.
2. La URL responde con el frontend.
3. `/api/health` devuelve `{"status":"ok"}`.

Si el servicio se queda en "Build failed" o "Deploy failed", revisa los logs. Los errores más comunes son los del paso 2.

## Paso 5 — Verificar persistencia (solo en plan de pago)

Si tienes un plan de pago (Starter o superior) con disco persistente:

1. Abre la app en Render.
2. Crea una factura (cuando T8-T10 estén implementados) o verifica que la base de datos existe.
3. Haz un redeploy manual (Dashboard → "Manual Deploy" → "Deploy latest commit").
4. Verifica que los datos persisten después del redeploy.

En el plan gratuito, el disco no se monta y `data/` se borra en cada redeploy. El seed se re-aplica al arrancar, así que la app funciona pero sin historial.

## Paso 6 — Flujo continuo (después del primer deploy)

A partir del primer deploy exitoso, el flujo es:

1. Haces un PR a `main`.
2. GitHub Actions ejecuta `verify` (typecheck + lint + tests) y `build-image` (construye la imagen Docker + smoke test).
3. Si ambos pasan, el job `deploy` triggerea un deploy en Render via API.
4. Render reconstruye la imagen y deploya. El servicio se reinicia con los nuevos datos.
5. Si CI falla, no se triggerea el deploy. Render sigue sirviendo la versión anterior.

## Limitaciones del plan gratuito

| Limitación | Impacto | Mitigación |
|:---|:---|:---|
| **Sin disco persistente** | `data/` (SQLite) se borra en cada redeploy. Audit trail y HITL se pierden. | Pagar plan Starter ($7/mes) con disco de 1 GB. O aceptar datos efímeros para demo. |
| **Service sleep** | Después de 15 min sin tráfico, el servicio se duerme. Primera request tarda ~30s. | Ping externo (cron job cada 10 min) o plan Starter (no se duerme). |
| **750 horas/mes** | Si el servicio está siempre despierto, consume las 750 horas en ~31 días. | Con sleep, consume menos. Para demo, suficiente. |
| **Build time** | Build de Docker tarda ~3-5 min. No cuenta contra las 750 horas. | Ninguna (está dentro del límite de 15 min). |
| **Sin dominio custom** | La URL es `*.onrender.com`. | Configurar dominio custom en el dashboard (gratis, pero requiere DNS). |

## Troubleshooting

### El servicio no arranca ("Deploy failed")

1. Revisa los logs en el dashboard de Render (pestaña "Logs").
2. Errores comunes:
   - **"file not found: /app/scripts/entrypoint.sh"** → El `COPY` del entrypoint falló. Verifica que `scripts/entrypoint.sh` esté en el repo y no esté en `.dockerignore`.
   - **"EACCES: permission denied, open '/app/data/faktur.db'"** → El entrypoint no hizo `chown`. Verifica que el `Dockerfile` no tenga `USER app` (no lo tiene).
   - **"Cannot find module '/app/api/dist/server.js'"** → El build de TypeScript falló. Revisa el log de build.
   - **"no such table: vendors"** → El schema no se aplicó. Verifica que `loadDb` se llame en `server.ts` y que `specs/` llegue a la imagen.

### Error `internal_error` al reiniciar la base de datos

El panel de administración (`/datos`) llama a `POST /api/admin/db/reset`. Si el servidor devuelve `{"error": "internal_error"}`, el error real está en los logs de Render. Las causas más comunes:

1. **`ADMIN_TOKEN` no configurado.** En producción (`NODE_ENV=production`), el reset requiere un token. Si `ALLOW_DB_RESET=true` pero `ADMIN_TOKEN` está vacío, el servidor responde `db_reset_token_missing`. Si ambos están configurados pero el token no coincide, responde `admin_token_invalid`.
   - **Solución:** Configurar `ADMIN_TOKEN` en el dashboard de Render (Environment → Edit). Usar un valor simple como `demo123` para la demo.

2. **`fixtures/` no está en la imagen.** El perfil "demo" lee `fixtures/ground_truth.json` y `fixtures/TC-*.json`. Si el `Dockerfile` no copia `fixtures/` al stage runtime, el reset falla con `ENOENT: no such file or directory, open '/app/fixtures/ground_truth.json'`.
   - **Solución:** Verificar que el `Dockerfile` incluya `COPY --from=build --chown=app:app /app/fixtures ./fixtures` en el stage runtime. (Ya incluido en el commit más reciente.)

3. **El disco no tiene permisos de escritura.** El entrypoint hace `chown app:app /app/data` al arrancar. Si el disco se montó después del primer arranque, puede haber un problema.
   - **Solución:** Redeployar el servicio (Manual Deploy → Deploy latest commit) para que el entrypoint vuelva a ejecutar el `chown`.

4. **La base tiene datos de una versión anterior.** Si la base ya tiene políticas v2, v3, etc. (de pruebas anteriores), el seed base puede fallar al verificar conteos.
   - **Solución:** Borrar el disco en Render (Dashboard → Disks → Delete) y redeployar. El seed se re-aplica automáticamente.

### El health check falla

1. Verifica que `healthCheckPath: /api/health` esté en `render.yaml`.
2. Abre `https://tu-servicio.onrender.com/api/health` manualmente.
3. Si devuelve 200, el health check debería pasar. Si no, revisa los logs.

### El deploy no se triggerea desde CI

1. Verifica que `RENDER_API_KEY` y `RENDER_SERVICE_ID` estén configurados en GitHub (Settings → Secrets).
2. Verifica que el job `deploy` tenga `if: github.ref == 'refs/heads/main' && github.event_name == 'push'`.
3. El job `deploy` solo corre en push a `main`, no en PRs. Para probarlo, haz un push directo a `main` o mergea un PR.

### Los datos se borran en cada redeploy (free tier)

Esto es esperado en el plan gratuito. Opciones:
1. Pagar plan Starter ($7/mes) con disco de 1 GB.
2. Aceptar datos efímeros para la demo (el seed se re-aplica al arrancar).
3. Usar un volumen externo (no soportado por Render free tier).

## Archivos relevantes

| Archivo | Qué hace |
|:---|:---|
| `Dockerfile` | Build multi-stage (deps → build → runtime). Sirve api + web. |
| `render.yaml` | Blueprint de Render (servicio, disco, env vars, health check). |
| `scripts/entrypoint.sh` | Arregla permisos de `data/` y baja a usuario `app`. |
| `.github/workflows/ci.yml` | CI: typecheck + lint + tests + build + deploy a Render. |
| `compose.prod.yml` | Config de Docker Compose para prod local (no usado por Render). |
| `api/src/config/env.ts` | Lee `PORT` de env (Render lo inyecta). |
| `api/src/db/index.ts` | `loadDb(path)` crea la base en `data/faktur.db`. |

## Referencias

- [Render Docker docs](https://render.com/docs/docker)
- [Render Blueprints (render.yaml)](https://render.com/docs/infrastructure-as-code)
- [Render Persistent Disks](https://render.com/docs/disks)
- [Render Health Checks](https://render.com/docs/health-checks)
- [Render Environment Variables](https://render.com/docs/environment-variables)