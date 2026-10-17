# faktur-mvp — motor determinista + HITL + auditoría

> **Este archivo quedó como índice.** El backlog completo vive en `docs/backlog_implementacion_mvp.md` y pasó de 4 tareas a **26**. Los specs S1..S7 de acá se conservan tal cual y son los mismos que usa el backlog; los que faltaban (S8..S20) están agregados allá.

**Fuentes:** PRD `docs/PRD_Faktur.md` + MVP `docs/planteamiento_mvp_reto_blinka.md` + ER `docs/propuesta_modelo_ER_faktur.md` + `diagramas/*.mmd`.

## Specs

- S1: "Tres estados deterministas: PAGAR, FRENAR o ESCALAR A HUMANO" — LLM solo extrae a JSON tipado, decide código puro.
- S2: "Cero pagos aprobados fuera de política" — fail-closed, default ESCALAR nunca PAGAR.
- S3: "FRENAR ≠ ESCALAR. FRENAR es inválido no-aprobable" — HITL solo sobre ESCALAR, una sola resolución.
- S4: "Toda factura genera AuditRecord con reason_code + explicación legible" + `policy_version` obligatoria.
- S5: "Dedup doble: hash SHA-256 UNIQUE + UNIQUE(vendor_id, invoice_number)".
- S6: "Solo PAGAR final escribe ledger_entries; FRENAR y ESCALAR-pendiente no mueven saldo".
- S7: "Set de casos de prueba con veredictos según la tabla del ground truth".

## Tasks

Estas cuatro se reopen como tareas del backlog, con el alcance ampliado:

| De acá                                                     | Ahora       | Cambio                                                                                                           |
| :--------------------------------------------------------- | :---------- | :--------------------------------------------------------------------------------------------------------------- |
| T1 — congelar `specs/policy.spec.json` v1                  | **T2**      | Se le suma el enum de 10 `reason_code` y la tabla de precedencia escrita como datos, no como prosa.              |
| T2 — seed `fixtures/TC-*.json` + `ground_truth.json`       | **T4**      | El set pasa de 10 a **11 casos**: se agrega TC-11 (beneficiario bloqueado), que dejaba la regla 3 sin demostrar. |
| T3 — validar motor contra fixtures en memoria sin LLM      | **T5 + T6** | Se separa el motor (función pura) del runner que lo evalúa, para poder iterar el motor sin tocar el test.        |
| T4 — cablear `decisions.policy_version` + CSV reproducible | **T7 + T8** | El CSV pasa a una fila por decisión y suma el intento de ingesta duplicado.                                      |

El resto del backlog (T1, T3, T9..T26) es nuevo: persistencia, ingesta, extracción, API, HITL, notificación, web y cierre.

## Log

- L1: pedido original verbatim: "dame las instrucciones paso a paso para crear el esqueleto sdd"
- L2: el esqueleto se creó, pero quedó en `docs/` sin ejecutar. `specs/` y `fixtures/` siguen vacíos.
- L3: se pidió desglosar el MVP en tareas implementables. Salió `docs/backlog_implementacion_mvp.md` con 26 tareas, 20 specs y grafo de dependencias.
- L4: se resolvieron las 6 decisiones de producto (Q1-Q5 de backlog §7) y se actualizaron `docs/propuesta_modelo_ER_faktur.md` y `diagramas/er.{mmd,dbml}`.
