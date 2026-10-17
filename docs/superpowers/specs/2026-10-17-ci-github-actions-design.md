# CI con GitHub Actions — Design

**Fecha:** 2026-10-17
**Estado:** aprobado, pendiente de plan e implementación
**Scope:** implementar un workflow básico de GitHub Actions que ejecute los tests y verifique el build al hacer PR a `main` (y en pushes a `main`).

## 1. Por qué

Hoy la única forma de saber si un cambio rompe algo es correr `just check` a mano en el contenedor de desarrollo. No hay CI: un PR puede mergearse con typecheck, lint o tests rotos, y un cambio en el `Dockerfile` o en `specs/` puede pasar en dev (donde el bind mount tapa los problemas) y reventar en prod. T1 y T2 cerraron precisamente ese hueco (`specs/` no llegaba a la imagen); falta automatizar la verificación para que no dependa de que alguien se acuerde de correrla.

## 2. Qué hace el workflow

Un único archivo `.github/workflows/ci.yml` con dos jobs:

### 2.1 `verify` (ubuntu-latest, Node 22)

Verifica el código TypeScript/React con las mismas tres puertas que `just check`:

1. `npm ci` (instala con el lockfile, falla si está desincronizado).
2. `npm run typecheck` (api + web).
3. `npm run lint` (eslint sobre todo el repo).
4. `npm test` (api; web no tiene tests).

Cache de npm vía `actions/setup-node` con `cache: 'npm'`, que usa `package-lock.json` como clave. Sin cache de capas Docker en esta versión.

Node 22 porque `engines.node >= 22` y el `Dockerfile` usa `node:22-alpine`; usar otra versión en CI que en prod es una fuente de falsos verdes.

### 2.2 `build-image` (ubuntu-latest, depende de `verify`)

Construye la imagen de producción y la somete a un smoke test, que es lo único que prueba de verdad el `COPY specs` y el entrypoint:

1. `docker build -f Dockerfile -t blinka-payagent:ci .`
2. Levantar el contenedor en background.
3. Esperar el healthcheck (`GET /api/health`).
4. `curl` y verificar `200`.
5. Parar y borrar el contenedor.

El job depende de `verify` para fail fast: si los tests fallan, no se gasta tiempo construyendo la imagen.

## 3. Triggers

- `pull_request` a `main`.
- `push` a `main`.

No se dispara en otras ramas ni en tags. `pull_request` (no `pull_request_target`) porque no se necesitan secretos y es el evento seguro para código de forks.

## 4. Lo que explícitamente NO hace (no-goals)

- **No publica la imagen.** Solo verifica que construye. Publicar a un registry es un paso posterior (y requiere credenciales) que no está en este scope.
- **No corre prettier.** El proyecto separa `just check` (typecheck → lint → test) de `just fmt` (Prettier). El workflow replica `just check`, no `just fmt`. Si se quiere gatear formato, es un paso aparte y una decisión de producto.
- **No corre en el contenedor de dev.** Los tests y el build corren directo en el runner con `npm`. El contenedor es para desarrollo local y para la imagen de prod; duplicarlo en CI solo añade complejidad.
- **No usa secretos.** `env.test.ts` valida env pero ningún test toca Gemini real (`GEMINI_API_KEY` vacía es el estado "apagado" documentado en `.env.example`).
- **No cachea capas Docker.** Se deja como mejora futura; para un workflow "básico" la complejidad del `cache-from`/`cache-to` no se justifica.

## 5. Archivos a crear

- `.github/workflows/ci.yml`

No se toca el `Dockerfile`, ni `package.json`, ni los scripts. El workflow consume lo que ya existe.

## 6. Riesgos y cómo se mitigan

- **`npm ci` falla si el lockfile está desincronizado.** Es el comportamiento deseado: fuerza a commitear el lockfile actualizado.
- **El build de la imagen necesita toolchain** (`python3 make g++` en la etapa `deps`). El `Dockerfile` ya lo tiene; el workflow no lo toca.
- **El smoke test depende de que el entrypoint haga `chown` y baje a `app`.** Ya verificado en T1; el smoke test lo re-verifica en cada PR.
- **Dos tests de `dataDir` solo corren como root.** `runAsNobody` hace `setuid(65534)`, que requiere root. En CI (runner no-root) se saltan con `test.skip`; en el contenedor de dev (root) corren completos. No es una pérdida de cobertura del código: `dataDir.ts` sigue typechecked y linted en CI.
- **El healthcheck tarda ~10s en pasar** (`start-period: 10s`). El smoke test debe esperar con reintentos, no con un `sleep` fijo.

## 7. Criterio de éxito

- Un PR a `main` dispara el workflow.
- Si typecheck, lint o tests fallan, `verify` falla y `build-image` no corre.
- Si la imagen no construye o no arranca (healthcheck), `build-image` falla.
- Un PR "limpio" deja ambos jobs en verde (61 tests pasan y 2 se saltan en CI; esos 2 verifican permisos de escritura y solo pueden ejercitarse como root, por lo que corren completos en el contenedor de desarrollo).
- No se necesitan secretos configurados en el repo para que el workflow funcione.

## 8. Fuera de scope (explícito)

- Publicar la imagen a un registry.
- Matrix de versiones de Node.
- Cobertura de código / reportes.
- Notificaciones a Slack (eso es T17).
- Cache de capas Docker.
EOF
echo "spec escrito"