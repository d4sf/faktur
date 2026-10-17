# Spec — T1 · Dependencias, variables de entorno y persistencia de datos

> **Backlog:** `docs/backlog_implementacion_mvp.md`, tarea T1 (Bloque A · Cimientos).
> **Fecha:** 16/10/2026 · **Estado:** aprobado para implementar.
> **Qué es:** el primer commit de producto del MVP. Hoy `api/src/app.ts` solo sirve `/api/health`; T1 deja el terreno listo para que T2 (schemas) y T3 (base) no tengan que decidir nada de infraestructura.

---

## 1. Por qué

Sin T1, cada tarea posterior vuelve a decidir dónde vive la base, qué variable guarda la llave de Gemini y cómo se leen los datos de la demo. Eso produce tres o cuatro respuestas distintas en el mismo repo y un `just rebuild` que borra el audit trail.

La consecuencia concreta que este spec evita: **el contenedor de producción corre como usuario no root y hoy no tiene dónde escribir**. `Containerfile` crea el usuario `app` pero no crea `/app/data`, y `compose.prod.yml` no monta ningún volumen. El primer `npm run seed` en producción falla por permisos, o peor, la demo arranca sin datos y nadie sabe por qué.

## 2. Objetivos

1. Agregar las 5 dependencias que necesitan T2, T3, T9 y T10, con versiones fijadas.
2. Un módulo único y tipado para leer el entorno, que falle al arrancar con un mensaje que nombre la variable.
3. Un lugar declarado y persistente para la base y los archivos subidos, tanto en dev como en producción.
4. Que `just rebuild` no borre los datos de la demo.
5. Que el repo quede con el mismo estándar de calidad que tiene hoy: typecheck, lint, tests y Prettier.

## 3. No objetivos

- **No** es la base de datos. T1 no crea ni una tabla; T3 traduce el ER a DDL.
- **No** son los schemas de dominio. T2 los escribe.
- **No** es CORS. Ver §5.4.
- **No** toca `web/`. El scaffold de UI es T26.
- **No** implementa migraciones. Con un solo esquema v1 alcanza; si mañana hay que versionar, es otra tarea.

## 4. Anti-objetivos

Lo que haría que esto se considere fallido aunque compile:

- **Arrancar sin avisar.** Si el contenedor levanta con un valor malformado y revienta tres requests más tarde, el debug cuesta más que la validación. Fallar en `loadEnv`, con el nombre de la variable y qué esperaba.
- **Perder datos en un rebuild.** Es el escenario exacto que la demo no puede permitirse.
- **Dependencias que nadie usa.** Si T1 agrega algo que ninguna tarea del backlog consume, es ruido que después alguien va a debuggear.

## 5. Decisiones

### 5.1 Driver de SQLite: `better-sqlite3`

**Decisión del dueño del producto.** Se evaluaron `better-sqlite3`, `node:sqlite` y cambiar la imagen base a Debian.

El backlog (§6, T3) marcaba un riesgo: `better-sqlite3` no tendría prebuilds para musl y habría que agregar toolchain de build a los dos Containerfiles. **Ese riesgo se verificó y es falso.** La instalación real en el contenedor de este repo:

```
added 2 packages, and audited 3 packages in 2s      ← sin compilar
prebuilds/linux-x64.node
prebuilds/linuxmusl-arm64.node
```

Y funciona completo: `pragma`, `exec`, `prepare`, `run`, `get`, `all`, transacciones y `CHECK` verificados en runtime.

Se elige `better-sqlite3` por su API estable, sin `ExperimentalWarning` en cada arranque y con una superficie de rollback transaccional que `node:sqlite` todavía no garantiza.

**Consecuencia asumida:** `better-sqlite3@13` no publica tipos propios, así que hace falta `@types/better-sqlite3`, que va 4 majors atrás (9.6.0). Ver §5.2.

### 5.2 Los tipos de `better-sqlite3` hay que parametrizarlos en `prepare`

Los tipos de la 9.x no genéricos: `.get()` devuelve `unknown`, y `.get<T>()` no compila (`Expected 0 type arguments`). La forma que sí compila, verificada con `tsc`:

