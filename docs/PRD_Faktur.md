# PRD — Faktur / Blinka PayAgent
### Copiloto de gobernanza financiera autónoma con guardrails deterministas

> **Equipo:** KAY/O
> **Reto:** Blinka — Agentes que pagan por la empresa
> **Versión:** v1.0 — 17/10/2026
> **Estado:** Borrador para revisión
> **Stack objetivo:** Python (FastAPI / Pydantic / Google GenAI SDK) + React (Vite / Tailwind CSS / Shadcn UI / Bento Grid)
> **Metodología:** Spec-Driven Development (SDD)

---

## 0. Decisiones posteriores a este documento

> **Este PRD queda como registro de lo que se propuso el 17/10/2026.** Su texto no se editó. Para lo que se va a construir la fuente de verdad es `docs/backlog_implementacion_mvp.md`, y para el modelo de datos `docs/propuesta_modelo_ER_faktur.md`.
>
> Al aterrizar el backlog se tomaron decisiones que contradicen este documento. La tabla las lista para que nadie las lea como errores del backlog.

| § de este PRD | Qué dice acá | Qué se decidió | Dónde |
|:--|:---|:---|:---|
| Cabecera, §3.1 | Stack objetivo Python (FastAPI / Pydantic) | **TypeScript/Node** con Fastify 5 y React 19. El ADR `0001` ya lo había decidido antes de que este documento se escribiera; el MVP §9 recomienda Python, pero no aplica. | `docs/decisiones/0001-stack-ts-node-react.md` |
| RF-2.1 | `gemini-1.5-flash` | **`gemini-3.8-flash`.** La familia 1.5 está apagada: no figura ni como histórico en la [página oficial de deprecaciones](https://ai.google.dev/gemini-api/docs/deprecations). | Backlog §8, T10 |
| RF-4 | Precedencia con el presupuesto en la regla 2 como FRENAR | **La tabla de `diagramas/ds01`.** Las reglas 1-3 son frenos duros y las 4-7 escalables, así que el sobregiro de presupuesto **se escala** con un humano. Este PRD era el único documento que se contradecía. | Backlog §5 |
| RF-4 | Defaults con whitelist de 3 proveedores | **8 proveedores**, derivados del set de casos. Con 3, la regla 4 dispara antes que la regla que cada caso narraría. | ER §2.1, backlog §6.1 |
| RF-1 + RI-1 | `file_hash UNIQUE` y a la vez un veredicto FRENAR persistido para el duplicado | **Tabla `ingest_attempts`**: la factura canónica queda `UNIQUE` y todo reenvío se registra y se frena, en vez de rechazarse en silencio. | ER §2.3, backlog §7 Q1 |
| RF-4, §7 | Presupuesto mensual único, presupuesto por categoría implícito | **La categoría vive en `vendors.category`** y gobierna la segunda mitad de la regla 6 contra `policy_category_budgets`. | ER §2.1, backlog §7 Q3 |
| RF-5, Apéndice A | 9 `reason_code`, con `ERR_BUDGET_OVERRUN` como FRENAR | **10 `reason_code`.** `ERR_BUDGET_OVERRUN` queda sin uso; entran `ALERT_BUDGET_OVERRUN` y `ALERT_LOW_CONFIDENCE`. | ER §2.8.1 |
| §7 | 10 casos de prueba | **11 casos.** Se agrega TC-11 (beneficiario bloqueado), que no tenía caso y por lo tanto dejaba la regla 3 sin demostrar. | Backlog §6.2 |
| §10 | `schemas.py`, `policy_engine.py`, `main.py` | Equivalentes TS: `api/src/domain/schemas.ts`, `api/src/domain/ruleEngine.ts`, `api/src/server.ts`. | Backlog T1, T2, T5 |
| §11 | 5 preguntas abiertas al dueño del producto | **3 respondidas:** si el presupuesto frena duro o escala (→ escala, §11.3), si es mensual o por categoría (→ ambos, §11.1), y si el umbral es por empresa o categoría (→ por empresa, con categoría debajo, §11.1). Siguen abiertas la blacklist real (§11.2), el envío real de "Solicitar Corrección" (§11.4) y el destino del piloto (§11.5). | Backlog §5 y §7 |

---

## 1. Resumen del producto

### 1.1 Problema
Las empresas constituidas en EE. UU. que operan con contratistas y proveedores globales (especialmente en LATAM) sufren:
- Revisión manual de facturas dispares (PDF, imágenes, recibos, mensajes por chat).
- Riesgo constante de pagos duplicados, fraude por proveedor fantasma y sobregiros de presupuesto.
- Conciliación manual tardía y costosa: **$10–23 USD por factura** (IOFM) y **11.6 días** de ciclo promedio (Ardent Partners).
- Más del **56% de los equipos financieros dedica +10 h/semana** a tipeo y conciliación (IFOL).

### 1.2 Visión
**Faktur (Blinka PayAgent)** es el cerebro decisorio de confianza para cuentas por pagar. No ejecuta transferencias bancarias reales. Evalúa, clasifica y audita cada factura entrante en tres estados deterministas:

- 🟢 **PAGAR** — procesamiento touchless, sin intervención humana.
- 🔴 **FRENAR** — bloqueo por riesgo crítico (fraude, duplicado, datos inválidos, sobregiro).
- 🟡 **ESCALAR** — requiere autorización humana (Human-in-the-Loop).

Principio rector: **Zero-Trust Financial Automation**. El LLM solo percibe y extrae datos a JSON tipado. La decisión de dinero la toma código puro, auditable y sin alucinación.

### 1.3 Objetivos del producto (SMART para demo + piloto)
1. Procesar el 100% de facturas conformes a política de forma autónoma en **< 2 segundos** por documento (meta: < 1.8 s en flujo touchless).
2. **Cero pagos aprobados fuera de política.** Toda decisión PAGAR debe pasar todas las compuertas del motor determinista.
3. Reducir el costo por factura a **$2–4 USD** (ahorro 70–80%) y automatizar hasta el **75% de facturas estándar**.
4. Toda decisión debe ser explicable por un no-técnico: audit trail + narrativa en lenguaje natural.
5. Costo de demo/hackathon: **$0.00 USD**. Costo operativo objetivo en producción: **~$15–20 USD/mes para 10.000 facturas/mes**.

---

## 2. Usuarios y stakeholders

| Persona | Necesidad principal | Qué usa en Faktur |
|---|---|---|
| **CFO / Tesorero** | Control de presupuesto, cero fraude, ROI visible | KPIs (Touchless Rate, saldo, ahorro), Policy Controller, Ask Auditor |
| **Analista AP / Finanzas** | Dejar de tipear y conciliar a mano | Dropzone, tabla de auditoría, resolución rápida de excepciones |
| **Supervisor aprobador (HITL)** | Decidir rápido casos dudosos con contexto | Modal HITL, tarjeta estilo Slack, botones Autorizar/Rechazar |
| **Auditor / Compliance** | Trazabilidad total, razón formal por decisión | Audit trail inmutable, reason codes, hash SHA-256, explicaciones |
| **Jurado Blinka (demo)** | Ver autonomía, seguridad y explicabilidad en vivo | Simulador de políticas en caliente, casos trampa, Ask Auditor |

**Anti-persona:** el agente nunca sustituye al banco ni al ERP contable. No mueve dinero real en v1.

---

## 3. Alcance

### 3.1 Dentro de alcance (v1)
- Ingesta por Dropzone UI: PDF, imagen, Mock JSON.
- Extracción multimodal con Gemini 1.5 Flash + `response_schema` estricto, `temperature=0.0`.
- Validación Pydantic: campos obligatorios, fechas ISO-8601, moneda ISO 4217.
- Normalización de moneda a USD en memoria (USD, MXN, COP, EUR).
- Detección de duplicados por hash SHA-256 + tupla `(vendor_tax_id, invoice_number)`.
- Motor determinista de políticas contra `spec.json` / `PolicyEngine` en memoria.
- Clasificación PAGAR / FRENAR / ESCALAR con `reason_code` + explicación legible.
- Dashboard Bento Grid de alta densidad + tabla de auditoría en tiempo real.
- Panel HITL: modal de intervención + acciones humanas que mutan estado.
- Policy Controller: sliders de umbrales con efecto en vivo (para demo).
- Ask Auditor / Ask-Why: consulta en lenguaje natural del porqué de una decisión.
- Persistencia local: SQLite / DuckDB (migrable a PostgreSQL).
- API REST: `POST /api/invoices/process`, `GET /api/audit-trail`, `POST /api/invoices/{id}/human-action`.
- Set de 10 casos de prueba sintéticos para demo.

### 3.2 Fuera de alcance (no-objetivos v1)
- Ejecución de pagos reales (SPEI, ACH, SWIFT, stablecoins, etc.).
- Integración bancaria / ERP (NetSuite, QuickBooks, SAP) — solo vía webhook futuro.
- OCR propio, Totales vs. line-items con tolerancia contable compleja, retenciones/IVA por país.
- Multi-empresa, multi-rol con RBAC, SSO, o multi-moneda total (solo 4 monedas en v1).
- Detección ML de fraude conductual más allá del vendor drift del 40%.
- App móvil nativa. Solo web responsive.

---

## 4. Requerimientos funcionales

### RF-1 — Ingesta de documentos
- **RF-1.1:** El usuario puede arrastrar o seleccionar un archivo (PDF, PNG/JPG, JSON mock) en el Dropzone.
- **RF-1.2:** El sistema calcula `SHA-256` del archivo al recibirlo, antes de llamar al LLM.
- **RF-1.3:** El sistema muestra estado de carga ("Analizando documento...") y bloquea doble envío.
- **Criterio de aceptación:** Subir el mismo archivo dos veces genera el segundo veredicto `ERR_DUPLICATE_INVOICE` sin re-evaluar política.

### RF-2 — Extracción estructurada (percepción, no decisión)
- **RF-2.1:** Invocar a Gemini 1.5 Flash multimodal con `response_mime_type="application/json"`, `response_schema=ExtractedInvoice`, prompt de normalización de fechas a `YYYY-MM-DD`.
- **RF-2.2:** Esquema canónico `ExtractedInvoice`: `invoice_number`, `vendor_name`, `vendor_tax_id`, `issue_date`, `due_date`, `currency` (default USD), `subtotal`, `tax_amount`, `total_amount`, `line_items[] {description, quantity, unit_price, total}`.
- **RF-2.3:** Validar con Pydantic v2. Si falla validación → clasificar como FRENAR por inconsistencia de datos críticos.
- **Criterio de aceptación:** Ninguna decisión de dinero usa texto libre del LLM; solo el JSON validado.

### RF-3 — Normalización de moneda
- **RF-3.1:** Convertir `total_amount` a USD en memoria con tabla de tipos de cambio configurable.
- Tasas v1: `USD 1.0, MXN 0.055, COP 0.00024, EUR 1.08`.
- **RF-3.2:** Guardar tanto monto original + moneda como `amount_usd` redondeado a 2 decimales.
- **Criterio de aceptación:** Factura de €5.000 → `amount_usd = 5400.00` y evaluación posterior usa USD.

### RF-4 — Motor determinista de políticas
Orden de evaluación secuencial y excluyente (la primera regla que dispara define el veredicto):

| Orden | Regla | Condición | Veredicto | Reason Code |
|---|---|---|---|---|
| 1 | Duplicado | `doc_hash` ya visto O `vendor_tax_id:invoice_number` ya visto | 🔴 FRENAR | `ERR_DUPLICATE_INVOICE` |
| 2 | Presupuesto | `amount_usd > monthly_budget_remaining_usd` | 🔴 FRENAR | `ERR_BUDGET_OVERRUN` |
| 3 | Datos críticos / blacklist | Falta tax ID, banco incompleto, moneda no soportada, proveedor en blacklist | 🔴 FRENAR | `ERR_INVALID_DATA` / `ERR_BLACKLISTED_VENDOR` |
| 4 | Proveedor nuevo | `vendor_tax_id` no está en whitelist | 🟡 ESCALAR | `ALERT_NEW_VENDOR` |
| 5 | Umbral autónomo | `amount_usd > auto_approval_threshold_usd` (default $1.000) | 🟡 ESCALAR | `ALERT_THRESHOLD_EXCEEDED` |
| 6 | Vendor drift | `amount_usd > avg_histórico * 1.40` | 🟡 ESCALAR | `ALERT_VENDOR_DRIFT` |
| 7 | Presupuesto categoría (si aplica) | `amount_usd > saldo categoría` | 🟡 ESCALAR | `ALERT_BUDGET_TIGHT` |
| 8 | Conforme | Pasa todo lo anterior | 🟢 PAGAR | `SUCCESS_TOUCHLESS_STP` |

Parámetros por defecto v1:
- `auto_approval_threshold_usd = 1000.0`
- `monthly_budget_remaining_usd = 5000.0`
- `vendor_drift_factor = 1.40`
- Whitelist inicial: `DEVSTUDIO-LATAM (avg 850), CLOUD-SERVERS-INC (avg 420), AWS-AMAZON (avg 350)`.

Efectos de estado:
- Solo PAGAR autónomo descuenta presupuesto y registra hash+clave. FRENAR no descuenta. ESCALAR no descuenta hasta aprobación humana.
- Aprobación humana de ESCALAR → PAGAR + descuenta + sufijo `[AUTORIZADA MANUALMENTE POR SUPERVISOR]`. Rechazo → FRENAR + sufijo `[RECHAZADA MANUALMENTE POR SUPERVISOR]`.

### RF-5 — Decisión formal y explicabilidad
- **RF-5.1:** Cada factura genera un `AuditRecord`: `id (8 chars), invoice, document_hash, amount_usd, action, reason_code, explanation, created_at, human_approved?`.
- **RF-5.2:** `explanation` debe ser legible por no-técnico e incluir regla exacta, importes y comparador. Ej.: *"Se frenó porque la factura #INV-9022 ya fue pagada el 12 de octubre. Adicionalmente, el importe de $450 USD superaba el saldo restante de Infraestructura ($200 USD)."*
- **RF-5.3:** Persistir en orden LIFO para el feed (más reciente primero).

### RF-6 — Dashboard Bento Grid
- **RF-6.1 Card Health & ROI:** Touchless Rate %, Presupuesto Restante, Total Procesadas.
- **RF-6.2 Policy Controller:** sliders/inputs para umbral autónomo (y presupuesto en modo demo) con recálculo visual inmediato: facturas antes PAGAR deben mostrarse como ESCALAR si el nuevo umbral las habría retenido (simulador en caliente).
- **RF-6.3 Dropzone:** ingesta con preview y estado de carga.
- **RF-6.4 Audit Feed Table:** columnas ID/Emisor, Monto Original, Monto USD, Estado (badge), Justificación (reason_code + texto), Acción (botón Revisar solo si ESCALAR).
- **RF-6.5 Ask-Why Drawer / Modal + Ask Auditor lateral:** inspector de factura + chat de auditoría ("¿Por qué se frenó esta factura?") que responde solo con datos del `AuditRecord`, sin inventar.
- **RF-6.6 Notificación Slack-style:** en ESCALAR, tarjeta con acciones rápidas: `[Autorizar con Sobrecupo] / [Solicitar Corrección] / [Rechazar Definitivamente]` (v1: Autorizar/Rechazar funcionales; Solicitar Corrección puede ser mock).

### RF-7 — Human-in-the-Loop
- **RF-7.1:** Abrir modal al pulsar Revisar en una fila ESCALAR, mostrando emisor, importe USD, política disparada y explicación.
- **RF-7.2:** Botones `[Autorizar Pago]` y `[Rechazar]`. Una sola resolución por registro ESCALAR; tras resolver, el registro deja de ser ESCALAR.
- **RF-7.3:** `POST /api/invoices/{record_id}/human-action?approve=true|false` implementa la transición y retorna el record actualizado.
- **Criterio de aceptación:** Resolver dos veces el mismo ID no descuenta presupuesto dos veces; la segunda llamada retorna `not_found` o `already_resolved`.

### RF-8 — API y métricas
- **RF-8.1 `POST /api/invoices/process`:** multipart `file`, retorna `AuditRecord`.
- **RF-8.2 `GET /api/audit-trail`:** retorna `{ metrics {budget_remaining, threshold_limit, total_processed, touchless_rate}, records[] }`.
- `touchless_rate = PAGAR / total * 100`, 1 decimal, 0 si vacío.
- **RF-8.3 CORS abierto en demo**, listo para endurecer en piloto.

---

## 5. Requerimientos no funcionales

| Categoría | Requisito |
|---|---|
| **Rendimiento** | Ciclo touchless < 1.8 s (meta demo < 2 s). Excluye subida de red lenta. |
| **Seguridad** | LLM jamás decide dinero. Motor puro, sin `temperature`, sin prompt que autorice pagos. Hash previo a extracción. Cero pagos fuera de política. Clave Gemini solo en env (`GEMINI_API_KEY`). |
| **Explicabilidad** | 100% de decisiones con `reason_code` + narrativa. Rúbrica Blinka: autonomía, seguridad (cero errores), explicabilidad. |
| **Disponibilidad (demo)** | Localhost + Free tiers. Sin dependencia de banco/ERP. |
| **Portabilidad** | Backend Python 3.11+, Frontend Vite+TS, SQLite local → PostgreSQL sin cambio de contrato. |
| **Costos** | Demo $0 (Gemini Flash free tier 15 RPM/1500 RPD, Vercel/Cloudflare free, SQLite). Prod ~$15–20/mes @10k facturas (extracción ~$3.50 + VPS ~$7 + DB $0–10). |
| **Accesibilidad/UI** | Alta densidad legible, dark theme neutro, badges con icono+texto (no solo color), responsive 1→4 columnas. |
| **Auditoría** | Registro inmutable en v1 (append-only lógico; sin update destructivo salvo transición HITL tipada). Guardar hash para prueba de duplicidad exacta. |

---

## 6. Historias de usuario (muestra priorizada)

1. **Como analista AP, quiero arrastrar un PDF y ver en <2 s si se paga solo**, para no tipear datos.
   - CA: Subo `TC-01 ($420 CloudServers)` → badge verde Pagada + explicación conforme.
2. **Como CFO, quiero mover el umbral de $1000 a $300 y ver el impacto**, para calibrar riesgo antes de firmar la política.
   - CA: Al bajar el slider, TC-02 ($850) pasa de PAGAR a ESCALAR en la simulación.
3. **Como supervisor, quiero aprobar una excepción con un clic y dejar rastro**, para no bloquear proveedores.
   - CA: TC-04 ($3500 Growth Agency) → modal → Autorizar → pasa a PAGAR con sufijo manual y descuenta presupuesto una sola vez.
4. **Como auditor, quiero preguntar "¿Por qué se frenó AWS?" y obtener la regla exacta**, para cerrar mes sin leer logs.
   - CA: Ask Auditor responde con `reason_code`, importes y fechas del record, sin alucinar campos inexistentes.
5. **Como sistema, quiero frenar duplicados aunque cambie el nombre del archivo**, para evitar doble pago.
   - CA: Reenvío de TC-01 con distinto filename pero mismo hash o misma tupla → `ERR_DUPLICATE_INVOICE`.

---

## 7. Casos de prueba de aceptación (set demo SDD)

| ID | Proveedor | Monto | Moneda | Caso | Esperado |
|---|---|---|---|---|---|
| TC-01 | CloudServers Inc | $420 | USD | Recurrente normal | 🟢 PAGAR |
| TC-02 | DevStudio Latam | $850 | USD | Dentro de rango | 🟢 PAGAR |
| TC-03 | CloudServers Inc | $420 | USD | Duplicado de TC-01 | 🔴 FRENAR |
| TC-04 | Growth Agency | $3.500 | USD | Supera umbral $1.000 | 🟡 ESCALAR |
| TC-05 | Nuevo Redactor | $350 | USD | Desconocido | 🟡 ESCALAR |
| TC-06 | Legal Global | $5.000 | EUR | Presupuesto + FX (~$5.400) | 🟡 ESCALAR / 🔴 FRENAR* |
| TC-07 | Freelance Design | $1.200 | USD | Drift +150% sobre avg $480 | 🟡 ESCALAR |
| TC-08 | Entidad Fantasma | $900 | USD | Sin tax ID / dirección | 🔴 FRENAR |
| TC-09 | SaaS Tools Ltd | $120 | USD | Microgasto estándar | 🟢 PAGAR |
| TC-10 | DevStudio Latam | $950 | USD | Deja categoría en negativo | 🟡 ESCALAR |

\* TC-06: si `amount_usd > budget_remaining` → FRENAR (`ERR_BUDGET_OVERRUN`); si solo excede categoría/umbral → ESCALAR. El PRD exige definir el orden final antes de la demo y no cambiarlo en caliente salvo con el Policy Controller visible.

**Guion demo (45 s por acto):**
1. Autonomía: TC-01 → PAGAR en ~1.5 s.
2. Seguridad: reenvío TC-03 → FRENAR inmediato con `ERR_DUPLICATE_INVOICE`.
3. Gobernanza: TC-04 ($2.500–3.500) → ESCALAR → modal → aprobar en vivo + pregunta a Ask Auditor.

---

## 8. Métricas de éxito y ROI

- **Touchless Rate %** (PAGAR/total). Meta demo: >50% sobre set de 10. Meta piloto: 75% en facturas estándar.
- **Invoice Cycle Time:** de 11.6 días a <1.8 s (touchless).
- **Costo/factura:** de $10–23 a $2–4 (ahorro 70–80%).
- **Horas liberadas:** baseline 10 h/sem en 56% de equipos → objetivo -75% en tipeo/conciliación estándar.
- **Cero falsos PAGAR:** ningún FRENAR/ESCALAR debe convertirse en PAGAR sin pasar por HITL aprobado.

---

## 9. Supuestos, dependencias y riesgos

**Supuestos:**
- Tasas FX fijas en memoria para v1; sin FX en vivo.
- Presupuesto mensual único de $5.000 + umbral $1.000 como defaults demo.
- Gemini Flash disponible con `GEMINI_API_KEY`; fallback a JSON mock si se cae la cuota (para no romper la demo).

**Dependencias:**
- `google-genai` SDK, FastAPI, Pydantic v2, React+Vite, Tailwind, Shadcn, Lucide.

**Riesgos:**
| Riesgo | Mitigación en PRD |
|---|---|
| Alucinación del LLM afecta dinero | Separación estricta percepción/decisión; `temperature=0.0` + schema + validación Pydantic |
| Duplicado semántico (mismo gasto, distinto folio) | v1 solo hash + tupla exacta; drift y revisión humana cubren el gris; no prometer dedup fuzzy |
| Sobregiro por condición de carrera en aprobaciones | Descuento atómico en memoria; una sola transición por ESCALAR; test de doble-clic |
| Demo sin red / cuota Gemini agotada | Set JSON mock + modo offline que salta extracción y entra directo al motor |
| Scope creep (pagos reales, ERP) | Declarado fuera de alcance; cualquier pago real requiere nuevo PRD + revisión de seguridad |

---

## 10. Plan de entrega (hackathon → piloto)

- **Bloque 1 (30 min):** Contrato de datos — `schemas.py` (Pydantic), `spec.json`, 10 facturas sintéticas.
- **Bloque 2 (60 min):** `policy_engine.py` + SHA-256 + integración Gemini con `response_schema`.
- **Bloque 3 (90 min):** Integración full-stack — Dropzone → `/process`, tabla, `human-action`, badges 🟢/🔴/🟡.
- **Bloque 4 (45 min):** Pulido demo — Policy Controller en caliente, Ask Auditor, guion de 3 actos y pitch ROI.

**Definition of Done v1:** los 10 TC veredictan según tabla, el audit trail persiste, el HITL descuenta una sola vez, y cada decisión muestra `reason_code` + explicación no-técnica.

---

## 11. Preguntas abiertas para el dueño del producto

1. ¿El umbral autónomo ($1.000) y el presupuesto ($5.000) son mensuales por empresa o por categoría? TC-10 sugiere control por categoría.
2. ¿Blacklist inicial real o mock? ¿Quién la firma y con qué cadencia se actualiza?
3. En TC-06 (EUR + sobregiro): ¿FRENAR duro o ESCALAR con sobrecupo autorizable? Define el orden regla 2 vs. HITL.
4. ¿`Solicitar Corrección al Proveedor` debe enviar email/webhook real en v1 o basta mock visual?
5. Post-hackathon: ¿PostgreSQL gestionado o SQLite basta para piloto de cuántas facturas/mes?

---

## Apéndice A — Contratos de datos (resumen)

`ActionVerdict: PAGAR | FRENAR | ESCALAR`
`ReasonCode: SUCCESS_TOUCHLESS_STP | ERR_DUPLICATE_INVOICE | ERR_BUDGET_OVERRUN | ERR_INVALID_DATA | ERR_BLACKLISTED_VENDOR | ALERT_NEW_VENDOR | ALERT_THRESHOLD_EXCEEDED | ALERT_VENDOR_DRIFT | ALERT_BUDGET_TIGHT`
`AuditRecord { id, invoice: ExtractedInvoice, document_hash, amount_usd, action, reason_code, explanation, created_at, human_approved? }`

## Apéndice B — Fuentes
- `propuesta_t_cnica_reto_blinka_agentes_que_pagan_por_la_empresa.md` (visión Blinka PayAgent, matriz de reglas, diferenciadores demo).
- `faktur_master_technical_blueprint_execution_plan.md` (pipeline 9 etapas, `schemas.py`, `policy_engine.py`, `main.py`, UI Bento, costos, plan por roles).
