# AGENTS.md — Faktur / Blinka PayAgent

Agente que revisa facturas y decide PAGAR / FRENAR / ESCALAR. El LLM solo extrae
datos; la decisión la toma un motor de reglas determinista.

El repo está en español (README, `docs/`, ADRs, nombres de tests); los **commits
van en inglés**.

## Entorno: todo pasa por `just`

- `just` es la única interfaz. No corras `npm`, `node` ni compose a mano en el
  host: no hace falta Node local, todo corre dentro del contenedor.
- Recetas: `up` (API `:3000`, web `:5173`), `dev`, `logs`, `down`, `shell`,
  `rebuild`, `install`, `build-prod`, `prod`, `prod-down`, `env-info`.
  `just --list` lista todas.
- `just check` = `typecheck` → `lint` → `test`. **Las tres usan
  `compose exec`**: el contenedor dev tiene que estar arriba (`just up`) o
  fallan con `service "app" is not running`.
- `just fmt` (Prettier: 100 columnas, comillas dobles, semicolons) es el único
  formateador. **ESLint no chequea estilo y `just check` no corre Prettier**:
  corré `just fmt` antes de dar por terminado algo.
- Si el host no tiene `just`: `bash ./scripts/compose.sh <args>` hace de puente
  (elige `podman compose`, `podman-compose` o `docker compose`). **En esta
  máquina `just` no está instalado y el motor disponible es Docker + Compose
  v2**, así que ese es el camino real: `up -d --build`, `logs -f app`, `down`,
  `exec -T app npm test`. Verificado: API en `:3000`, web en `:5173` y
  `GET 5173/api/health` proxeado por Vite a la API.
- **Nunca `docker compose up` pelado**: sin el overlay, el servicio `app` no
  declara `image` ni `build` y compose aborta con
  `service "app" has neither an image nor a build context specified`.
- Para confirmar que el dev quedó sano: `... compose.sh ps` debe mostrar
  `Up (healthy)`; el healthcheck es un `GET /api/health` cada 15s.

## Tests

- `npm test` del root = `npm run test -w api && npm run test -w web`.
  Los archivos están **hardcodeados en el script** de cada workspace: al crear
  un test nuevo hay que añadirlo al `test` correspondiente (`api/package.json`
  o `web/package.json`).
- Los tests de web usan `node:test` + `tsx` (mismo runner que la API, sin DOM):
  lógica en `web/src/lib/*.test.ts` y markup con `react-dom/server` en
  `*.test.tsx`. `web/tsconfig.json` incluye `"node"` en `types` para eso.
- Para correr un test puntual: `just shell`, luego
  `npx tsx --test src/<archivo>.test.ts` (desde `/app/web` o `/app/api`).
- `api/tsconfig.build.json` excluye `*.test.ts`, así que los tests no llegan a
  `dist`.

## Arquitectura

- npm workspaces (`api/`, `web/`) con un único `node_modules`. **No hay
  `tsconfig.json` en el root**: el typecheck y el build se lanzan por paquete
  desde los scripts del root.
- API: Fastify 5, ESM (`"type": "module"`) con `module: NodeNext` → los
  imports relativos llevan extensión `.js` aunque el archivo sea `.ts`.
  Entrada `api/src/server.ts` (env `PORT`, `WEB_DIST`).
- Web: React 19 + Vite, entrada `web/src/main.tsx`. En dev Vite hace proxy de
  `/api` a `127.0.0.1:3000`; en prod Fastify sirve `web/dist` con fallback SPA
  (`api/src/app.ts`): **toda ruta nueva de API debe empezar con `/api/`**, si no
  responde `index.html` con 200.
- `API_PORT`, `WEB_PORT`, `APP_PORT` (`.env`) solo cambian el mapeo de puertos
  en el host; dentro del contenedor los puertos son fijos (3000 / 5173).

## Gotchas de contenedores

- En dev el repo se monta en `/app` y `node_modules` es un volumen nombrado:
  al cambiar dependencias corré `just install` (o `just rebuild` si cambió la
  imagen). Editar `package.json` no reinstala solo.
- `scripts/compose.sh` combina `compose.yml` con el overlay según
  `COMPOSE_ENV=dev|prod` (`.env` se carga automáticamente).

## Docs

Orden de precedencia cuando dos documentos se contradigan:

1. `docs/backlog_implementacion_mvp.md` — **fuente de verdad de qué se
   construye.** 26 tareas, 20 specs, grafo de dependencias y las 6 decisiones
   de producto en su §7.
2. `docs/decisiones/0001-stack-ts-node-react.md` — stack **aceptado**
   (TS/Node + React, dos imágenes, `just` como interfaz).
3. `docs/propuesta_modelo_ER_faktur.md` y `diagramas/` — modelo de datos.
   `diagramas/ds01_ingesta_decision.mmd` manda en la tabla de precedencia.
4. `docs/PRD_Faktur.md` y `docs/planteamiento_mvp_reto_blinka.md` — registros
   de lo que se propuso el 17/10/2026. **No se editan**: cada uno lleva arriba
   una tabla con lo que se decidió después y en qué sección del backlog está.
5. `docs/faktur_master_technical_blueprint_execution_plan.md` — material de
   referencia del reto; varios excerpts están en Python/FastAPI y **no**
   corresponden a este repo: no los copies.

- `specs/` y `fixtures/` están vacíos. Son el destino de
  `policy.spec.json` (tarea T2) y de `fixtures/TC-*.json` +
  `ground_truth.json` (tarea T4). El set son **11 casos**, no 10.
- La extracción usa `gemini-3.8-flash`. El PRD dice `gemini-1.5-flash`, que
  está apagado: si tocás esa parte, no lo copies.

## Commits: Conventional Commits, mensajes en inglés

- Formato `<type>(<scope>): <description>`; subject en imperativo, minúscula,
  sin punto final y de 72 caracteres o menos. Body opcional en inglés, separado
  por una línea en blanco.
- Cambio incompatible: `!` antes de los dos puntos + footer `BREAKING CHANGE:`.
- Types: `feat`, `fix`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`,
  `chore`.
- Scopes habituales: `api`, `web`, `infra`, `docs`, `agents`, `diagramas`.
- Un commit = un cambio lógico.

```text
feat(api): add rule engine decision endpoint
docs(agents): require conventional commits in english
```

Incorrecto: `feat: cambios varios` · `Fix bug` · `docs: Actualicé el README.`