```ts
type Row = { id: string; n: number };

// correcto
const one = db.prepare<[string], Row>("SELECT * FROM t WHERE id = ?").get("a");
//   → Row | undefined
const agg = db.prepare<[], { s: number | null }>("SELECT SUM(n) AS s FROM t").get();
const res = db.prepare<[string, number]>("INSERT INTO t VALUES (?,?)").run("a", 1);
//   → res.changes, res.lastInsertRowid

// no compila
const one = db.prepare("SELECT * FROM t").get("a"); // → unknown
```

**Es una convención que T3 tiene que respetar.** Se deja escrita acá para que no se re-descubra con un error de typecheck. El segundo genérico es el tipo de la fila, el primero la tupla de parámetros.

### 5.3 `GEMINI_API_KEY` es opcional al arrancar

**Decisión del dueño del producto.** La llave no es requisito para que el proceso levante; sí lo es para extraer.

Motivo: el MVP §13 pide que la demo sobreviva a la caída de cuota de Gemini, y el runner de T6 tiene que correr sin llave. Si el arranque la exigiera, ambos quedan atados a tener internet.

La división es esta: `GEMINI_API_KEY` es `string | undefined` en el tipo `Env` y su ausencia **no** impide `loadEnv`. Quien la necesite (T10, en `/extract`) la pide con un helper que lanza con mensaje claro.

### 5.4 No se agrega `@fastify/cors`

**Decisión del dueño del producto.** El PRD RF-8.3 pide "CORS abierto en demo", pero en este stack nunca hay cross-origin: en dev Vite proxea `/api` (`web/vite.config.ts`) y en producción Fastify sirve el SPA del mismo origen. Una dependencia que no se ejercita es ruido.

Queda anotado como desviación del PRD en `docs/PRD_Faktur.md` §0.

### 5.5 Los datos de producción se montan desde el host

**Decisión del dueño del producto.** Bind mount a `./data` en lugar de volumen nombrado de Docker. En un hackathon, resetear entre tomas es `rm -rf data/` y no `docker volume rm` + meterse al contenedor.

Esta decisión sola no alcanzaba: el bind mount tapa el `/app/data` de la imagen y el usuario del contenedor no puede escribir un directorio del host. El remedio es §5.6.

### 5.6 El entrypoint baja de root a `app` y arregla los permisos solo

**Decisión del dueño del producto.** De las cinco opciones, la elegida es la que se arregla sola, sin pasos manuales ni permisos abiertos.

**El problema medido.** Un bind mount **tapa** el directorio que la imagen creó: el `mkdir -p /app/data && chown app:app /app/data` del `Containerfile` no tiene efecto bajo `just prod`. Y como T1 trackea `data/.gitkeep`, un clone nuevo siempre trae `./data` con el dueño del host:

```
$ stat -c '%U uid=%u gid=%g modo=%a' data/
daniel_alejandro uid=1000 gid=1000 modo=755
$ sudo -n true
sudo: a password is required
```

uid 1000 no puede escribir para un proceso uid 100, y el remedio manual pide password. La app levantaba, `/api/health` respondía `ok`, y no escribía nada.

**El diseño.** La imagen runtime **arranca como root**, arregla `DATA_DIR` y recién ahí baja a `app`:

```dockerfile
RUN apk add --no-cache su-exec

COPY --chmod=755 scripts/entrypoint.sh /app/scripts/entrypoint.sh

ENTRYPOINT ["/app/scripts/entrypoint.sh"]
CMD ["node", "api/dist/server.js"]
```

Se saca el `USER app` del final: el `USER` fijo es justamente lo que impide al entrypoint hacer su trabajo.

`scripts/entrypoint.sh`:

```sh
#!/bin/sh
set -e

: "${DATA_DIR:=/app/data}"
mkdir -p "$DATA_DIR" "$DATA_DIR/uploads"

# Sin -R a propósito: los archivos que crea la app ya nacen de app, porque
# desde este punto corre como app. Un -R cambiaría también el dueño en el
# host y dejaría al usuario del host sin escritura sobre sus propios
# archivos. Si ./data ya tiene archivos de otra corrida, el repair manual
# es chown -R desde el host.
chown app:app "$DATA_DIR" "$DATA_DIR/uploads"

exec su-exec app "$@"
```

**Por qué `su-exec` y no `gosu`:** viene en los repos de Alpine, pesa ~10 KB y no trae runtime de Go. `gosu` se compila, y compilar es justo lo que T1 se bannó.

