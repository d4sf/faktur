# AGENTS.md — Faktur / Blinka PayAgent

Agente que revisa facturas y decide PAGAR / FRENAR / ESCALAR. El LLM solo extrae
datos; la decisión la toma un motor de reglas determinista.

## Entorno

- Ejecutar todo con `just` (`just --list`). No invocar `podman compose`, `npm`
  ni `node` a mano en el host.
- `just up` levanta dev (API `:3000`, web `:5173`), `just check` corre
  typecheck + lint + tests dentro del contenedor, `just prod` prueba la imagen
  de producción.
- La decisión de stack está en
  `docs/decisiones/0001-stack-ts-node-react.md`.

## Commits: Conventional Commits, mensajes en inglés

Todo commit debe seguir el formato:

```text
<type>(<scope>): <description>
```

- **El mensaje va en inglés** (subject y body), en imperativo, minúscula y sin
  punto final.
- El subject no supera los 72 caracteres.
- El scope es opcional y nombra la parte afectada: `api`, `web`, `infra`,
  `docs`, `agents`, `diagrams`.
- Un commit = un cambio lógico. No mezclar refactors, features y formato.

### Types permitidos

| Type | Uso |
| --- | --- |
| `feat` | Nueva funcionalidad |
| `fix` | Corrección de un bug |
| `docs` | Documentación |
| `refactor` | Cambio de código sin cambiar comportamiento |
| `test` | Tests |
| `perf` | Mejora de rendimiento |
| `build` | Build, dependencias o imágenes |
| `ci` | Pipelines y automatización |
| `chore` | Mantenimiento sin impacto funcional |

### Body y breaking changes

- Si hace falta explicar el **porqué**, agregar un body en inglés separado por
  una línea en blanco.
- Cambio incompatible: `!` antes de los dos puntos y footer `BREAKING CHANGE:`
  en inglés.

```text
feat(api)!: change decision payload

BREAKING CHANGE: decisions now require policy_version.
```

### Ejemplos

```text
feat(api): add rule engine decision endpoint
fix(web): prevent duplicate approval submit
build(infra): pin node 22 base image
docs(adr): record ts/node and react stack decision
chore(agents): require conventional commits in english
```

Incorrecto:

```text
feat: cambios varios
Fix bug
docs: Actualicé el README.
```
