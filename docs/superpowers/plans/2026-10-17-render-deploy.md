# Despliegue en Render con Docker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configurar el despliegue de Faktur en Render usando Docker, con disco persistente, health check, variables de entorno, renombre de `Dockerfile` a `Dockerfile`, y trigger de deploy desde CI (Opción A: `autoDeploy: false` + GitHub Action).

**Architecture:** Un archivo `render.yaml` en la raíz declara el servicio (Docker runtime, disco, env vars, health check, `autoDeploy: false`). El `Dockerfile` se renombra a `Dockerfile`. `compose.prod.yml` y `ci.yml` se actualizan. El workflow de CI gana un job `deploy` que triggerea Render después de `verify` + `build-image` (solo en push a main). Las referencias en docs se actualizan con find-and-replace. El `chown` del entrypoint siempre se ejecuta (idempotente, funciona en local y en Render).

**Tech Stack:** Render Blueprints (render.yaml), GitHub Actions, Docker, PyYAML (validación local).

**Spec:** `docs/superpowers/specs/2026-10-17-render-deploy-design.md` — el plan implementa ese spec; los dos viajan juntos.

## Global Constraints

- Todo corre dentro del contenedor para verificación. `just` no está instalado en el host: usar `bash ./scripts/compose.sh <args>`. El cwd de `compose exec` es `/app`.
- Commits: Conventional Commits, mensajes en inglés, un commit = un cambio lógico.
- El renombre `Dockerfile` → `Dockerfile` no cambia el contenido del archivo, solo el nombre.
- `Dockerfile.dev` se renombra a `Dockerfile.dev` (consistencia). `compose.dev.yml` se actualiza.
- Prettier no aplica a `render.yaml` ni a `Dockerfile` (no son archivos que Prettier parsea).
- El `Dockerfile` debe seguir pasando el build de producción (`COMPOSE_ENV=prod bash ./scripts/compose.sh build`).
- `.dockerignore` debe excluir `Dockerfile` y `Dockerfile.dev` en vez de `Dockerfile` y `Dockerfile.dev`.

## Review Focus

Cinco formas de falla que el spec implica.

1. **`compose.prod.yml` no actualizado.** Si se renombra el archivo pero no se actualiza `dockerfile:`, `just prod` falla con "file not found". Mitigación: actualizar en el mismo commit.
2. **CI no actualizado.** Si `ci.yml` sigue referenciando `Dockerfile`, el workflow falla en el paso de build. Mitigación: actualizar en el mismo commit.
3. **`render.yaml` inválido.** Un typo en YAML o un campo no soportado hace que Render rechace el blueprint. Mitigación: validar con PyYAML localmente.
4. **El job `deploy` corre en PRs.** El deploy solo debe ocurrir en push a `main`, no en PRs. Mitigación: `if: github.ref == 'refs/heads/main' && github.event_name == 'push'`.
5. **El job `deploy` falla si los secrets no existen.** Si `RENDER_API_KEY` o `RENDER_SERVICE_ID` no están configurados en GitHub, el deploy falla. Mitigación: documentar en el PR body y en el README.

---

### Task 1: Renombrar `Dockerfile` a `Dockerfile`

**Files:**
- Rename: `Dockerfile` → `Dockerfile`
- Rename: `Dockerfile.dev` → `Dockerfile.dev`
- Modify: `compose.prod.yml` (dockerfile: Dockerfile → Dockerfile)
- Modify: `compose.dev.yml` (dockerfile: Dockerfile.dev → Dockerfile.dev)
- Modify: `.dockerignore` (Dockerfile → Dockerfile)

- [ ] **Step 1: Renombrar los archivos**

```bash
git mv Dockerfile Dockerfile
git mv Dockerfile.dev Dockerfile.dev
```

- [ ] **Step 2: Actualizar `compose.prod.yml`**

Cambiar `dockerfile: Dockerfile` a `dockerfile: Dockerfile`.

- [ ] **Step 3: Actualizar `compose.dev.yml`**

Cambiar `dockerfile: Dockerfile.dev` a `dockerfile: Dockerfile.dev`.

- [ ] **Step 4: Actualizar `.dockerignore`**

Cambiar `Dockerfile` a `Dockerfile` y `Dockerfile.dev` a `Dockerfile.dev`.

- [ ] **Step 5: Verificar que el build sigue pasando**

Run: `COMPOSE_ENV=prod bash ./scripts/compose.sh build && COMPOSE_ENV=dev bash ./scripts/compose.sh build`

Expected: ambos builds exitosos.

- [ ] **Step 6: Commitear**

```bash
git add Dockerfile Dockerfile.dev compose.prod.yml compose.dev.yml .dockerignore
git commit -m "chore: rename Dockerfile to Dockerfile for Render compatibility"
```

---

### Task 2: Crear `render.yaml`

**Files:**
- Create: `render.yaml`

- [ ] **Step 1: Escribir `render.yaml`**

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

