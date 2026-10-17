# CI con GitHub Actions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir un workflow de GitHub Actions que ejecute typecheck, lint y tests, y verifique que la imagen de producción construye y arranca, en cada PR a `main` y en cada push a `main`.

**Architecture:** Un único archivo `.github/workflows/ci.yml` con dos jobs: `verify` (Node 22 en el runner, cache de npm, las tres puertas de `just check`) y `build-image` (construye el `Dockerfile` de prod y hace un smoke test con el healthcheck). `build-image` depende de `verify` para fail fast. Sin secretos, sin publicación, sin cache de capas Docker.

**Tech Stack:** GitHub Actions, Node 22, Docker (buildx incluido en el runner).

**Spec:** `docs/superpowers/specs/2026-10-17-ci-github-actions-design.md` — el plan implementa ese spec; los dos viajan juntos.

## Global Constraints

- El workflow vive en `.github/workflows/ci.yml` y es el único archivo nuevo. No se toca `Dockerfile`, `package.json` ni scripts.
- Node 22 (`engines.node >= 22`, `node:22-alpine` en prod). Usar otra versión en CI que en prod es una fuente de falsos verdes.
- El runner es `ubuntu-latest`. No hay contenedor de dev en CI: los tests corren directo con `npm` (el contenedor es para desarrollo local y para la imagen de prod).
- Sin secretos: `env.test.ts` valida env pero ningún test toca Gemini real.
- Sin publicar la imagen: solo verificar que construye y arranca.
- Conventional Commits en inglés para el commit.
- Prettier no se incluye: el proyecto separa `just check` (typecheck → lint → test) de `just fmt`. El workflow replica `just check`, no `just fmt`.

## Review Focus

Cinco formas de falla que el spec implica y que ningún test del workflow toca. Cada una tiene su verificación en la tarea.

1. **YAML inválido que GitHub rechaza al pushear.** GitHub no valida el workflow hasta que se ejecuta; un typo en `on:` o en un `needs:` se descubre en el primer PR. Mitigación: validar con PyYAML localmente antes de commitear.
2. **Un job que no depende del otro y construye la imagen aunque los tests fallen.** El spec pide fail fast. Mitigación: `needs: verify` en `build-image`.
3. **El smoke test con `sleep` fijo en vez de reintentos.** El healthcheck tiene `start-period: 10s`; un `sleep 5` falla intermitentemente. Mitigación: loop con reintentos y timeout.
4. **El cache de npm que no cachea.** `actions/setup-node` con `cache: 'npm'` requiere `package-lock.json` en la raíz; si no está, silenciosamente no cachea. Mitigación: verificar que el lockfile existe y está commiteado.
5. **Un trigger que no cubre lo que el usuario pidió.** El spec pide PR a `main` Y push a `main`. Mitigación: ambos en `on:`.

---

### Task 1: El workflow de CI

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: nada de código del repo. Consume el `Dockerfile` existente, `package.json`, `package-lock.json`, y los scripts `typecheck`, `lint`, `test` del root.
- Produces: el workflow en sí. No produce código que otras tareas consuman.

- [ ] **Step 1: Crear el directorio y escribir el workflow**

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    name: Typecheck, lint y tests
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node 22
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Typecheck
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      - name: Tests
        run: npm test

  build-image:
    name: Build y smoke test de la imagen de producción
    runs-on: ubuntu-latest
    needs: verify
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Build production image
        run: docker build -f Dockerfile -t blinka-payagent:ci .

      - name: Smoke test
        run: |
          set -euo pipefail
          docker run -d --name blinka-ci -p 3000:3000 blinka-payagent:ci
          # Esperar el healthcheck (start-period 10s + reintentos)
          for i in $(seq 1 30); do
            if curl -sf http://127.0.0.1:3000/api/health >/dev/null; then
              echo "healthcheck OK"
              break
            fi
            sleep 2
          done
          curl -sf http://127.0.0.1:3000/api/health
          docker stop blinka-ci
          docker rm blinka-ci
```

El `concurrency` cancela corridas anteriores del mismo ref, que es lo que evita que un push nuevo espere a una corrida vieja.

- [ ] **Step 2: Validar el YAML localmente**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('YAML válido')"`

Expected: `YAML válido`, sin excepción.

- [ ] **Step 3: Verificar que los comandos del job `verify` corren en el host**

Los mismos comandos que el workflow, en el mismo orden, para confirmar que no hay un paso que solo funcione en el contenedor:

```bash
npm ci
npm run typecheck
npm run lint
npm test
```

Expected: los cuatro pasan (typecheck limpio, lint limpio, 63/63 tests). Si alguno falla acá, el workflow también fallará.

- [ ] **Step 4: Verificar que el build de la imagen corre**

Run: `docker build -f Dockerfile -t blinka-payagent:ci .`

Expected: build exitoso (igual que el que se hizo en T4 para verificar el `COPY specs`).

- [ ] **Step 5: Verificar el smoke test a mano**

```bash
docker run -d --name blinka-ci -p 3000:3000 blinka-payagent:ci
for i in $(seq 1 30); do curl -sf http://127.0.0.1:3000/api/health >/dev/null && break; sleep 2; done
curl -sf http://127.0.0.1:3000/api/health
docker stop blinka-ci && docker rm blinka-ci
```

Expected: `{"status":"ok"}` (o lo que devuelva `/api/health`) y el contenedor se limpia.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add github actions workflow for tests and prod build"
```
````
- [ ] **Step 7: Push y verificar que GitHub acepta el workflow**

```bash
git push
```

Expected: el push crea la rama (o actualiza `main` si se mergea directo) y GitHub muestra el workflow en la pestaña Actions sin error de sintaxis. Si GitHub rechaza el YAML, el error aparece en la UI de Actions al primer push.

---

## Self-Review

1. **Spec coverage:** el spec tiene 7 secciones + no-goals + riesgos + criterio de éxito. La tarea cubre: los triggers (§3), los dos jobs (§2.1, §2.2), el fail fast (§2.2), el smoke test (§2.2), sin secretos (§4), sin publicación (§4), sin prettier (§4), sin cache Docker (§4). Los no-goals y riesgos no requieren código; son documentación que vive en el spec. Cubierto.

2. **Step scan:** cada paso tiene un comando y un expected. Sin "TBD" ni "handle edge cases".

3. **Type consistency:** no aplica (no hay código TypeScript).

4. **Review Focus:** los cinco puntos tienen su verificación en los pasos 2-5.

5. **Proportion:** el plan es más corto que el spec, lo cual es correcto para una tarea de un solo archivo.

## Execution Handoff

Plan completo y guardado en `docs/superpowers/plans/2026-10-17-ci-github-actions.md`. Revisalo. ¿Captura lo que quieres?

La ejecución será con el método que ya elegiste para T2 (**Native**): yo implemento cada paso en esta sesión y un revisor final revisa toda la rama. ¿Procedo con la implementación?