#!/bin/sh
set -e

: "${DATA_DIR:=/app/data}"
mkdir -p "$DATA_DIR" "$DATA_DIR/uploads"

# Sin -R a propósito: los archivos que crea la app ya nacen de app porque
# desde este punto corre como app. Con -R cambiaríamos el dueño también en
# el host y el usuario perdería escritura sobre sus propios archivos.
chown app:app "$DATA_DIR" "$DATA_DIR/uploads"

exec su-exec app "$@"