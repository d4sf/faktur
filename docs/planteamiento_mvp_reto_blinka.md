# Planteamiento Mínimo (MVP) — Reto Blinka

> **Complementa** a `propuesta_t_cnica_reto_blinka_agentes_que_pagan_por_la_empresa.md`.
> Ese documento es el "producto ideal"; **este es el camino más corto a un agente funcionando** con lo que ya sabemos del reto.

---

## 0. Respuesta corta

Sí, con lo que hay alcanza. Los 5 bloques que planteaste **son** el flujo del reto. Solo faltan dos piezas que la rúbrica exige explícitamente:

1. **Las reglas configurables** (el reto dice "dentro de las reglas que la empresa define"). Sin un archivo/pantalla de reglas editable, no hay reto.
2. **El registro con motivo por decisión** (explicabilidad: que el jurado entienda sin abrir el código).

Y una decisión de diseño que vale más que cualquier feature: **el motor de decisión es determinista (código), no un LLM**. El LLM solo lee el PDF y devuelve JSON. Así "cero pagos fuera de reglas" es un hecho verificable, no una promesa.

---

## 1. Alcance mínimo viable

| # | Pieza | Por qué existe | ¿Imprescindible? |
|:--|:---|:---|:---|
| 1 | Subida de facturas (PDF / imagen / JSON) | Entrada del flujo | Sí |
| 2 | Extracción a JSON estructurado (LLM multimodal) | "Leer una factura y extraer a quién, cuánto, en qué moneda y para cuándo" | Sí |
| 3 | Motor de decisión por reglas | PAGAR / FRENAR / ESCALAR | Sí |
| 4 | Reglas configurables (UI + persistencia) | "reglas configurables" del enunciado | Sí |
| 5 | Bandeja de aprobación humana | "le pida permiso a una persona" | Sí |
| 6 | Registro de decisiones + CSV | Explicabilidad y entregable | Sí |
| 7 | Notificación (Slack / webhook / correo) | Cosmético: hace visible el escalado | Deseable, no bloqueante |

Si algo hay que sacrificar, se sacrifica el **7**. El 6 no se negocia.

---

## 2. Flujo único (una sola ruta, dos salidas)

```
[1] Subir factura ──► [2] Extraer JSON ──► [3] Evaluar reglas ──┬──► PAGAR   ─┐
    (upload)            (LLM, tipado)      (código, fail-closed) │            │
                                                                 ├──► FRENAR  ─┤
                                                                 │            ├─► [6] Registro + CSV
                                                                 └──► ESCALAR ─┤
                                                                      │       │
                                                            [5] Bandeja humana ┘
                                                            Aprueba / Niega ──┘
                                                                      │
                                                            [7] Notificación (opcional)
```

Regla de oro: **si algo no se puede verificar, no se paga**. El camino por defecto termina en ESCALAR, nunca en PAGAR.

---

## 3. Contrato mínimo de la API (7 endpoints)

| Método | Endpoint | Para qué | Devuelve |
|:---|:---|:---|:---|
| `POST` | `/invoices` | Sube uno o varios archivos | `invoice_id`, estado `recibida` |
| `POST` | `/invoices/{id}/extract` | LLM → JSON validado | campos extraídos + `confianza` por campo |
| `POST` | `/invoices/{id}/decide` | Corre el motor de reglas | `PAGAR` / `FRENAR` / `ESCALAR` + motivo + regla |
| `GET` | `/invoices` | Listado con estado y motivo | tabla para la pantalla |
| `GET/PUT` | `/policy` | Ver y editar las reglas | JSON de política vigente (con versión) |
| `GET` | `/approvals?status=pendiente` | Bandeja de escalados | pendientes con contexto y motivo |
| `POST` | `/approvals/{id}` | Humano aprueba/niega | decisión humana registrada + fecha |

Extra (2 líneas de código, mucho valor): `GET /report.csv` → descarga del registro completo.

**Campos mínimos del JSON extraído:** `proveedor`, `beneficiario_id/tax_id`, `monto`, `moneda`, `fecha_emision`, `fecha_vencimiento`, `numero_factura`, `concepto`, `cuenta_destino`, `confianza`.

---

## 4. Modelo de datos (5 tablas, SQLite sobra)

