# Despliegue en Render con Docker — Design

**Fecha:** 2026-10-17
**Estado:** aprobado, pendiente de plan e implementación
**Scope:** configurar el despliegue de Faktur en Render usando Docker, con disco persistente para SQLite, health check y variables de entorno, todo declarado en `render.yaml`.

## 1. Intent y por qué

El MVP necesita un entorno accesible (demo o piloto) sin depender de localhost. Render ofrece despliegue con Docker, disco persistente y health checks, que encajan con el `Dockerfile` multi-stage que ya tenemos y que CI ya verifica. La alternativa (build nativo de Node) duplicaría los pasos de build y no aprovecharía el entrypoint que arregla permisos de `data/`.

## 2. Goals

- Un servicio web en Render que sirve front + back desde un solo contenedor (igual que en prod local).
- Disco persistente montado en `/app/data` para que SQLite sobreviva redeploys.
- Health check en `/api/health` (Render reinicia el servicio si falla).
- Variables de entorno configuradas: `GEMINI_API_KEY`, `GEMINI_MODEL`, `LOG_LEVEL`, `NOTIFIER_WEBHOOK_URL`.
- Auto-deploy en push a `main` (Render construye automáticamente).
- Archivo `render.yaml` en la raíz del repo (Infrastructure as Code).
- Renombrar `Dockerfile` a `Dockerfile` (Render lo auto-detecta; también beneficia a CI y a cualquier desarrollador).

## 3. Non-goals (explícito)

- **No se publica la imagen a un registry.** Render construye desde el repo (Dockerfile). Publicar a Docker Hub/GHCR es un paso posterior.
- **No se separa front y back en servicios distintos.** Un solo contenedor sirve ambos (como en prod local).
- **No se configura un dominio custom.** Render asigna un subdominio (`*.onrender.com`). Dominio propio es opcional y se configura en el dashboard.
- **No se añade un plan de pago obligatorio.** El spec documenta las limitaciones del plan gratuito y las mitiga; el usuario decide si paga.
- **No se configura CI/CD adicional.** Render auto-deploya en push a `main`; el workflow de GitHub Actions (T-CI) ya cubre tests y build.

## 4. Constraints

- **Render asigna `PORT`.** La app lee `PORT` de env (T1). El Dockerfile hace `EXPOSE 3000` pero Render sobrescribe con `$PORT`. Fastify escucha en `PORT` (default 3000). OK.
- **Disco persistente solo en paid.** El plan gratuito no tiene discos. En free tier, `data/` se borra en cada redeploy. El seed se re-aplica al arrancar, así que la app funciona pero sin historial.
- **Service sleep en free tier.** Después de 15 min sin tráfico, el servicio se duerme. Primera request tarda ~30s.
- **Build context = raíz del repo.** Render construye con `docker build .`. El `.dockerignore` ya excluye `.git`, `node_modules`, `data`, `docs`, etc.
- **Health check path configurable.** Render usa su propio mecanismo (no el `HEALTHCHECK` del Dockerfile). Hay que configurar `healthCheckPath: /api/health`.
- **Un solo servicio = un solo punto de fallo.** Front y back en el mismo contenedor. Aceptable para MVP.

## 5. Decisiones tomadas en esta sesión

| Decisión | Elegido | Por qué |
|:---|:---|:---|
| Despliegue | Docker (Dockerfile existente) | Ya probado en CI; entrypoint arregla permisos; build unificado |
| `render.yaml` | Sí, IaC en la raíz del repo | Reproducible; Render lo lee automáticamente |
| Renombrar `Dockerfile` → `Dockerfile` | Sí | Render auto-detecta; estándar de la industria; beneficia a CI y desarrolladores |
| Disco persistente | Sí, en `/app/data` (paid plan) | SQLite necesita persistencia; documentar limitación del free tier |
| Health check | `/api/health` | Ya existe en Fastify (T1) |
| Auto-deploy | En push a `main` | Render construye automáticamente; CI ya verifica tests |
| Plan de pago | Documentar, no forzar | El usuario decide si paga; el spec documenta las limitaciones |

## 6. Estructura de archivos

| Archivo | Acción | Responsabilidad |
|:---|:---|:---|
| `Dockerfile` | Renombrar desde `Dockerfile` | Build de producción (deps → build → runtime) |
| `render.yaml` | Crear | Configuración de Render (servicio, disco, env vars, health check) |
| `compose.prod.yml` | Modificar | `dockerfile: Dockerfile` → `dockerfile: Dockerfile` |
| `.github/workflows/ci.yml` | Modificar | `docker build -f Dockerfile` → `docker build` (default busca Dockerfile) |
| `Dockerfile` | Eliminar | Renombrado a Dockerfile |
| `AGENTS.md` | Modificar | Actualizar referencias a `Dockerfile` |
| `README.md` | Modificar | Actualizar referencias a `Dockerfile` |
| `docs/backlog_implementacion_mvp.md` | Modificar | Actualizar referencias a `Dockerfile` |

## 7. `render.yaml`

