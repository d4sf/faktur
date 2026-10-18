# Rate Limiting y Throttling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar rate limiting por IP en la API (global + por endpoint costoso) y throttling de UX en la web, con respuesta 429 estándar y un easter egg en el body.

**Architecture:** `@fastify/rate-limit` registrado en `app.ts` con config global desde env vars, `trustProxy: true`, exención de health/SSE, y límites específicos por ruta vía `config.rateLimit`. La opción `rateLimit` de `buildApp` permite desactivar o sobrescribir límites en tests. En la web, un hook `useThrottle` y botones disabled durante peticiones.

**Tech Stack:** TypeScript 5.9, Fastify 5, `@fastify/rate-limit` 11.x, React 19, `node:test` vía tsx.

**Spec:** `docs/superpowers/specs/2026-10-17-rate-limiting-design.md`.

## Global Constraints

- Todo corre dentro del contenedor. `just` no está instalado en el host: usar `bash ./scripts/compose.sh <args>`.
- Imports relativos llevan extensión `.js` (`module: NodeNext`).
- **El script `test` de `api/package.json` y `web/package.json` es una lista explícita y hay que editarla a mano** para cada archivo de test nuevo.
- Prettier: 100 columnas, comillas dobles, semicolons.
- Commits: Conventional Commits, mensajes en inglés, un commit = un cambio lógico.
- Agregar la dependencia requiere `npm install` + rebuild del contenedor (o `just install`).

## Review Focus

Cinco formas de falla que el spec implica y que ningún test del camino feliz toca.

1. **Un `.test.ts` nuevo que no está en el script `test`.** La falla más silenciosa del repo.
2. **`trustProxy` no activado.** En Render, `request.ip` sería la IP del proxy (todas las requests parecen venir de la misma IP) → un solo usuario agota el límite para todos. Obligatorio activarlo.
3. **El SSE `/api/approvals/stream` cuenta como request por minuto.** Una conexión larga agotaría el límite en segundos. Debe exentarse o limitar conexiones concurrentes.
4. **El healthcheck de Render.** Si `/api/health` se limita, el contenedor se marca unhealthy. Debe exentarse.
5. **Tests con límites reales (120/min).** Un test que hace 121 requests tardaría minutos. Los tests deben usar límites bajos inyectados vía `buildApp({ rateLimit: { global: { max: 2, ... } } })`.

---

## Task 1: Agregar dependencia `@fastify/rate-limit`

**Files:**
- Modify: `api/package.json`
- Modify: `Dockerfile` / `Dockerfile.dev` (no, las deps se instalan con `npm install`)

- [ ] **Step 1: Instalar la dependencia**

```bash
bash ./scripts/compose.sh exec app sh -c 'cd /app/api && npm install @fastify/rate-limit@^11'
```

Esto actualiza `api/package.json` y `package-lock.json`. Verificar que `@fastify/rate-limit` aparece en `dependencies`.

- [ ] **Step 2: Rebuild del contenedor (para que la imagen tenga la dep)**

```bash
COMPOSE_ENV=dev bash ./scripts/compose.sh up -d --build app
```

- [ ] **Step 3: Verificar que arranca**

Run: `bash ./scripts/compose.sh exec app sh -c 'cd /app/api && node -e "require(\"@fastify/rate-limit\"); console.log(\"ok\")"'`
Expected: `ok`.

- [ ] **Step 4: Commitear**

```bash
git add api/package.json package-lock.json
git commit -m "build(api): add @fastify/rate-limit dependency"
```

---

## Task 2: Registrar el plugin en `app.ts` con config global

**Files:**
- Modify: `api/src/app.ts`
- Modify: `api/src/config/env.ts` (nuevas env vars)

**Cambios en `env.ts`:**

