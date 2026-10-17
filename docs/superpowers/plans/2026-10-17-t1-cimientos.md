# T1 · Cimientos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar el terreno listo para T2 y T3: dependencias instaladas, configuración leída por un módulo tipado y validado, y un directorio de datos que sobrevive a `just prod` sin pasos manuales.

**Architecture:** Un módulo `config/env.ts` es el único lugar que lee `process.env`; valida con Zod y falla al arrancar nombrando todas las variables malas en un solo mensaje. La imagen de producción arranca como root para que un entrypoint arregle los permisos de `DATA_DIR` y baje a `app` con `su-exec`. La base SQLite no se abre en T1.

**Tech Stack:** TypeScript 5.9, Node 22.23.3, Fastify 5.6, Zod 4.6, `better-sqlite3` 13.0.3, Alpine musl x64, `node:test` vía tsx.

**Spec:** `docs/superpowers/specs/2026-10-16-t1-cimientos-design.md` — el plan implementa ese spec; los dos viajan juntos.

## Global Constraints

- Todo corre dentro del contenedor. En el host `just` **no está instalado**: usá `bash ./scripts/compose.sh <args>` (el atajo de compose). Ninguna receta del `justfile` se puede correr directo.
- `node_modules` en dev es un volumen nombrado: editar `package.json` no reinstala. Después de tocar el `package.json` corré `bash ./scripts/compose.sh exec app npm install` para regenerar `package-lock.json`, o el `npm ci` de los Containerfiles falla.
- Imports relativos llevan extensión `.js` aunque el archivo sea `.ts` (`module: NodeNext`, `"type": "module"`).
- `api/package.json` tiene el script `test` **hardcodeado**: `tsx --test src/app.test.ts`. Todo `.test.ts` nuevo se agrega a mano ahí.
- Versiones fijadas: `zod@^4.6.7`, `@google/genai@^2.30.0`, `@fastify/multipart@^10.1.4`, `better-sqlite3@^13.0.3` en `dependencies`; `@types/better-sqlite3@^9.6.0` en `devDependencies`.
- Convenciones de base de datos que T3 va a necesitar: los tipos de `better-sqlite3` son de la 9.x, así que el genérico va en `prepare`, no en `get`. Ver spec §5.2.
- El único formateador es Prettier (100 columnas, comillas dobles, semicolons, `proseWrap: preserve`). `just check` **no** corre Prettier.
- Commits: Conventional Commits, **mensajes en inglés**, un commit = un cambio lógico.
- Rutas de API bajo `/api/`: cualquier ruta nueva que no empiece así devuelve `index.html` con 200 por el fallback SPA de Fastify.

## Review Focus

Cinco formas de falla que el spec implica pero que un test del camino feliz no toca. Cada una tiene su prueba en la tarea dueña del código.

1. **`GEMINI_API_KEY=` en blanco** (la forma normal de desactivar una variable en `.env`) se trata como presente. `requireGeminiKey` devolvería `""` y T10 fallaría con un 400 opaco de Google. Tiene que normalizarse a `undefined`. → Tarea 1, Step 4.
2. **`NOTIFIER_WEBHOOK_URL=` en blanco mata el arranque.** Misma causa raíz, peor síntoma: el proceso no levanta por una variable que el usuario cree desactivada. → Tarea 1, Step 4.
3. **Dos variables malas a la vez y solo se reporta la primera.** El anti-objetivo §4 del spec es explícito: quien lo arregla tiene que hacerlo en un intento. → Tarea 1, Step 4.
4. **`DATA_DIR` sin permiso de escritura falla tres requests más tarde.** La app levanta, `/api/health` dice `ok`, y el `EACCES` aparece en el primer INSERT de T3. Tiene que morir en el arranque nombrando el directorio y el uid. En dev corre como root y el permiso nunca falla, así que la prueba tiene que hacerse con la imagen de producción. → Tarea 2, Step 10.
5. **`data/` sin excluir de la imagen.** `.dockerignore` hoy no lo lista y los compose hacen `COPY . .`. La imagen de dev arranca con la base vieja del host y el stage `build` hornea esa base en una capa. (La imagen final no la lleva: el runtime copia rutas específicas.) → Tarea 2, Step 2.

---

## Estructura de archivos

