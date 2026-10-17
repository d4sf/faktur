# ADR 0002 — `min_extraction_confidence` versionada en `policies`

- **Estado:** aceptado
- **Fecha:** 2026-10-17
- **Contexto:** T14 / S11 (`docs/backlog_implementacion_mvp.md`)

## Contexto

`PolicySpec` (`api/src/domain/policy.ts`) y `specs/policy.spec.json` incluyen
`min_extraction_confidence`, el umbral de la regla 1b que convierte una extracción de baja
confianza en ESCALAR. El DDL de T3 no tenía esa columna en `policies`.

T14 recibe un `PolicySpec` completo en `PUT /api/policy` y crea una versión N+1 inmutable. Sin
una columna donde guardar el valor, el `PUT` aceptaría el campo y el `GET` devolvería siempre el
default: pérdida silenciosa de configuración, justo lo que S16 prohíbe para las versiones.

## Decisión

Agregar a `policies`:

```sql
min_extraction_confidence REAL NOT NULL DEFAULT 0.7
  CHECK (min_extraction_confidence >= 0 AND min_extraction_confidence <= 1)
```

El default `0.7` replica el de `specs/policy.spec.json` v1. `applySchema` agrega la columna con
`ALTER TABLE ... ADD COLUMN` si la base ya existía (chequeo con `PRAGMA table_info`), sin
framework de migraciones ni carpeta `api/drizzle/`.

## Consecuencias

- Cada versión de política congela también el umbral de confianza; reconstruir una decisión vieja
  no depende del valor activo.
- Una base creada antes del ADR se actualiza al arrancar, conservando sus filas.
- El seed escribe `0.7` explícito para que el contrato y la fila no divergan.
- No cambia el contrato HTTP: `PolicySpec` ya exigía el campo.