Agregar al schema:
```ts
RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
RATE_LIMIT_UPLOAD_MAX: z.coerce.number().int().min(1).default(10),
RATE_LIMIT_UPLOAD_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
RATE_LIMIT_EXPLAIN_MAX: z.coerce.number().int().min(1).default(5),
RATE_LIMIT_EXPLAIN_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
RATE_LIMIT_ADMIN_MAX: z.coerce.number().int().min(1).default(3),
RATE_LIMIT_ADMIN_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
RATE_LIMIT_WEBHOOK_TEST_MAX: z.coerce.number().int().min(1).default(5),
RATE_LIMIT_WEBHOOK_TEST_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
```

**Cambios en `app.ts`:**

- `Fastify({ logger, trustProxy: true })`.
- `BuildAppOptions` suma `rateLimit?: false | RateLimitConfig`.
- Registrar `@fastify/rate-limit` con config global:
  ```ts
  await app.register(rateLimit, {
    global: options.rateLimit !== false,
    max: options.rateLimit?.global?.max ?? env.RATE_LIMIT_MAX,
    timeWindow: options.rateLimit?.global?.timeWindow ?? env.RATE_LIMIT_WINDOW_MS,
    allowList: (req) => req.url === "/api/health" || req.url.startsWith("/api/approvals/stream"),
    errorResponseBuilder: (request, context) => ({
      statusCode: 429,
      error: "Too Many Requests",
      message: "rate_limit_exceeded",
      retry_after: Math.ceil(context.ttl / 1000),
      data: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    }),
  });
  ```
- Si `options.rateLimit === false`, no registrar el plugin (o registrar con `global: false`).

Para tests, exponer `rateLimit` option. En tests sin opción, usar env defaults (120/min) — los tests de rate limiting pasan límites bajos.

- [ ] **Step 1: Implementar.**

- [ ] **Step 2: Typecheck.**

Run: `bash ./scripts/compose.sh exec app sh -c 'cd /app/api && npx tsc --noEmit'`

- [ ] **Step 3: Commitear**

```bash
git add api/src/app.ts api/src/config/env.ts
git commit -m "feat(api): register rate-limit plugin with trustProxy and env config"
```

---

## Task 3: Límites específicos por ruta

**Files:**
- Modify: `api/src/routes/invoices.ts` (upload)
- Modify: `api/src/routes/ingest.ts` (extract)
- Modify: `api/src/routes/explanations.ts` (explain)
- Modify: `api/src/routes/admin.ts` (reset)
- Modify: `api/src/routes/integrations.ts` (webhook test)
- Modify: `api/src/routes/policies.ts` (preview)

Agregar `config: { rateLimit: { max, timeWindow } }` a cada ruta. Los valores se toman de env vars o de `options.rateLimit?.<name>`.

Ejemplo (upload):
```ts
app.post("/api/invoices", { config: { rateLimit: { max: env.RATE_LIMIT_UPLOAD_MAX, timeWindow: env.RATE_LIMIT_UPLOAD_WINDOW_MS } } }, async (request, reply) => { ... });
```

Pero los route handlers actuales pasan el handler como segundo argumento. Hay que convertir a la forma con options:
```ts
app.post("/api/invoices", { config: { rateLimit: { max, timeWindow } } }, async (request, reply) => { ... });
```

Fastify soporta `app.post(url, options, handler)`.

Para que los tests puedan sobrescribir, leer de `buildApp` options. Como las rutas se registran dentro de `registerXxxRoutes(app)`, necesitan acceso a las opciones. Opción: pasar las opciones por un decorador o un closure. Más simple: registrar las rutas con una factory que recibe las opciones:
```ts
registerInvoiceRoutes(app, options);
```
Y actualizar cada `registerXxxRoutes` para aceptar `options`. O usar `app.decorate` con la config.

Recomendado: pasar `options` a cada registrador. Actualizar firma de todos los `register*Routes`.

- [ ] **Step 1: Actualizar firmas de los registradores** para aceptar `rateLimit` config.

- [ ] **Step 2: Agregar `config.rateLimit` a las rutas costosas.**

- [ ] **Step 3: Typecheck.**

- [ ] **Step 4: Commitear**

```bash
git add api/src/routes/*.ts api/src/app.ts
git commit -m "feat(api): add per-route rate limits for costly endpoints"
```