| Archivo | Acción | Responsabilidad única |
|:---|:---|:---|
| `api/src/config/env.ts` | Crear | Leer y validar el entorno. Único punto que toca `process.env`. |
| `api/src/config/env.test.ts` | Crear | Pruebas de defaults, validación y fallo rápido. |
| `api/src/app.ts` | Modificar | Recibir `webDist` y `logLevel` por parámetro en vez de leer el entorno. |
| `api/src/server.ts` | Modificar | Orquestar: cargar env, crear directorios, levantar. |
| `api/package.json` | Modificar | 5 dependencias + el script `test`. |
| `package-lock.json` | Modificar | Regenerado por npm, nunca a mano. |
| `compose.yml` | Modificar | Declarar las variables para que lleguen al contenedor. |
| `compose.prod.yml` | Modificar | Bind mount de `./data`. |
| `Containerfile` | Modificar | uid/gid fijos, `su-exec`, entrypoint, sin `USER app`. |
| `scripts/entrypoint.sh` | Crear | Arreglar permisos de `DATA_DIR` y bajar a `app`. |
| `.gitignore` | Modificar | Cubrir el contenido de `data/`, no el directorio. |
| `.dockerignore` | Modificar | Excluir `data/` de las imágenes. |
| `.env.example` | Modificar | Declarar las variables nuevas. |
| `data/.gitkeep` | Crear | Que el directorio sobreviva al clone vacío. |
| `docs/backlog_implementacion_mvp.md` | Modificar | Síntesis de T1 al día con lo que se construyó. |
| `docs/PRD_Faktur.md` | Modificar | Fila del CORS en la tabla de §0. |

`api/src/{domain,db,llm,routes}/` **no** se crean: git no trackea directorios vacíos y cada uno aparece en la tarea que lo llena (spec §7.2).

---

### Task 1: Dependencias y módulo de entorno

**Files:**
- Create: `api/src/config/env.ts`
- Create: `api/src/config/env.test.ts`
- Modify: `api/package.json` (deps + script `test`)
- Modify: `package-lock.json` (regenerado)
- Modify: `api/src/app.ts:7`
- Modify: `api/src/server.ts:1-11`
- Modify: `compose.yml:2-6`
- Modify: `.env.example`

**Interfaces:**
- Consumes: nada. Es la primera tarea.
- Produces:
  ```ts
  // api/src/config/env.ts
  export interface Env {
    NODE_ENV: "development" | "production" | "test";
    PORT: number;
    LOG_LEVEL: string;
    WEB_DIST: string;
    DATA_DIR: string;
    GEMINI_MODEL: string;
    GEMINI_API_KEY: string | undefined;
    NOTIFIER_WEBHOOK_URL: string | undefined;
  }
  export function loadEnv(source?: NodeJS.ProcessEnv): Env;
  export function requireGeminiKey(env: Env): string;

  // api/src/app.ts
  export async function buildApp(
    options?: { webDist?: string; logLevel?: string },
  ): Promise<FastifyInstance>;
  ```
  `options` entero opcional: el `app.test.ts` existente llama `buildApp()` sin argumentos y debe seguir compilando.

- [ ] **Step 1: Agregar las dependencias y el archivo de test al script**

En `api/package.json`: las 4 de `dependencies`, `@types/better-sqlite3` en `devDependencies`, y el script `test` pasa a `tsx --test src/app.test.ts src/config/env.test.ts`.

No agregues `@fastify/cors` (spec §5.4).

- [ ] **Step 2: Regenerar el lockfile**

```bash
bash ./scripts/compose.sh exec app npm install
```

Expected: agrega `package-lock.json` con las 5. Si lo salteás, el `npm ci` de los Containerfiles falla después.

- [ ] **Step 3: Escribir el test que falla**

`api/src/config/env.test.ts`, con el estilo de `app.test.ts` (`import assert from "node:assert/strict"`, `import test from "node:test"`, imports con `.js`):

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { loadEnv, requireGeminiKey } from "./env.js";

test("sin variables devuelve los defaults", () => {
  const env = loadEnv({});
  assert.equal(env.PORT, 3000);
  assert.equal(env.LOG_LEVEL, "info");
  assert.equal(env.GEMINI_MODEL, "gemini-3.8-flash");
  assert.equal(env.NODE_ENV, "development");
  assert.ok(env.DATA_DIR.endsWith("/data"));
  assert.ok(env.WEB_DIST.endsWith("web/dist"));
});

test("sin GEMINI_API_KEY no lanza", () => {
  const env = loadEnv({});
  assert.equal(env.GEMINI_API_KEY, undefined);
});