- **`policy`** — versión, `limite_por_pago`, `limite_por_periodo`, `monedas_permitidas`, `beneficiarios_permitidos[]`, `beneficiarios_bloqueados[]`, `umbral_aprobacion_humana`, `monto_max_desviacion_pct`, `presupuesto_por_categoria`.
- **`invoices`** — archivo original, hash del archivo, JSON extraído, `confianza`, estado.
- **`decisions`** — `invoice_id`, veredicto, `regla_disparada`, `motivo_legible`, `policy_version`, origen (`agente` / `humano`), timestamp.
- **`approvals`** — `invoice_id`, estado (`pendiente` / `aprobada` / `negada`), quién, cuándo, comentario.
- **`ledger`** — pagos/compromisos del periodo para calcular saldo (una fila por factura aceptada; no mueve dinero real).

Todo lo que se decide se escribe con la **versión de política** usada. Eso es lo que hace la auditoría reproducible aunque las reglas cambien después.

---

## 5. Motor de decisión: orden de precedencia

El orden importa más que las reglas mismas. Se evalúa de arriba hacia abajo y **el primero que dispara gana**:

| # | Condición | Veredicto |
|:--|:---|:---|
| 1 | Datos críticos faltantes, ilegibles o ya vistos (mismo hash de archivo) | FRENAR |
| 2 | `(proveedor, numero_factura)` ya existe pagado o en trámite | FRENAR — duplicado |
| 3 | Beneficiario en lista bloqueada | FRENAR |
| 4 | Beneficiario no está en la lista permitida | ESCALAR |
| 5 | No cuadra con lo acordado (sin orden de compra/contrato, o monto > el acordado) | ESCALAR |
| 6 | Presupuesto del periodo/categoría insuficiente | ESCALAR |
| 7 | Monto > umbral de aprobación humana | ESCALAR |
| 8 | Pasa todo lo anterior | PAGAR |

Detalles que el jurado nota:
- **FRENAR ≠ ESCALAR.** FRENAR es "esto es inválido, no hay nada que aprobar". ESCALAR es "esto probablemente es válido, pero necesita un humano".
- Si el monto supera el umbral **y además** es duplicado → FRENAR (gana la precedencia más alta). Nunca se ofrece aprobar algo que ya está mal.
- Una aprobación humana **jamás** puede saltarse las reglas de freno. Solo puede desbloquear los casos de escalado. Es la restricción textual del reto.

---

## 6. Los 5 casos trampa del reto, cubiertos

| Caso trampa del enunciado | Regla | Veredicto | Evidencia en el registro |
|:---|:---|:---|:---|
| Cobro duplicado | 2 | 🔴 FRENAR | "Factura `INV-9022` ya registrada el 12/10" |
| Beneficiario nuevo fuera de la lista | 4 | 🟡 ESCALAR | "Proveedor no está en la lista permitida (policy v3)" |
| Factura que no cuadra con lo acordado | 5 | 🟡 ESCALAR | "Acordado $480, facturado $1,200 (+150%)" |
| Monto sobre el límite | 7 | 🟡 ESCALAR | "Supera el umbral de aprobación de $1,000" |
| Presupuesto del periodo insuficiente | 6 | 🟡 ESCALAR | "Saldo de la categoría: $200; factura: $450" |

Los 5 salen del mismo motor con las mismas 8 reglas. Eso se ve sólido en el pitch: no hay casos "especiales" codificados a mano.

---

## 7. El CSV de reporte — columnas exactas

`invoice_id, archivo, proveedor, beneficiario_id, monto, moneda, fecha_vencimiento, estado (PAGADA|FRENADA|ESCALADA|PENDIENTE), regla_disparada, motivo_legible, requirio_humano, decidido_por (agente|humano), policy_version, timestamp`

La columna `motivo_legible` es la que gana el criterio de explicabilidad. Redactarla en lenguaje natural, no con códigos de error.

---

## 8. Sobre Slack (tu duda)

- **Slack es gratis**: el plan Free alcanza y un *Incoming Webhook* se crea en ~10 minutos sin costo. El límite de 90 días de historial del plan gratuito no afecta una demo.
- **Pero para el hackathon no lo recomiendo como dependencia.** Un demo con red, OAuth o workspace ajeno es un demo que puede fallar en vivo.
- **Recomendación:** definir una interfaz `Notifier` con dos implementaciones:
  1. `ConsoleNotifier` / tarjeta estilo Slack renderizada en la propia pantalla (0 cuentas, 0 riesgo).
  2. `WebhookNotifier` (URL en variable de entorno) — sirve para Slack, Discord o un webhook de prueba.