---

## Task 4: Tests de rate limiting

**Files:**
- Create: `api/src/routes/rateLimit.test.ts`
- Modify: `api/package.json` (script `test`)

**Casos:**
- Global: con `max: 2`, el 3er request devuelve 429 con `Retry-After` y el body con `data` (URL de YouTube).
- Upload: con límite bajo, el (max+1)-ésimo upload devuelve 429.
- Health: no se limita (siempre 200).
- Exempt SSE: no aplica (difícil de testear; documentar).

- [ ] **Step 1: Agregar el test al script `test`.**

- [ ] **Step 2: Escribir tests** usando `buildApp({ rateLimit: { global: { max: 2, timeWindow: 60000 }, upload: { max: 1, timeWindow: 60000 } } })`.

- [ ] **Step 3: Correr y verificar.**

- [ ] **Step 4: Commitear**

```bash
git add api/src/routes/rateLimit.test.ts api/package.json
git commit -m "test(api): add rate-limit integration tests"
```

---

## Task 5: Throttling en la web

**Files:**
- Create: `web/src/hooks/useThrottle.ts`
- Modify: componentes que disparan peticiones costosas (upload, explain, policy preview, approvals) para deshabilitar botones.

**Hook:**
```ts
export function useThrottle<T extends (...args: any[]) => any>(fn: T, delay: number): T {
  const lastCall = useRef(0);
  return useCallback((...args) => {
    const now = Date.now();
    if (now - lastCall.current < delay) return;
    lastCall.current = now;
    return fn(...args);
  }, [fn, delay]) as T;
}
```

Aplicar en:
- `InvoiceUploadDropzone` / `Subir`: deshabilitar el botón de envío mientras `loading`.
- `InvoiceInspector`: deshabilitar "Explicar con IA" mientras `explaining`.
- `PolicyEditor` / `Reglas`: deshabilitar "Aplicar" mientras se aplica.
- `Bandeja` / `ApprovalCard`: deshabilitar botones durante resolución.

- [ ] **Step 1: Crear el hook.**

- [ ] **Step 2: Aplicar en los componentes.**

- [ ] **Step 3: Typecheck web.**

- [ ] **Step 4: Commitear**

```bash
git add web/src/hooks/useThrottle.ts web/src/components/...
git commit -m "feat(web): add throttling and disable buttons during requests"
```

---

## Task 6: Documentación

**Files:**
- Modify: `docs/decisiones/` (nuevo ADR 0005 o sección en 0001).
- Modify: `docs/testing-*.md` o nueva guía.

- [ ] **Step 1: Crear ADR 0005** con la decisión de rate limiting.

- [ ] **Step 2: Actualizar `.env.example`** (si existe) con las nuevas env vars.

- [ ] **Step 3: Commitear**

---

## Task 7: Verificación final

- [ ] **Step 1: `just check` (typecheck + lint + test) ambos workspaces.**

- [ ] **Step 2: Build.**

- [ ] **Step 3: Smoke manual: hacer 3 requests rápidos al upload y verificar 429 + `Retry-After` + body con `data`.**

- [ ] **Step 4: Commitear cualquier ajuste.**

---

## Self-Review

1. **Spec coverage:** dependencia (T1), registro (T2), límites por ruta (T3), tests (T4), web throttle (T5), docs (T6), verificación (T7). Cubierto.
2. **Step scan:** cada paso tiene comando y expected.
3. **Type consistency:** `RateLimitConfig`, `buildApp` options, env vars. Consistentes.
4. **Review Focus:** los cinco puntos tienen verificación en las tareas.
5. **Proportion:** el código de implementación es ~120 líneas de backend + ~60 de UI.

## Execution Handoff

Plan completo y guardado en `docs/superpowers/plans/2026-10-17-rate-limiting.md`. ¿Captura lo que quieres?

La ejecución será con el método que ya elegiste (**Native**): yo implemento cada paso en esta sesión y un revisor final revisa toda la rama. ¿Procedo con la implementación?