test("PORT se convierte a número", () => {
  assert.equal(loadEnv({ PORT: "8080" }).PORT, 8080);
});

test("PORT no numérico lanza y lo nombra", () => {
  assert.throws(() => loadEnv({ PORT: "abc" }), /PORT/);
});

test("NODE_ENV fuera del enum lanza", () => {
  assert.throws(() => loadEnv({ NODE_ENV: "produccion" }), /NODE_ENV/);
});

test("reporta todas las variables malas en un solo error", () => {
  assert.throws(
    () => loadEnv({ PORT: "abc", NOTIFIER_WEBHOOK_URL: "no-es-una-url" }),
    (error: Error) => {
      assert.match(error.message, /PORT/);
      assert.match(error.message, /NOTIFIER_WEBHOOK_URL/);
      return true;
    },
  );
});

test("cadena vacía se normaliza a undefined", () => {
  const env = loadEnv({ GEMINI_API_KEY: "", NOTIFIER_WEBHOOK_URL: "   " });
  assert.equal(env.GEMINI_API_KEY, undefined);
  assert.equal(env.NOTIFIER_WEBHOOK_URL, undefined);
});

test("NOTIFIER_WEBHOOK_URL válida no lanza", () => {
  const env = loadEnv({ NOTIFIER_WEBHOOK_URL: "https://hooks.example/x" });
  assert.equal(env.NOTIFIER_WEBHOOK_URL, "https://hooks.example/x");
});

test("requireGeminiKey lanza nombrando la variable", () => {
  assert.throws(() => requireGeminiKey(loadEnv({})), /GEMINI_API_KEY/);
});

test("requireGeminiKey devuelve la llave cuando está", () => {
  assert.equal(requireGeminiKey(loadEnv({ GEMINI_API_KEY: "k" })), "k");
});
```

- [ ] **Step 4: Correr el test y ver que falla**

```bash
bash ./scripts/compose.sh exec -T app npx tsx --test src/config/env.test.ts
```

Expected: FAIL con `Cannot find module './env.js'`.

- [ ] **Step 5: Implementar `config/env.ts`**

Esquema de Zod, con estos defaults exactos:

```ts
const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.string().min(1).default("info"),
  WEB_DIST: z.string().min(1).default(resolve(process.cwd(), "web/dist")),
  DATA_DIR: z.string().min(1).default(resolve(process.cwd(), "data")),
  GEMINI_MODEL: z.string().min(1).default("gemini-3.8-flash"),
  GEMINI_API_KEY: z.string().min(1).optional(),
  NOTIFIER_WEBHOOK_URL: z.string().url().optional(),
});
```

Dos detalles que hacen que los tests de arriba pasen:

- **Normalizar antes de validar.** Una cadena vacía o solo espacios tiene que volverse `undefined` en `GEMINI_API_KEY` y `NOTIFIER_WEBHOOK_URL` **antes** del `parse`. Si no, `z.string().min(1)` rechaza la llave vacía y `z.string().url()` revienta el arranque por una variable que el usuario cree apagada. Es la diferencia entre el test 6 y los review-focus 1 y 2.
- **Un solo error con todos los problemas.** `safeParse` devuelve todos los `issues` de una pasada (verificado: dos variables malas vienen juntas). Formatealos así, sin elegir el primero:

```
Configuración de entorno inválida:
  PORT: <message del issue>
  NOTIFIER_WEBHOOK_URL: <message del issue>