```yaml
services:
  - type: web
    name: blinka-payagent
    runtime: docker
    dockerfilePath: ./Dockerfile
    dockerContext: .
    autoDeploy: false
    healthCheckPath: /api/health
    envVars:
      - key: NODE_ENV
        value: production
      - key: LOG_LEVEL
        value: info
      - key: GEMINI_API_KEY
        sync: false
      - key: GEMINI_MODEL
        value: gemini-3.8-flash
      - key: NOTIFIER_WEBHOOK_URL
        sync: false
    disk:
      name: faktur-data
      mountPath: /app/data
      sizeGB: 1
```

Notas:
- `autoDeploy: false`: Render no deploya automáticamente en push a `main`. El deploy se triggerea desde el workflow de CI (GitHub Actions) después de que `verify` y `build-image` pasen (Opción A). Esto garantiza que solo código verificado llega a producción.
- `sync: false` para `GEMINI_API_KEY` y `NOTIFIER_WEBHOOK_URL` significa que Render las pide al crear el servicio (no se commitean al repo).
- `disk` solo funciona en planes de pago (Starter+). En free tier, Render ignora esta sección.
- `healthCheckPath: /api/health` usa el endpoint de Fastify (T1).
- Render asigna `PORT` automáticamente; la app lo lee de env.

## 7.1 Trigger de deploy desde CI (Opción A)

El workflow de GitHub Actions (`.github/workflows/ci.yml`) necesita un job adicional `deploy` que:

1. Depende de `verify` y `build-image` (solo corre si ambos pasan).
2. Llama a la API de Render: `POST /v1/services/{RENDER_SERVICE_ID}/deploys`.
3. Usa `RENDER_API_KEY` (secret en GitHub) para autenticarse.

Secrets necesarios en GitHub:
- `RENDER_API_KEY`: API key de Render (se crea en Dashboard → Account Settings → API Keys).
- `RENDER_SERVICE_ID`: ID del servicio (visible en la URL del dashboard o en `render.yaml` después de crear).

El job se añade al workflow existente:

```yaml
deploy:
  name: Deploy to Render
  runs-on: ubuntu-latest
  needs: [verify, build-image]
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
  steps:
    - name: Trigger Render deploy
      run: |
        curl -s -X POST \
          -H "Authorization: Bearer ${{ secrets.RENDER_API_KEY }}" \
          -H "Content-Type: application/json" \
          "https://api.render.com/v1/services/${{ secrets.RENDER_SERVICE_ID }}/deploys"
```

## 8. Lo que queda al builder

- Decidir el tamaño del disco (1 GB es suficiente para SQLite en demo/piloto).
- Decidir si se quiere auto-deploy en `main` o manual (el `render.yaml` default es auto-deploy).
- Verificar que el entrypoint funciona en Render (el disco se monta en runtime, el entrypoint hace `chown` antes de bajar a `app`).
- Actualizar `AGENTS.md`, `README.md` y docs para reflejar el renombre de `Dockerfile` a `Dockerfile`.

## 9. Criterio de aceptación

- `render.yaml` existe en la raíz del repo y es válido (Render lo acepta sin errores).
- `Dockerfile` existe (renombrado desde `Dockerfile`).
- `compose.prod.yml` y `ci.yml` actualizados para usar `Dockerfile`.
- El build de Docker sigue pasando (local y en CI).
- La app arranca en Render y responde `200` en `/api/health`.
- El disco persistente se monta en `/app/data` (verificable creando una factura y redeployando).

## 10. Fuera de scope (explícito)

- Dominio custom (se configura en el dashboard de Render).
- Separación de front y back en servicios distintos.
- Publicación de la imagen a un registry.
- Configuración de alertas/monitoreo de Render.
- Plan de pago (el usuario decide si paga; el spec documenta las limitaciones).

## 11. Riesgos

- **Disco persistente solo en paid.** En free tier, los datos se borran en cada redeploy. Mitigación: documentar en el README; el seed se re-aplica al arrancar.
- **Service sleep en free tier.** Primera request tarda ~30s. Mitigación: ping externo o plan Starter.
- **El entrypoint necesita root.** Render ejecuta el contenedor como root por defecto (el Dockerfile no tiene `USER app`), así que el entrypoint puede hacer `chown`. Verificado en T1.
- **Build context.** Render construye con la raíz del repo. El `.dockerignore` excluye `docs/`, `diagramas/`, `*.md`, etc. Verificar que `specs/` no esté excluido (no lo está).
- **Renombrar `Dockerfile`.** Afecta `compose.prod.yml`, `ci.yml`, y ~7 documentos. Mitigación: find-and-replace global.

## 12. Lo que queda al builder

- `autoDeploy: false` en `render.yaml`. El deploy se triggerea desde CI (Opción A). El primer deploy es manual (desde el dashboard de Render).
- Decidir el tamaño del disco. Recomendación: 1 GB (suficiente para SQLite en demo/piloto).
- Actualizar `AGENTS.md`, `README.md` y docs para reflejar el renombre de `Dockerfile` a `Dockerfile`.