- [ ] **Step 2: Validar el YAML**

Run: `python3 -c "import yaml; d=yaml.safe_load(open('render.yaml')); print('YAML válido'); print('services:', [s['name'] for s in d['services']]); print('autoDeploy:', d['services'][0]['autoDeploy'])"`

Expected: `YAML válido`, `services: ['blinka-payagent']`, `autoDeploy: False`.

- [ ] **Step 3: Commitear**

```bash
git add render.yaml
git commit -m "feat(infra): add render.yaml blueprint for docker deployment"
```

---

### Task 3: Añadir job `deploy` al workflow de CI

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Añadir el job `deploy`**

Añadir al final del archivo (después de `build-image`):

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

- [ ] **Step 2: Validar el YAML**

Run: `python3 -c "import yaml; d=yaml.safe_load(open('.github/workflows/ci.yml')); print('YAML válido'); print('jobs:', list(d['jobs'].keys()))"`

Expected: `YAML válido`, `jobs: ['verify', 'build-image', 'deploy']`.

- [ ] **Step 3: Commitear**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add render deploy trigger after verify and build"
```

---

### Task 4: Actualizar documentación (find-and-replace)

**Files:**
- Modify: `AGENTS.md`, `README.md`, `docs/backlog_implementacion_mvp.md`, `docs/propuesta_modelo_ER_faktur.md`, `docs/decisiones/0001-stack-ts-node-react.md`, `docs/superpowers/specs/*.md`, `docs/superpowers/plans/*.md`

- [ ] **Step 1: Reemplazar `Dockerfile` por `Dockerfile` en docs**

Run: `sed -i 's/Dockerfile/Dockerfile/g' AGENTS.md README.md docs/backlog_implementacion_mvp.md docs/propuesta_modelo_ER_faktur.md docs/decisiones/0001-stack-ts-node-react.md docs/superpowers/specs/*.md docs/superpowers/plans/*.md`

Nota: `Dockerfile.dev` se convierte en `Dockerfile.dev` con este sed. Eso está bien porque es consistente.

- [ ] **Step 2: Verificar que no quedan referencias a `Dockerfile`**

Run: `grep -rn "Dockerfile" --include="*.yml" --include="*.yaml" --include="*.sh" --include="*.md" --include="*.ts" --include="*.tsx" --include="*.json" . | grep -v node_modules | grep -v ".superpowers"`

Expected: sin salida.

- [ ] **Step 3: Verificar build**

Run: `COMPOSE_ENV=prod bash ./scripts/compose.sh build && COMPOSE_ENV=dev bash ./scripts/compose.sh build`

Expected: ambos builds exitosos.

- [ ] **Step 4: Commitear**

```bash
git add -A
git commit -m "docs: update references from Dockerfile to Dockerfile"
```

---

### Task 5: Verificación final

- [ ] **Step 1: Verificar que el build de producción sigue pasando**

Run: `COMPOSE_ENV=prod bash ./scripts/compose.sh build`

Expected: imagen construida sin errores.

- [ ] **Step 2: Verificar que `just check` pasa**

Run: `bash ./scripts/compose.sh exec app npm run typecheck && bash ./scripts/compose.sh exec app npm run lint && bash ./scripts/compose.sh exec app npm test`

Expected: typecheck limpio, lint limpio, tests pasando.

- [ ] **Step 3: Verificar que los YAML son válidos**

Run: `python3 -c "import yaml; yaml.safe_load(open('render.yaml')); yaml.safe_load(open('.github/workflows/ci.yml')); print('YAMLs válidos')"`

Expected: `YAMLs válidos`.

- [ ] **Step 4: Verificar que no quedan referencias a `Dockerfile`**

Run: `grep -rn "Dockerfile" --include="*.yml" --include="*.yaml" --include="*.sh" --include="*.md" --include="*.ts" --include="*.tsx" --include="*.json" . | grep -v node_modules | grep -v ".superpowers"`

Expected: sin salida.

---

## Self-Review

1. **Spec coverage:** el spec tiene 12 secciones. Task 1 cubre §6 (renombrar). Task 2 cubre §7 (render.yaml). Task 3 cubre §7.1 (trigger CI). Task 4 cubre §6 (docs). Task 5 cubre §9 (criterio de aceptación). Cubierto.

2. **Step scan:** cada paso tiene comando y expected. Sin "TBD".

3. **Type consistency:** no aplica (no hay código TypeScript nuevo).

4. **Review Focus:** los cinco puntos tienen su verificación en las Tasks 1, 2 y 5.

5. **Proportion:** el plan es razonable para 5 archivos nuevos/modificados + docs.

## Execution Handoff

Plan completo y guardado en `docs/superpowers/plans/2026-10-17-render-deploy.md`. Revisalo. ¿Captura lo que quieres?

La ejecución será con el método que ya elegiste (**Native**): yo implemento cada paso en esta sesión y un revisor final revisa toda la rama. ¿Procedo con la implementación?