- Alternativa sin cuenta: **Mailpit** (correo local) o una carpeta `outbox/` con los JSON de notificación. Sirven igual para mostrar "el agente pidió permiso".
- Si quieren Slack real y con botones: Block Kit + `interactivity` apuntando al `POST /approvals/{id}`. Es factible, pero es una hora que no aporta a los 3 criterios de la rúbrica.

**Costo/beneficio:** Slack real ≈ 45 min y riesgo de demo; tarjeta en pantalla ≈ 15 min y cero riesgo. Misma historia para el jurado.

---

## 9. Stack sugerido

| Opción | Backend | Pantalla | Extracción |
|:---|:---|:---|:---|
| **A (recomendada para velocidad)** | Python + FastAPI | Streamlit (una sola vista) | LLM multimodal con salida estructurada (Pydantic) |
| **B (alineada al doc existente)** | TypeScript/Node | Next.js API routes + una vista | LLM multimodal con salida estructurada (Zod) |

En ambas: **SQLite** y **cero autenticación**. La pantalla necesita solo 3 zonas: *subir*, *tabla de decisiones*, *reglas editables + bandeja de pendientes*.

---

## 10. Qué NO construir (para no perder el hackathon)

Pagos reales · apertura de cuentas · verificación de identidad · antifraude/cumplimiento · diseño de app de Blinka · OCR propio · autenticación · multiempresa · agente conversacional ("Ask Auditor") · dashboard con gráficos · PDFs de factura elaborados.

El agente conversacional y el simulador de sliders son buenos *extras* para el pitch, pero **después** de que exista la ruta completa subir → decidir → registrar → aprobar.

---

## 11. Set de datos de demo (se genera en ~15 min)

Un único script que produce:

- **5 facturas normales** (una recurrente, una micro-compra, una en otra moneda permitida, etc.).
- **Las 5 trampas** de la tabla de la sección 6.
- Un archivo `ground_truth.json` con el veredicto esperado de cada una, para medir autonomía en vivo ("acertó 9 de 10 sin intervención").
- Al menos **un PDF con estética de escaneo** (foto torcida, borrosa) para lucir la extracción multimodal.
- Nunca datos reales de personas o empresas: nombres ficticios obvios (`CloudServers Inc`, `Nuevo Redactor`).

El reto permite compartir el set con otros equipos; si otro equipo ya tiene uno, ahorra tiempo.

---

## 12. Checklist de aceptación (mapeado a la rúbrica)

- [ ] Subo un PDF y llega a decisión sin tocar nada → **Autonomía**
- [ ] Muevo el umbral en la pantalla y algunos PAGAR se vuelven ESCALAR → **Reglas configurables**
- [ ] Factura duplicada queda FRENADA con motivo legible → **Seguridad**
- [ ] Factura escalada aparece en la bandeja; apruebo y queda registrado quién y cuándo → **Human-in-the-loop**
- [ ] Factura con datos faltantes **no** se paga (demuestra fail-closed) → **Cero pagos indebidos**
- [ ] Descargo el CSV y cada fila tiene su motivo → **Explicabilidad**

Si los 6 están en verde, el reto está entregado, con o sin Slack.

---

## 13. Riesgos y mitigación

| Riesgo | Mitigación |
|:---|:---|
| El LLM alucina un monto o una fecha | Validación de tipos + umbral de confianza; baja confianza ⇒ ESCALAR, no PAGAR |
| Un PDF sucio no se extrae | Fallback a JSON manual en la pantalla (el flujo no se detiene) |
| La demo depende de internet/API del LLM | Conjunto de facturas ya extraídas y guardadas para el tramo final del demo |
| El jurado mueve una regla y "rompe" el demo | Versionar política y permitir volver a la versión base con un clic |

---

## 14. Orden de construcción (3 bloques)

1. **Ruta completa y fea (lo más importante).** Extraer → decidir → registrar → CSV, con JSON de entrada en vez de PDF. Al terminar este bloque ya hay "agente funcionando".
2. **Entrada real y pantalla.** PDFs/imágenes al LLM, y la vista con subir + tabla + reglas.
3. **Aprobación humana y pulido.** Bandeja, botón aprobar/negar, y recién ahí la notificación (Slack o tarjeta).

El riesgo real del reto no es la IA: es llegar al final con un dashboard precioso y sin motor de decisión. Por eso el bloque 1 va primero y sin UI.
