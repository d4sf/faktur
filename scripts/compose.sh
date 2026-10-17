#!/usr/bin/env bash
# Combina compose.yml con el overlay dev o prod y elige el motor disponible.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

cli_compose_env="${COMPOSE_ENV-}"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source <(sed 's/\r$//' .env)
  set +a
fi

COMPOSE_ENV="${cli_compose_env:-${COMPOSE_ENV:-dev}}"
export COMPOSE_ENV
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-blinka-payagent}"
unset STORAGE_DRIVER

case "$COMPOSE_ENV" in
  dev)
    overlay="compose.dev.yml"
    ;;
  prod)
    overlay="compose.prod.yml"
    ;;
  *)
    echo "COMPOSE_ENV debe ser 'dev' o 'prod' (actual: ${COMPOSE_ENV})" >&2
    exit 1
    ;;
esac

files=(-f compose.yml -f "$overlay")

if command -v podman >/dev/null 2>&1 && podman compose version >/dev/null 2>&1; then
  exec podman compose "${files[@]}" "$@"
fi

if command -v podman-compose >/dev/null 2>&1; then
  exec podman-compose "${files[@]}" "$@"
fi

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  exec docker compose "${files[@]}" "$@"
fi

echo "No se encontró podman compose, podman-compose ni docker compose." >&2
exit 1
