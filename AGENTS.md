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

- `npm test` del root = `npm run test -w api` = `tsx --test src/app.test.ts`.
  Solo hay tests de API y el archivo está **hardcodeado en el script**: al crear
  un test nuevo hay que añadirlo a `test` en `api/package.json`.
- `web` no tiene tests. Para correr un test puntual, `just shell` y `npx tsx
  --test src/<archivo>.test.ts` dentro del contenedor.
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

- `docs/decisiones/0001-stack-ts-node-react.md` es el stack **aceptado**
  (TS/Node + React, dos imágenes, `just` como interfaz).
- `docs/faktur_master_technical_blueprint_execution_plan.md` y el resto de
  `docs/` son material de referencia del reto; varios excerpts están en
  Python/FastAPI y **no** corresponden a este repo: no los copies.
- `planteamiento_mvp_reto_blinka.md` está duplicado en la raíz y en `docs/`
  (idénticos): editá el de `docs/`.
- `specs/` y `fixtures/` están vacíos, pero son el destino previsto de
  `policy.spec.json` y `fixtures/TC-*.json` + `ground_truth.json`
  (ver `odd/tasks/faktur-mvp.md`).

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
