FROM node:22-alpine AS deps

# better-sqlite3 trae binding.gyp y no declara script `install`, así que npm le
# aplica su default `node-gyp rebuild`. `npm install` lo evita cuando el paquete
# ya está en el caché, pero `npm ci` —que es lo que corre acá— lo dispara siempre
# y aborta sin toolchain. Solo vive en esta etapa: runtime parte de una base
# limpia, así que la imagen final no carga con esto.
# Verificado por experimento: sin estas tres líneas, `npm ci` de este repo
# dispara `node-gyp rebuild` sobre better-sqlite3 y aborta con
# "Could not find any Python installation". El paquete declara `gypfile: false`
# y no expone script de instalación, así que la causa exacta del default de npm
# no está documentada; lo verificado es que el build necesita el toolchain.
# Solo vive en esta etapa: runtime parte de `node:22-alpine` limpio y no lo
# hereda (verificado: la imagen final no tiene python3, make ni g++).
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
COPY api/package.json ./api/
COPY web/package.json ./web/
RUN npm ci

FROM deps AS build

COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

# uid/gid fijos: el entrypoint hace `chown app:app` sobre un bind mount del host,
# y el resultado tiene que ser reproducible. El -g 101 no es cosmético: el grupo
# `users` ya ocupa el gid 100 en la imagen base.
RUN addgroup -S -g 101 app && adduser -S -u 100 -G app app

# su-exec baja de root a app sin meter un runtime de Go (gosu se compila).
RUN apk add --no-cache su-exec

COPY --from=build --chown=app:app /app/package.json ./package.json
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/api/package.json ./api/package.json
COPY --from=build --chown=app:app /app/api/dist ./api/dist
COPY --from=build --chown=app:app /app/specs ./specs
COPY --from=build --chown=app:app /app/web/dist ./web/dist
COPY --chmod=755 scripts/entrypoint.sh /app/scripts/entrypoint.sh

# Sin `USER app`: ese USER fijo es lo que le impediría al entrypoint arreglar
# los permisos del bind mount antes de bajar de privilegios.
ENTRYPOINT ["/app/scripts/entrypoint.sh"]

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "api/dist/server.js"]