**Por qué el `chown` no es recursivo:** es suficiente. Lo único que el contenedor necesita poder escribir es el directorio. Los archivos que la app crea después ya salen con uid 100 porque se crean después del `su-exec`. El `-R` solo hace falta para reparar un `data/` que ya tenga archivos ajenos de una corrida anterior.

**Idempotente:** correrlo dos veces es lo mismo que correrlo una.

**Volver a root:** `docker run --entrypoint` lo permite, y sirve para debuggear. No es un problema.

**Effecto en la imagen:** `su-exec` es un paquete de Alpine, no una dependencia npm. No va al `package.json`.

**Efecto colateral, medido y NO aceptable como estaba escrito:** después del primer arranque `./data` queda con uid 100 en el host, así que el usuario del host **puede listar y recorrer `data/` pero no puede borrar nada dentro** — `rm -rf data/` da `Permission denied` sin `sudo`. La versión anterior de este párrafo decía que podía borrarlo, y es falso: verificado con `touch ./data/x` y `rm ./data/faktur.db`.

Eso rompe justo el motivo de §5.5. El escape hatch queda documentado en el README, con `sudo chown -R "$(id -u):$(id -g)" data` y una alternativa sin `sudo` que borra desde el contenedor. Si durante la demo resulta molesto, la salida es cambiar el `chown` por un `chmod 0777` en el entrypoint: host y app escriben, sin pasos manuales, a costa de permisos abiertos.

---

## 6. Verificación empírica previa

Todo lo de esta tabla se probó en el contenedor real antes de escribir el spec, no se consultó documentación:

| Comprobación | Resultado |
|:---|:---|
| Versión de Node en el contenedor | `v22.23.3` sobre Alpine musl x64 |
| `better-sqlite3@13.0.3` instala en musl | Sí, 2 s, con prebuild, sin `python3`/`make`/`g++` |
| Toolchain de build en la imagen | Ausente en los cuatro (`python3`, `make`, `g++`, `cc`) |
| `better-sqlite3` carga y ejecuta | `CHECK` rechaza negativos, transacciones con rollback, `SUM` OK |
| `better-sqlite3@13` publica tipos propios | No → hace falta `@types/better-sqlite3` |
| `prepare<Bind, Row>` compila con los tipos 9.x | Sí (probado con `tsc` real) |
| `prepare(sql).get()` sin genéricos | Devuelve `unknown`, no compila el uso tipado |

Versiones a fijar:

| Paquete | Versión | Para qué | Nota |
|:---|:---|:---|:---|
| `zod` | `^4.6.7` | Validación de entorno y schemas de dominio (T2) | |
| `@google/genai` | `^2.30.0` | Extracción multimodal (T10) | Declara `node >=20` |
| `@fastify/multipart` | `^10.1.4` | Subida de archivos (T9) | |
| `better-sqlite3` | `^13.0.3` | Persistencia (T3) | Prebuild musl verificado |
| `@types/better-sqlite3` | `^9.6.0` (`devDependencies`) | Tipos | 4 majors atrás; ver §5.2 |

---

## 7. Diseño

### 7.1 Dependencias

Agregar las 5 de §6 a `api/package.json`, salvo `@types/better-sqlite3`, que va a `devDependencies`. **`@fastify/cors` no se agrega.**

**El lockfile se regenera.** Editar `api/package.json` a mano rompe `npm ci`, que es lo que corren tanto `Containerfile` (`deps`) como `Containerfile.dev`. El orden correcto es: editar el JSON, y después regenerar el lock **desde el contenedor dev**, que es el único lado donde hay Node disponible:

```bash
just install
```

Si se salta ese paso, `just rebuild` falla en el `npm ci` con un error de lock desincronizado.

**`.dockerignore` suma `data`.** Hoy no lo excluye y los tres compose hacen `COPY . .`: la `faktur.db` del host se hornea en las capas de la imagen de dev y de la de producción. Además ocupa espacio y confunde. Agregar `data` a `.dockerignore`.

### 7.2 Estructura de carpetas

T1 crea **una** carpeta nueva:

```
api/src/
  config/
    env.ts          ← T1
    env.test.ts     ← T1
  app.ts            ← ya existe
  server.ts         ← ya existe
```

