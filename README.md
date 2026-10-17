# Blinka PayAgent

Agente que revisa facturas y decide PAGAR / FRENAR / ESCALAR. El LLM solo
extrae datos; la decisión la toma un motor de reglas determinista.

Este repo contiene el entorno de desarrollo y el esqueleto técnico (API
TypeScript + UI React). La lógica del producto vive en `api/src` y `web/src`.

## Requisitos

- Podman (o Docker) con Compose
- `just`
- Opcional: `.env` a partir de `.env.example` para cambiar puertos

## Arranque

```bash
just up        # dev: API en :3000, UI en :5173
just logs      # seguir logs
just down      # detener
```

No hace falta Node en el host: dependencias, typecheck, lint y tests corren
dentro del contenedor.

## Comandos

| Comando                | Qué hace                                 |
| ---------------------- | ---------------------------------------- |
| `just up` / `just dev` | Levanta dev en background / primer plano |
| `just logs`            | Sigue logs                               |
| `just shell`           | Shell dentro del contenedor              |
| `just install`         | `npm install` dentro del contenedor      |
| `just check`           | Typecheck + lint + tests                 |
| `just build-prod`      | Construye la imagen de producción        |
| `just prod`            | Levanta producción en `:3000`            |

## Imágenes

- `Containerfile.dev`: Node 22 + dependencias, hot reload; el código se monta
  como volumen y `node_modules` queda en un volumen nombrado.
- `Containerfile`: multi-stage (deps → build → runtime), sirve la UI compilada
  desde la API y corre como usuario no root.

La decisión de stack y su justificación están en
`docs/decisiones/0001-stack-ts-node-react.md`.
