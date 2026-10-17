# Datos de la demo: perfiles, reset y pantalla `/datos`

La demo necesita dos cosas distintas: datos de referencia estables (proveedores,
política, presupuestos, tipos de cambio) y un set de facturas que muestre los
tres veredictos del motor de reglas. Este documento describe los perfiles de
siembra, qué borra el reset y cómo se habilita.

> **Herramienta de demo, no de producción con datos reales.** El reset borra la
> base completa y el contenido de `data/uploads/`. No hay backup ni deshacer.

## Perfiles de siembra

`POST /api/admin/db/reset` y la pantalla `/datos` aceptan un `profile`. El
reset siempre reaplica el schema y el seed base; el perfil decide qué se agrega
después.

| Perfil      | Qué siembra                                                                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reference` | Solo datos de referencia: 6 categorías, 8 proveedores, política `v1` activa, 6 presupuestos por categoría y 4 tipos de cambio. **Sin facturas.**                |
| `demo`      | Todo lo anterior más los 12 `fixtures/TC-*.json` procesados por el pipeline real (ingesta, extracción y motor de reglas), con sus aprobaciones y asientos.       |

Conteos esperados después de cada perfil:

| Tabla                     | `reference` | `demo` |
| ------------------------- | ----------- | ------ |
| `categories`              | 6           | 6      |
| `vendors`                 | 8           | 8      |
| `policies`                | 1 (`v1`)    | 1      |
| `policy_category_budgets` | 6           | 6      |
| `fx_rates`                | 4           | 4      |
| `invoices`                | 0           | 11     |
| `ingest_attempts`         | 0           | 12     |
| `line_items`              | 0           | 12     |
| `decisions`               | 0           | 12     |
| `approvals`               | 0           | 6      |
| `ledger_entries`          | 0           | 3      |
| `notifications`           | 0           | 6      |

En `demo`, TC-03 es un reenvío duplicado: suma un intento y una decisión, pero
no una factura nueva. Por eso hay 12 fixtures y 11 facturas. Los veredictos
quedan en 3 PAGAR, 3 FRENAR y 6 ESCALAR, con 4 aprobaciones pendientes en la
bandeja.

## Qué borra el reset

El reset es total e irreversible:

- `data/faktur.db`, `data/faktur.db-wal` y `data/faktur.db-shm` (los sidecars
  de WAL se borran siempre, existan o no datos pendientes en ellos).
- El **contenido** de `data/uploads/`. El directorio se conserva vacío; el
  resto de `data/` no se toca.
- No preserva nada del estado anterior: ni la política editada desde
  `/reglas`, ni las aprobaciones, ni los intentos de ingesta. Todo se re-siembra
  según el perfil elegido.

## Cómo se habilita

| Entorno             | Configuración                                                                 |
| ------------------- | ----------------------------------------------------------------------------- |
| Desarrollo (compose) | `compose.dev.yml` ya define `ALLOW_DB_RESET: "true"`. Sin `ADMIN_TOKEN`.      |
| Render              | `ALLOW_DB_RESET=true` y `ADMIN_TOKEN` cargado a mano en el dashboard.         |

`ALLOW_DB_RESET` es `false` por defecto. El guard no depende de `NODE_ENV`: con
el flag apagado el endpoint responde `403` en cualquier entorno. Además, si
`NODE_ENV=production` y `ADMIN_TOKEN` no está configurado, el reset queda
apagado (fail-closed): el POST responde `403 db_reset_token_missing` y nunca
queda público. Cuando sí hay token, cada POST tiene que mandarlo en el header
`x-admin-token`.

El estado actual se consulta con `GET /api/admin/db`:

```bash
curl -s localhost:3000/api/admin/db
# {"enabled":true,"reason":null,"profiles":["reference","demo"],"counts":{...},"policy_version":"v1"}
```

Si `enabled` es `false`, `reason` dice por qué: `"disabled"` (falta
`ALLOW_DB_RESET=true`) o `"missing_token"` (producción sin `ADMIN_TOKEN`).

## Endpoint `POST /api/admin/db/reset`

Body esperado:

```json
{ "profile": "demo", "confirm": "REINICIAR" }
```

`confirm` tiene que ser exactamente `REINICIAR`; es la fricción que evita un
click accidental. El header `x-admin-token` solo hace falta cuando la API tiene
`ADMIN_TOKEN` configurado.

```bash
curl -s -X POST localhost:3000/api/admin/db/reset \
  -H 'content-type: application/json' \
  -H 'x-admin-token: <token>' \
  -d '{"profile":"demo","confirm":"REINICIAR"}'
```

| Código | `error`                   | Cuándo                                                                 |
| ------ | ------------------------- | ---------------------------------------------------------------------- |
| 200    | —                         | Reset aplicado. Devuelve `profile`, `counts`, `verdicts`, `approvals_pending`, `deleted_files`, `cleared_uploads` y `duration_ms`. |
| 401    | `admin_token_invalid`     | La API tiene `ADMIN_TOKEN` y el header `x-admin-token` falta o no coincide. |
| 403    | `db_reset_disabled`       | `ALLOW_DB_RESET` no es `true`.                                          |
| 403    | `db_reset_token_missing`  | `NODE_ENV=production` sin `ADMIN_TOKEN`: el endpoint queda apagado.     |
| 422    | `invalid_reset_request`   | Body inválido: falta `profile`, `confirm` no es `REINICIAR` o el perfil no existe. |

El orden de los guards es el de la tabla: primero el flag, después el token
faltante, después el token incorrecto y por último el body. Un endpoint
apagado no filtra si el token era válido.

## Pantalla `/datos` vs receta `db-demo`

Ambas usan los mismos datos, pero **no son equivalentes**:

| Vía                          | Qué hace                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `/datos` (web)               | Reset total + siembra del perfil elegido. Pide escribir `REINICIAR`, muestra conteos y veredictos al terminar. |
| `just db-demo`               | Solo siembra el set `demo` sobre la base actual, sin borrar nada. Es idempotente: omite fixtures ya ingeridos. |

En esta máquina `just` no está instalado, así que la receta se corre con el
puente de compose:

```bash
bash ./scripts/compose.sh exec -T app npm run db:demo -w api
```

Elegí la pantalla cuando quieras partir de cero (por ejemplo, antes de una
toma) y la receta cuando la base ya esté como querés y solo falten las
facturas de demo.

Desde `/datos`, si la API pide token, el valor se guarda en
`sessionStorage["faktur.admin_token"]` para no reescribirlo en cada intento
dentro de la misma pestaña. El token no se persiste en `localStorage` ni se
manda si el campo está vacío.