**Desviación consciente del backlog:** T1 no crea `domain/`, `db/`, `llm/` ni `routes/`. Git no trackea directorios vacíos, así que habría que llenarlos de `.gitkeep` que nadie va a leer, y quedan como andamiaje muerto. Cada carpeta aparece en el commit de la tarea que la llena: `db/` en T3, `domain/` en T2, `llm/` en T10, `routes/` en T12.

### 7.3 El contrato de entorno

`api/src/config/env.ts` exporta:

```ts
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

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env;
export function requireGeminiKey(env: Env): string;
```

Reglas:

| Variable | Obligatoria | Default | Se valida |
|:---|:--:|:---|:---|
| `NODE_ENV` | no | `"development"` | Debe ser uno de los tres valores |
| `PORT` | no | `3000` | Entero 1–65535 |
| `LOG_LEVEL` | no | `"info"` | String no vacío |
| `WEB_DIST` | no | `resolve(cwd, "web/dist")` | Ruta no vacía |
| `DATA_DIR` | no | `resolve(cwd, "data")` | Ruta no vacía |
| `GEMINI_MODEL` | no | `"gemini-3.8-flash"` | String no vacío |
| `GEMINI_API_KEY` | no | — | String no vacío si está presente (§7.3.1) |
| `NOTIFIER_WEBHOOK_URL` | no | — | Si está presente y no vacío, tiene que parsear como URL (§7.3.1) |

El default de `DATA_DIR` es `resolve(cwd, "data")` y no una ruta absoluta, para que funcione en los tres lugares sin configuración: dev (`cwd=/app`, con el bind mount del repo → `./data` del host), producción (`cwd=/app`) y host sin contenedor (`./data` local).

**Fallo rápido:** `loadEnv` valida todo junto con Zod y, si algo está mal, lanza **una sola vez** con todas las variables problemáticas listadas:

```
Configuración de entorno inválida:
  PORT: "abc" no es un entero entre 1 y 65535
  NOTIFIER_WEBHOOK_URL: "no-es-una-url" no es una URL válida
```

No es «la primera que encontré». El message tiene que permitir arreglar todo en un intento.

`requireGeminiKey` lanza si falta:

```
Falta GEMINI_API_KEY. La extracción de facturas la necesita.
Definila en .env o como variable del entorno. El resto del sistema
(motor de reglas, CSV, bandeja) funciona sin ella.
```

Ese último renglón es deliberado: evita que quien la falta por error Whole crea que la app entera está rota.

`server.ts` deja de leer `process.env.PORT` directo y usa `loadEnv()`.

#### 7.3.1 Cadena vacía no es lo mismo que variable ausente

**Decisión mía.** En `.env` la forma de "desactivar" una variable es dejarla en blanco: `GEMINI_API_KEY=`. Si el spec tratara el blanco como un valor presente, `requireGeminiKey` devolvería `""` y T10 fallaría con un 400 opaco de Google en vez del mensaje claro; y `NOTIFIER_WEBHOOK_URL=` reventaría el arranque con un error de URL, que es exactamente la sorpresa que este spec existe para evitar.

Regla: **una cadena vacía o solo espacios se normaliza a `undefined`** antes de validar. Con eso, `.env.example` puede llevar las variables en blanco como recordatorio sin que rompa nada.

#### 7.3.2 Firma de `buildApp`

**Decisión mía.** Para que el test existente siga funcionando sin editarlo y para que `LOG_LEVEL` no quede como configuración muerta:

```ts
export async function buildApp(
  options: { webDist?: string; logLevel?: string } = {},
): Promise<FastifyInstance>
```

`Fastify({ logger: { level: options.logLevel ?? "info" } })`. Hoy está en `logger: true` fijo, y pino **no** lee `LOG_LEVEL` por su cuenta: sin este cambio la variable se declara en §7.3 y no hace nada.

Ambos parámetros son opcionales, así que `app.test.ts` sigue llamando `buildApp()` sin cambios.

### 7.4 Persistencia

**Layout dentro del contenedor:**

```
/app/data/
  faktur.db          ← base SQLite (la crea T3)
  uploads/           ← archivos originales subidos (los usa T9)
```