```

`loadEnv(source = process.env)` devuelve el `Env` parseado o lanza `Error` con ese texto. `requireGeminiKey(env)` devuelve `env.GEMINI_API_KEY` o lanza un `Error` que nombra `GEMINI_API_KEY` y aclara que el motor de reglas, el CSV y la bandeja funcionan sin ella.

- [ ] **Step 6: Correr el test y ver que pasa**

```bash
bash ./scripts/compose.sh exec -T app npx tsx --test src/config/env.test.ts
```

Expected: PASS, 10 tests, 0 fail.

- [ ] **Step 7: Cablear `app.ts` y `server.ts`**

`buildApp` pasa a `buildApp(options: { webDist?: string; logLevel?: string } = {})`. El `Fastify({ logger: true })` fijo se reemplaza por `Fastify({ logger: { level: options.logLevel ?? "info" } })`: pino no lee `LOG_LEVEL` solo. `webDist` resuelve a `options.webDist ?? resolve(process.cwd(), "web/dist")`, **sin** tocar `process.env`: `config/env.ts` es el único módulo que lo lee, y `server.ts` le pasa `env.WEB_DIST`. El default replica el de env.ts para que `buildApp()` siga siendo invocable sin argumentos desde `app.test.ts`. Conservá el `existsSync` y el `setNotFoundHandler` actuales tal cual.

`server.ts`: `const env = loadEnv()` y usá `env.PORT` en el `listen`, pasando además `webDist: env.WEB_DIST` y `logLevel: env.LOG_LEVEL` a `buildApp`. Todavía **no** agregues los `mkdir`; son de la Tarea 2.

- [ ] **Step 8: Declarar las variables en compose y `.env.example`**

`compose.yml` suma al `environment:` existente:

```yaml
GEMINI_API_KEY: ${GEMINI_API_KEY:-}
GEMINI_MODEL: ${GEMINI_MODEL:-gemini-3.8-flash}
NOTIFIER_WEBHOOK_URL: ${NOTIFIER_WEBHOOK_URL:-}
DATA_DIR: /app/data
```

Sin esto la variable nunca llega al contenedor, aunque esté en `.env`: compose no interpola nada que no esté declarado bajo `environment:`.

`.env.example` suma `GEMINI_API_KEY=`, `GEMINI_MODEL=gemini-3.8-flash` y `NOTIFIER_WEBHOOK_URL=`. Los defaults `${VAR:-}` producen cadena vacía, que Step 5 normaliza.

- [ ] **Step 9: Verificar la suite completa**

```bash
bash ./scripts/compose.sh exec -T app npm run typecheck
bash ./scripts/compose.sh exec -T app npm run lint
bash ./scripts/compose.sh exec -T app npm test
```

Expected: los tres limpios. `npm test` tiene que correr **11** tests (1 de `app.test.ts` + 10 de `env.test.ts`). Si corre 1, el Step 1 quedó a medias.

- [ ] **Step 10: Commit**

```bash
git add api/package.json package-lock.json api/src/config api/src/app.ts api/src/server.ts compose.yml .env.example
git commit -m "feat(api): add validated env module and domain dependencies"
```

---

### Task 2: Persistencia de datos

**Files:**
- Create: `scripts/entrypoint.sh`
- Create: `data/.gitkeep` (vacío)
- Modify: `Containerfile:15-34` (stage runtime)
- Modify: `compose.prod.yml`
- Modify: `.gitignore`
- Modify: `.dockerignore`
- Modify: `api/src/server.ts` (los `mkdir`)

**Interfaces:**
- Consumes: `loadEnv()` y `Env.DATA_DIR` de la Tarea 1.
- Produces: `/app/data` y `/app/data/uploads` escribibles por el usuario `app`, en dev y en producción, sin pasos manuales.

- [ ] **Step 1: Crear `data/.gitkeep` vacío y cubrir el contenido en `.gitignore`**

Agregá a `.gitignore`:

```
data/*
!data/.gitkeep
```

Con `data/.gitkeep` trackeado el directorio sobrevive al clone; `data/*` evita que la base y los uploads se commiteen.

- [ ] **Step 2: Excluir `data/` de la imagen**

Agregá `data` a `.dockerignore`, y verificá la **capa de la imagen**, no el contenedor: `compose run` monta `.:/app` y ahí `/app/data` existe igual por el bind mount, así que hay que mirar la imagen sin volumenes.

```bash
bash ./scripts/compose.sh build
docker run --rm --entrypoint ls blinka-payagent:dev -a /app
```

Expected: la lista **no** incluye `data`. Si aparece, `.dockerignore` no corta y la base del host viaja en la capa.

- [ ] **Step 3: Agregar el bind mount en `compose.prod.yml`**

```yaml
    volumes:
      - ./data:/app/data
```

En dev no hace falta nada: `compose.dev.yml` ya monta `.:/app`, así que `data/` del host ya es `/app/data` del contenedor.

- [ ] **Step 4: Escribir `scripts/entrypoint.sh`**

```sh
#!/bin/sh
set -e

: "${DATA_DIR:=/app/data}"
mkdir -p "$DATA_DIR" "$DATA_DIR/uploads"

# Sin -R a propósito: los archivos que crea la app ya nacen de app porque
# desde este punto corre como app. Con -R cambiaríamos el dueño también en
# el host y el usuario perdería escritura sobre sus propios archivos.
chown app:app "$DATA_DIR" "$DATA_DIR/uploads"

exec su-exec app "$@"
```

- [ ] **Step 5: Modificar el stage runtime del `Containerfile`**

El `-g 101` no es cosmético: el grupo `users` ya ocupa el gid 100 en la imagen base.

```dockerfile
RUN addgroup -S -g 101 app && adduser -S -u 100 -G app app
RUN apk add --no-cache su-exec

COPY --from=build --chown=app:app /app/package.json ./package.json
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/api/package.json ./api/package.json
COPY --from=build --chown=app:app /app/api/dist ./api/dist
COPY --from=build --chown=app:app /app/web/dist ./web/dist
COPY --chmod=755 scripts/entrypoint.sh /app/scripts/entrypoint.sh

ENTRYPOINT ["/app/scripts/entrypoint.sh"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "api/dist/server.js"]
```

Dos cambios que no son opcionales: **`USER app` desaparece** (ese `USER` fijo es lo que le impediría al entrypoint hacer el `chown`) y el `CMD` se mantiene porque el `ENTRYPOINT` lo recibe como argumentos. Si el builder no soporta `--chmod=755`, usá `RUN chmod +x /app/scripts/entrypoint.sh` después del `COPY`.

- [ ] **Step 6: Hacer que `server.ts` cree los directorios y falle ruidosamente**

Después de `loadEnv()` y antes de `listen()`: `mkdirSync(env.DATA_DIR, { recursive: true })` y `mkdirSync(join(env.DATA_DIR, "uploads"), { recursive: true })`. Si eso lanza `EACCES` o `EROFS`, el proceso muere con un mensaje que nombre `env.DATA_DIR` y el `process.getuid()`. En dev corre como root y nunca falla; por eso el paso siguiente prueba el caso real en producción.

- [ ] **Step 7: Verificar en dev**

```bash
bash ./scripts/compose.sh exec -T app npm run typecheck && bash ./scripts/compose.sh exec -T app npm test
bash ./scripts/compose.sh exec -T app ls -la /app/data
```

Expected: los dos primeros limpios, y `/app/data` existe con `uploads` adentro.

- [ ] **Step 8: Construir la imagen de producción**

```bash
COMPOSE_ENV=prod bash ./scripts/compose.sh build
```

Expected: termina sin error. Si falla en `npm ci`, el lockfile de la Tarea 1 quedó desincronizado.

- [ ] **Step 9: Verificar que la escritura funciona sin pasos manuales**

```bash
COMPOSE_ENV=prod bash ./scripts/compose.sh up -d
sleep 5
COMPOSE_ENV=prod bash ./scripts/compose.sh ps
stat -c 'uid=%u gid=%g' ./data
ls ./data/uploads
```

Expected: `ps` muestra `Up (healthy)`, `stat` dice **`100 101`** (no `1000 1000`), y `uploads` existe. Este es el criterio que valida el entrypoint; si `stat` dice 1000, el `chown` no corrió.

- [ ] **Step 10: Verificar el fallo por permisos (review-focus 4)**

```bash
COMPOSE_ENV=prod bash ./scripts/compose.sh run --rm -e DATA_DIR=/app/nope app
```

Expected: **falla** al arrancar, y el mensaje nombra `/app/nope` y el uid. `/app` es del root con modo 755, así que el usuario `app` no puede crear ahí. No toca los datos reales.

- [ ] **Step 11: Verificar idempotencia**

```bash
COMPOSE_ENV=prod bash ./scripts/compose.sh down
touch ./data/centinela
COMPOSE_ENV=prod bash ./scripts/compose.sh up -d
sleep 5
ls ./data
```

Expected: `centinela` sigue ahí y `ps` vuelve a `healthy`. El entrypoint se puede correr las veces que haga falta.

- [ ] **Step 12: Verificar que el binario nativo sobrevive al prune**

```bash
COMPOSE_ENV=prod bash ./scripts/compose.sh run --rm --entrypoint sh app \
  -c 'ls node_modules/better-sqlite3/prebuilds/'
```

Expected: lista `linuxmusl-x64.node`. `COMPOSE_ENV=prod` es obligatorio: un `run` pelado levanta la imagen **dev**, que corre como root con el `node_modules` completo y no prueba nada.

- [ ] **Step 13: Commit**

```bash
git add Containerfile compose.prod.yml .gitignore .dockerignore data/.gitkeep scripts/entrypoint.sh api/src/server.ts
git commit -m "feat(infra): persist data dir across rebuilds via entrypoint chown"
```

---

### Task 3: Documentación al día

**Files:**
- Modify: `docs/backlog_implementacion_mvp.md` (síntesis de T1)
- Modify: `docs/PRD_Faktur.md` (fila en §0)

**Interfaces:**
- Consumes: lo que las Tareas 1 y 2 construyeron.
- Produces: nada que consuma código. Es el contrato que evita que el próximo implemente lo contrario de lo que se hizo.

- [ ] **Step 1: Corregir las cuatro afirmaciones del backlog**

En la síntesis de T1 de `docs/backlog_implementacion_mvp.md`:

| Texto actual | Reemplazar por |
|:---|:---|
| "volumen nombrado para `/app/data` en `compose.prod.yml`" | Bind mount a `./data`, con entrypoint que arregla permisos y baja a `app` |
| "`@fastify/multipart`, un driver SQLite y `@fastify/cors`" | Sacar `@fastify/cors`: en este stack nunca hay cross-origin |
| "Crea el esqueleto `api/src/{domain,db,llm,routes}/`" | T1 crea solo `api/src/config/`; cada carpeta aparece en la tarea que la llena |
| "`npm prune --omit=dev` de producción tiene que conservar el binario" | `better-sqlite3` v13 trae `prebuilds/linuxmusl-x64.node` y resuelve por conditional exports; no usa `build/Release/` |

Además, en el mismo párrafo: el texto afirma que el driver "no tiene prebuilds para musl" y que hay que agregar toolchain de build. Eso se verificó y es **falso** — la instalación real tarda 2 s sin `python3`, `make` ni `g++`. Reescribí ese párrafo con el hecho.

Y el "Hecho cuando" tiene que dejar de prometer `data/faktur.db`: en T1 no se crea ninguna base, eso es T3.

- [ ] **Step 2: Agregar la fila del CORS al PRD**

Una fila en la tabla de `docs/PRD_Faktur.md` §0: RF-8.3 pide CORS abierto, no aplica en este stack porque Vite proxea en dev y Fastify sirve el SPA del mismo origen en producción. Resuelto en el spec de T1. La tabla §0 **es** el mecanismo para registrar decisiones posteriores, así que sumar la fila cumple con `AGENTS.md` sin editar el cuerpo del PRD.

- [ ] **Step 3: Verificar que no quedaron afirmaciones viejas**

```bash
grep -n "volumen nombrado\|@fastify/cors\|build/Release\|domain,db,llm,routes" docs/backlog_implementacion_mvp.md
```

Expected: sin salida. Si.matchea, falta una sustitución.

- [ ] **Step 4: Formatear y commitear**

```bash
bash ./scripts/compose.sh exec -T app npx prettier --write docs/backlog_implementacion_mvp.md docs/PRD_Faktur.md
git add docs/backlog_implementacion_mvp.md docs/PRD_Faktur.md
git commit -m "docs: align backlog t1 synthesis with what was built"
```

---

## Cierre: los criterios de aceptación del spec

Los 11 del §8 del spec. Los que se comprueban con un comando:

| # | Criterio | Cómo se comprueba |
|:--|:---|:---|
| 1 | `just check` verde | T1 Step 9 |
| 2 | `just fmt` limpio | T3 Step 4 |
| 3 | `just rebuild` conserva `data/` | T2 Step 11 (misma prueba de persistencia) |
| 4 | Arranca sin `GEMINI_API_KEY` | T2 Step 9: no se define la variable en ningún compose |
| 5 | Sin permiso de escritura, no levanta | T2 Step 10 |
| 6 | `PORT=abc` no levanta y lo nombra | T2 Step 10, mismo mecanismo con `-e PORT=abc` |
| 7 | El prebuild sobrevive al prune | T2 Step 12 |
| 8 | `data/` no se commitea | `git status` limpio |
| 9 | `just prod` escribe sin pasos manuales | T2 Step 9 |
| 10 | El entrypoint es idempotente | T2 Step 11 |
| 11 | Documentación al día | T3 Step 3 |

Para el criterio 6, la variante exacta es:

```bash
COMPOSE_ENV=prod bash ./scripts/compose.sh run --rm -e PORT=abc app
```

`compose.yml` fija `PORT: "3000"` literal, así que `PORT=abc` en el shell del host no llega al contenedor: hay que pasarlo con `-e`.