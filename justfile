# TS/Node + React en contenedores. Usar `just <receta>`.
set dotenv-load := true
set shell := ["bash", "-uc"]

compose := "bash ./scripts/compose.sh"
api_port := env_var_or_default("API_PORT", "3000")
web_port := env_var_or_default("WEB_PORT", "5173")
app_port := env_var_or_default("APP_PORT", "3000")

default:
    @just --list

# Levanta dev (imagen dev, código montado, hot reload).
up:
    {{compose}} up -d
    @echo "Web: http://localhost:{{web_port}}  API: http://localhost:{{api_port}}/api/health"

# Levanta dev en primer plano.
dev:
    {{compose}} up

# Sigue logs (opcional: nombre del servicio).
logs servicio="":
    {{compose}} logs -f {{servicio}}

# Detiene contenedores (conserva volúmenes).
down:
    {{compose}} down

# Detiene y elimina el volumen de node_modules.
down-volumes:
    {{compose}} down -v

# Construye la imagen dev.
build:
    {{compose}} build

# Reconstruye y levanta dev.
rebuild: down
    {{compose}} up -d --build
    @echo "Web: http://localhost:{{web_port}}"

# Estado de contenedores.
status:
    {{compose}} ps

# Shell dentro del contenedor dev.
shell:
    {{compose}} exec app sh

# Reinstala dependencias dentro del contenedor.
install:
    {{compose}} exec app npm install

# Typecheck de API y web.
typecheck:
    {{compose}} exec -T app npm run typecheck

# ESLint.
lint:
    {{compose}} exec -T app npm run lint

# Prettier (escribe).
fmt:
    {{compose}} exec -T app npm run format

# Tests de la API.
test:
    {{compose}} exec -T app npm test

# Typecheck + lint + tests.
check: typecheck lint
    {{compose}} exec -T app npm test

# Carga el set demo de fixtures en la base.
db-demo:
    {{compose}} exec -T app npm run db:demo -w api

# Construye la imagen de producción.
build-prod:
    COMPOSE_ENV=prod {{compose}} build

# Levanta la imagen de producción localmente.
prod:
    COMPOSE_ENV=prod {{compose}} up -d
    @echo "App: http://localhost:{{app_port}}"

# Detiene la instancia de producción.
prod-down:
    COMPOSE_ENV=prod {{compose}} down

# Muestra puertos y modo.
env-info:
    @echo "COMPOSE_ENV={{env_var_or_default('COMPOSE_ENV', 'dev')}}"
    @echo "API: http://localhost:{{api_port}}  Web: http://localhost:{{web_port}}"
    @echo "Prod: http://localhost:{{app_port}}"