**`.gitignore`** — hoy `data/` existe en el repo, está vacío y no está cubierto. Con el bind mount de dev, `data/` es la base real, así que sin esto un `npm run seed` en dev la deja commiteada:

```
data/*
!data/.gitkeep
```

Con `data/.gitkeep` trackeado, el directorio sobrevive al clone sin que su contenido se versione.

**`Containerfile`** (runtime) — uid/gid explícitos y entrada por `entrypoint.sh`:

```dockerfile
RUN addgroup -S -g 101 app && adduser -S -u 100 -G app app
RUN apk add --no-cache su-exec
COPY --chmod=755 scripts/entrypoint.sh /app/scripts/entrypoint.sh
ENTRYPOINT ["/app/scripts/entrypoint.sh"]
CMD ["node", "api/dist/server.js"]
```

Dos cosas que no son negociables acá:

- **Los uid/gid explícitos (100:101).** Sin fijarlos, Alpine reparte lo que encuentre libre y el `chown` del host cambia según la imagen. El `-g 101` además es obligatorio y no cosmético: el grupo `users` ya ocupa el gid 100 en la imagen base.
- **`chmod=755` en el `COPY`.** Si el builder no lo soporta, alternativa: `RUN chmod +x /app/scripts/entrypoint.sh` después del `COPY`.

**No** va `USER app`. El `USER` fijo es lo que impide al entrypoint hacer el `chown`, y bajarlo a runtime es justamente lo que arregla §5.6.

**`compose.prod.yml`** — agregar el bind mount:

```yaml
volumes:
  - ./data:/app/data
```

**`.dockerignore`** no excluye `data/` hoy, así que los tres compose hacen `COPY . .` y hornean la `faktur.db` del host en las capas de imagen. `data` va al `.dockerignore` (ver §7.1).

### 7.5 Pruebas

`api/src/config/env.test.ts`, con `node:test` como el resto:

- Defaults: `loadEnv({})` devuelve `PORT 3000`, `GEMINI_MODEL "gemini-3.8-flash"`, `DATA_DIR` terminado en `/data`, `GEMINI_API_KEY undefined`.
- `loadEnv({})` **no** lanza. Es el criterio de §5.3.
- `loadEnv({ PORT: "abc" })` lanza y el mensaje menciona `PORT`.
- `loadEnv({ PORT: "abc", NOTIFIER_WEBHOOK_URL: "x" })` lanza **una vez** y menciona las dos.
- `loadEnv({ NOTIFIER_WEBHOOK_URL: "https://hooks.example/x" })` no lanza.
- `requireGeminiKey` lanza con un mensaje que menciona `GEMINI_API_KEY`; con la llave presente devuelve la llave.
- `PORT: "8080"` devuelve el **número** `8080`, no el string.

**El paso que se olvida:** el script `test` de `api/package.json` está hardcodeado a `tsx --test src/app.test.ts`. El archivo nuevo hay que agregarlo a mano o nunca corre:

```json
"test": "tsx --test src/app.test.ts src/config/env.test.ts"
```

### 7.6 Las variables tienen que llegar al contenedor

**Decisión mía.** Hoy `compose.yml` solo declara `PORT` y `LOG_LEVEL`. Compose **no** mete una variable en el contenedor por el hecho de que esté en `.env`: hace falta declararla bajo `environment:`. `scripts/compose.sh` hace `set -a` al cargar `.env`, así que la interpolación `${GEMINI_API_KEY}` funciona, pero sin la declaración la llave nunca llega a la app y `requireGeminiKey` mentiría al decir "definila en .env".

T1 suma a `compose.yml`:

```yaml
environment:
  PORT: "3000"
  LOG_LEVEL: ${LOG_LEVEL:-info}
  GEMINI_API_KEY: ${GEMINI_API_KEY:-}
  GEMINI_MODEL: ${GEMINI_MODEL:-gemini-3.8-flash}
  NOTIFIER_WEBHOOK_URL: ${NOTIFIER_WEBHOOK_URL:-}
  DATA_DIR: /app/data
```

`DATA_DIR` va fija en `/app/data` porque el mount es el mismo en dev y prod, y el default `resolve(cwd, "data")` ya resuelve a eso en ambos. Fijarla hace que el valor sea el mismo sin depender del cwd.

`.env.example` suma las tres de Gemini en blanco, que es la forma de "no configurado" según §7.3.1:

```
# Opcional. Sin esta, el motor de reglas, el CSV y la bandeja funcionan igual;
# solo /extract falla cuando se usa.
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.8-flash

# Opcional. Solo se usa en T17.
NOTIFIER_WEBHOOK_URL=
```

### 7.7 T1 crea los directorios declarados, y falla ruidosamente si no puede

**Decisión mía.** §7.4 declara `data/` y `data/uploads/`, pero en T1 nada los escribe: T3 crea la base y T9 usa los uploads. Sin más, el criterio 3 no tiene forma de demostrarse y el `EACCES` queda escondido hasta el primer INSERT.

`server.ts`, después de `loadEnv()` y antes de `listen()`:

- `mkdirSync(DATA_DIR, { recursive: true })` y `mkdirSync(DATA_DIR/uploads, { recursive: true })`.
- Si lanza `EACCES` o `EROFS`, el proceso muere con el mensaje de §4: qué directorio intentó escribir, con qué uid corre y qué hacer. **No** un 500 tres requests más tarde.

Esto no toca el criterio 6: crear directorios y no tener llave de Gemini son cosas independientes.

### 7.8 Documentación que hay que actualizar

T1 cambia cuatro afirmaciones que están escritas en otros documentos. `AGENTS.md` pone el backlog como **fuente de verdad #1**, así que dejarlo diciendo lo contrario no es cosmético: el próximo que lo lea va a meter toolchain de build en dos imágenes, una dependencia que no se usa y cuatro carpetas vacías que git ni trackea.

**`docs/backlog_implementacion_mvp.md`, síntesis de T1.** Cuatro sustituciones puntuales:

| Dice hoy | Tiene que decir |
|:---|:---|
| "volumen nombrado para `/app/data` en `compose.prod.yml`" | Bind mount a `./data` con un entrypoint que arregla permisos y baja a `app` (§5.6) |
| "`@fastify/multipart`, un driver SQLite y `@fastify/cors`" | Sacar `@fastify/cors`: en este stack nunca hay cross-origin (§5.4) |
| "Crea el esqueleto `api/src/{domain,db,llm,routes}/`" | T1 crea solo `api/src/config/`; el resto aparece en la tarea que lo llena (§7.2) |
| "`npm prune --omit=dev` de producción tiene que conservar el binario" | La versión de `better-sqlite3` que se fije **no** usa `build/Release/`: trae `prebuilds/linuxmusl-x64.node` y resuelve por conditional exports (§6) |

También: el riesgo de §5.1 dice que el driver "no tiene prebuilds para musl" y que hay que agregar toolchain. Eso se verificó y es falso, así que el párrafo se reescribe con la evidencia de §6 en lugar de la advertencia.

Y el "Hecho cuando" de T1 tiene que dejar de prometer `data/faktur.db` — en T1 no se crea ninguna base; eso es T3.

**`docs/PRD_Faktur.md` §0.** Una fila más en la tabla de decisiones posteriores: CORS pedido en RF-8.3 y no aplicable en este stack, resuelto en el spec de T1.

**`AGENTS.md`.** T1 no lo toca. Su sección de Tests ya dice que para correr un test puntual hay que usar `just shell`, y eso sigue siendo cierto. Lo único que hay que evitar es que alguien asuma que `npm test` ya corre el archivo nuevo sin el paso de §7.5.

### 7.9 Fuera de T1

Por si queda tentación de colarlo: el schema de Zod de dominio, el DDL, el cliente de Gemini, la interfaz `Notifier`, la política y los fixtures. Todo eso tiene tarea propia.

---

## 8. Criterios de aceptación

T1 está terminado cuando:

1. `just check` (typecheck + lint + test) pasa en verde.
2. `just fmt` no deja diferencias.
3. `just rebuild` levanta el dev sano y **`data/` sigue con su contenido después**.
4. Arrancar **sin** `GEMINI_API_KEY` levanta igual y `GET /api/health` responde `ok`.
5. Arrancar sin permiso de escritura sobre `DATA_DIR` **no** levanta, y el mensaje nombra el directorio y el uid.
6. Arrancar con `PORT=abc` **no** levanta, y el log nombra `PORT`.
7. `npm run build-prod` produce una imagen donde el prebuild nativo de `better-sqlite3` sigue presente después del `npm prune --omit=dev`.
8. `git status` limpio salvo los archivos de T1: nada de contenido de `data/` adentro.
9. **`just prod` levanta, `/api/health` responde `ok` y la app escribe sin ningún paso manual.** Esta es la comprobación que valida §5.6 y la que antes era imposible:

```bash
just prod
sleep 5
stat -c 'uid=%u gid=%g' ./data          # tiene que decir 100 101, no 1000
ls ./data/uploads                       # tiene que existir
```

10. El entrypoint es idempotente: `just prod-down && just prod` no rompe nada y `./data` conserva su contenido.
11. La documentación de §7.8 quedó actualizada.

El punto 7 merece comprobación explícita y no un "debería". `better-sqlite3@13` **no** usa el layout `build/Release/` de las versiones viejas: trae `prebuilds/` y resuelve por conditional exports. En una instalación real:

```
prebuilds/linux-x64.node
prebuilds/linuxmusl-x64.node      ← el que usa Alpine x64
prebuilds/linuxmusl-arm64.node
```

La comprobación correcta, que además necesita `COMPOSE_ENV=prod` porque un `docker compose run` pelado levanta la imagen **dev**:

```bash
COMPOSE_ENV=prod bash ./scripts/compose.sh run --rm --entrypoint sh app \
  -c 'ls node_modules/better-sqlite3/prebuilds/'
```

Y el punto 6 tampoco se puede disparar desde el entorno del host: `compose.yml` fija `PORT: "3000"` literal, así que `PORT=abc` en el shell no llega al contenedor. Hay que pasarlo con `-e`:

```bash
COMPOSE_ENV=prod bash ./scripts/compose.sh run --rm -e PORT=abc app
```

---

## 9. Pregunta cerrada: quién puede escribir en `data/` en producción

**Resuelta: opción C, diseño en §5.6.** La imagen runtime arranca como root, `scripts/entrypoint.sh` crea `DATA_DIR`, le hace `chown` a `app`, y baja con `su-exec app`. Sin pasos manuales, sin permisos abiertos, y `just prod` escribe desde el primer arranque.

Lo que se descartó, para que la decisión sea reversible si aparece un problema:

| Opción | Por qué no |
|:---|:---|
| Documentar el `sudo chown` a mano | Pide password, no es automatizable, y contradice el anti-objetivo de §4 |
| `chmod 777` como default | Funciona sin sudo, pero deja permisos abiertos en un contenedor que después se endurece |
| Volumen nombrado de Docker | Resuelve el problema, pero rompe el motivo de §5.5: resetear entre tomas deja de ser `rm -rf data/` |
| Alinear el uid del contenedor al del host por build arg | Hace la imagen no reproducible entre máquinas: el mismo tag da distinto comportamiento según quién la construyó |

El costo que se acepta: `su-exec` entra a la imagen runtime y el `USER` se resuelve en runtime en vez de en build. Son 10 KB y una línea de shell.

---

## 10. Qué queda para el implementador

Decidido y escrito acá: el driver, las versiones, el contrato de `Env`, el comportamiento de fallo, la normalización de cadenas vacías, la firma de `buildApp`, el layout de `data/`, los uid/gid, el entrypoint, el pass-through de compose, la creación de directorios, la documentación a actualizar y los criterios de aceptación.

Sin decidir, y el implementador puede resolverlo con criterio:

- El nombre interno del tipo de error que lanza `loadEnv`. La repo no tiene jerarquía de errores todavía; lo más consistente es `Error` con el mensaje ya formateado.
- Si `env.test.ts` va con `@/`-style imports o rutas relativas. El repo usa `.js` relativo (`./app.js`) y eso no cambia.
- El texto literal de los mensajes, mientras nombre la variable y no prometa que el resto del sistema está roto.
- Si `env.ts` y su test viven en `config/` o un nivel más arriba. El spec dice `config/`.
- Si el `chmod=755` del `COPY` lo soporta el builder disponible o hace falta un `RUN chmod` aparte.

Sin tocar, aunque tentado:

- `Containerfile.dev`: corre como root y no necesita el entrypoint. Solo se toca el `Containerfile` de producción.
- `justfile`: ninguna receta cambia. El `prod` ya levanta lo que hace falta.
- `web/`: T1 no lo toca.