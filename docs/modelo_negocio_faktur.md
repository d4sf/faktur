# Modelo de negocio — Faktur / Blinka PayAgent

> **Reto:** Blinka — Agentes que pagan por la empresa
> **Equipo:** KAY/O
> **Documento:** modelo de negocio y monetización
> **Versión:** v1.0 — 16/10/2026

---

## 1. Resumen ejecutivo

Faktur vende **confianza operativa en cuentas por pagar**: un agente que decide
pagar, frenar o escalar cada factura dentro de reglas que la empresa define, y
que deja un registro que cualquiera entiende sin abrir el código.

El negocio se cobra en **tres capas**, en este orden:

1. **SaaS** (hoy): suscripción mensual por volumen de facturas procesadas.
2. **Uso y expansión** (hoy): excedentes, usuarios, implementación y pack de auditoría.
3. **Comisión por pago** (después): cuando el pago se ejecute sobre la rail de
   Blinka, un porcentaje del volumen. Es la capa más grande, y la razón
   estratégica por la que Blinka debería querer este producto.

**Frase de posicionamiento:**

> No vendemos un dashboard de facturas. Vendemos cero pagos fuera de reglas, y
> somos la puerta de entrada para que los pagos de la empresa pasen por Blinka.

**Honestidad de alcance:** el reto termina en la decisión (sección 05 del
enunciado: no se mueve dinero real). Por eso la capa 3 se presenta como
**roadmap habilitado por Blinka**, no como ingreso del entregable. La capa 1 y 2
sí son cobrables con lo que se entrega.

---

## 2. Qué se vende y a quién

**Cliente:** empresas constituidas en EE. UU. que operan en varios países, con
equipo, proveedores y contratistas en LATAM. Equipos de finanzas con decenas a
pocos cientos de pagos por mes.

**Comprador:** CFO, Controller o dueño. **Usuario diario:** analista de cuentas
por pagar. **Usuario ocasional:** aprobador y auditor.

**Dolor cuantificado (fuentes del PRD):**

| Dolor | Dato |
|---|---|
| Costo de conciliación manual | $10–23 USD por factura (IOFM) |
| Ciclo promedio de pago | 11,6 días (Ardent Partners) |
| Tiempo del equipo | +10 h/semana en tipeo y conciliación (56% de los equipos, IFOL) |
| Riesgo | pagos duplicados, proveedor fantasma, sobregiro de presupuesto |

**Lo que el cliente compra, en sus palabras:** "que el agente pague solo lo que
debe, que nunca se pase de los límites y que yo pueda explicar cada decisión".

---

## 3. Propuesta de valor por rol

| Rol | Qué necesita | Qué obtiene con Faktur |
|---|---|---|
| CFO / Controller | control, cero fraude, ROI visible | Touchless Rate, saldo, ahorro, política auditable |
| Analista AP | dejar de tipear y conciliar | extracción automática y cola de excepciones |
| Aprobador (HITL) | decidir rápido con contexto | tarjeta con motivo, regla y monto; aprobar/negar en un clic |
| Auditor / Compliance | trazabilidad | audit trail con versión de política, hash y razón legible |

**Diferenciador comercial:** el motor de decisión es **determinista** y
*fail-closed* (si no se puede verificar, no se paga). Eso convierte "cero pagos
fuera de reglas" en un hecho verificable, no en una promesa. Es lo que hace al
producto **vendible y asegurable**: un CFO no compra autonomía, compra autonomía
con freno.

---

## 4. Modelo de negocio en tres capas

### Capa 1 — SaaS: suscripción por volumen procesado

Se cobra por **facturas procesadas al mes**, no por usuario. La métrica de cobro
acompaña al valor (más facturas = más ahorro) y no frena la adopción interna.

| Plan | Precio/mes | Facturas incluidas | Costo implícito | Usuarios |
|---|---|---|---|---|
| Starter | $99 | 100 | $0,99 | 3 |
| Growth | $299 | 500 | $0,60 | 10 |
| Scale | $799 | 2.000 | $0,40 | 25 |
| Enterprise | desde $1.900 | 6.000 | $0,32 | ilimitado |

- **Excedente:** $0,50 / $0,35 / $0,25 por factura según plan; Enterprise negociado.
- **Facturación anual:** 15–20% de descuento (mejora caja y reduce churn).
- **Cobro en USD** a la entidad de EE. UU., tarjeta o ACH.
- **Fair use:** el plan Enterprise incluye "usuarios ilimitados" con uso razonable
  para evitar cuentas usadas como agencia.

### Capa 2 — Uso y expansión de cuenta

| Ítem | Precio | Cuándo se vende |
|---|---|---|
| Usuario aprobador/auditor extra | $19 / usuario / mes | equipos grandes |
| Implementación y carga de políticas | $1.500–4.000 one-time | todo cliente nuevo (no gratuito) |
| Pack Auditoría & Compliance | $149–399 / mes | empresas con auditor externo o SOC 2 |
| Multi-entidad / multi-moneda | $249 / mes | grupos con varias sociedades |
| SLA y soporte prioritario | 15–20% del contrato | Enterprise |
| Red de riesgo de proveedores | $99–249 / mes | fase 2 (requiere base instalada) |

La implementación **no se regala**: filtra clientes que no van a usar el producto
y paga el costo real de dejar la política bien configurada (que es lo que hace
que el agente no falle).

### Capa 3 — Comisión por pago (roadmap, habilitado por Blinka)

Cuando el pago se ejecute sobre la rail de Blinka, el ingreso deja de depender
del software y pasa a depender del **volumen pagado**.

```
Ingreso por pago = Volumen pagado × % que pasa por Blinka × comisión
```

| Variable | Supuesto base | Comentario |
|---|---|---|
| Comisión | 0,5% del volumen | competitiva contra 1–3% + fijo del banco |
| Attach rate | 70% | no todo termina en la rail (frenos, proveedores, pagos locales) |
| Costo de rail y FX | ~40% del ingreso por pago | margen bruto ~60% en pagos |

**Por qué el cliente lo acepta:** hoy ya paga por mover dinero. Una
transferencia internacional LATAM → EE. UU. cuesta $25–50 fijos + 1–3% de cambio.
Con un ticket de $1.800, el banco cobra ~$45–110; una comisión de 0,5% son ~$9.
No es un costo nuevo: es un reemplazo más barato, y encima queda conectado a la
decisión y al registro.

**Por qué es la capa estratégica:** el software es el anzuelo; el pago es el
negocio. Es el modelo de Stripe, Ramp y Bill.com: software barato o gratis para
capturar volumen de pagos.

**Reparto con Blinka:** la comisión la cobra Blinka (es quien tiene licencias,
FX y rail). Opciones a acordar: *revenue share* (p. ej. 30–50% para Faktur) o
licencia/adquisición del producto. Para el pitch alcanza con declarar la alianza:
"el software lo construimos nosotros, la rail es de Blinka, el ingreso por pago
se reparte".

---

## 5. Anclaje de precio: por qué es fácil decir sí

El precio se ancla contra el **costo manual actual**, no contra otro software.

| Facturas/mes | Costo manual ($10–23) | Ahorro estimado | Plan Faktur | Precio como % del ahorro |
|---|---|---|---|---|
| 60 | $600–1.380 | $480–1.100 | Starter $99 | 9–21% |
| 250 | $2.500–5.750 | $2.000–4.600 | Growth $299 | 6–15% |
| 1.000 | $10.000–23.000 | $8.000–18.400 | Scale $799 | 4–10% |

**Mensaje de venta:** "te ahorro entre $8 y $19 por factura y te cobro menos de
$1". El cliente no compara Faktur con un gasto de software: lo compara con su
planilla de sueldos.

---

## 6. Caso base: empresa tipo del segmento

Supuestos: **250 facturas/mes**, ticket promedio **$1.800**, proveedores en LATAM.

| Línea | Mes | Año |
|---|---|---|
| Volumen pagado | $450.000 | $5.400.000 |
| **Ingreso SaaS (Growth)** | **$299** | **$3.588** |
| **Ingreso por pago** (70% × 0,5%) | **$1.575** | **$18.900** |
| **Ingreso total por cliente** | **$1.874** | **$22.488** |
| Costo de servir (infra + LLM) | ~$1 | ~$12 |
| Costo de rail y FX (si hay pagos) | ~$630 | ~$7.560 |

Lectura: **el 84% del ingreso por cliente viene del pago, no del software.**
El SaaS cubre la operación; el pago construye el negocio.

---

## 7. Unit economics

**SaaS (cobrable con el entregable actual):**

| Métrica | Valor | Supuesto |
|---|---|---|
| ARPA (Growth) | $299 / mes | plan medio |
| Costo marginal | <$0,01 por factura | $15–20/mes de infra para 10k facturas (PRD) |
| Margen bruto | >95% | sin contar soporte |
| Churn mensual | 2% | SMB con onboarding asistido |
| LTV | ~$13.900 | ARPA × 93% / 2% |
| CAC | $2.000–3.000 | venta directa asistida |
| LTV / CAC | 4,6–7,0 | objetivo >3 |
| Payback | 7–11 meses | CAC / ingreso bruto mensual |

**Con capa de pagos activa:** ARPA sube a ~$1.874 y el LTV se multiplica por
~5, con margen bruto menor (~60% en la porción de pagos, >95% en software).

---

## 8. Proyección ilustrativa (escenario base, no promesa)

Supuestos: ARPA SaaS constante en $299; churn 2%/mes; 70% de attach cuando la
capa de pagos está activa; sin contratos Enterprise.

| Año | Clientes | Con pagos activos | Ingreso SaaS | Ingreso por pago | Total |
|---|---|---|---|---|---|
| 1 | 20 | 0 (roadmap) | $72k | $0 | **$72k** |
| 2 | 60 | 60% | $215k | $680k | **$895k** |
| 3 | 150 | 75% | $538k | $2,12M | **$2,65M** |

El año 1 es deliberadamente conservador: solo software, el ingreso que el
entregable puede sostener sin mover dinero.

---

## 9. Go-to-market

**Entrada (land):**
- **Auditoría gratis de las últimas 100 facturas** como imán: el prospecto ve en
  su propio set cuántos pagos se habrían frenado o escalado. Convierte el miedo
  en evidencia.
- Piloto de 30 días con precio cerrado y métricas de salida (Touchless Rate,
  cero pagos fuera de regla, tiempo por factura).

**Canales:**
- **Blinka** como canal natural: su base de clientes ya paga cross-border.
- **Firmas contables y BPO** (manejan decenas de clientes): licencia por cliente
  con revenue share.
- **ERPs y herramientas de gasto** (QuickBooks, Xero): integración como
  complemento, no competencia.

**Expansión (expand):**
- De decisión → pago (activar capa 3) es la palanca de mayor ingreso.
- De una entidad a multi-entidad.
- De finanzas a compras (aprobación de compromisos, no solo facturas).

---

## 10. Por qué esto se defiende (moat)

1. **Confianza demostrable:** motor determinista + audit trail reproducible por
   versión de política. Un competidor con LLM decidiendo no puede prometer "cero
   pagos fuera de reglas".
2. **Costo de cambio:** la política configurada y el historial de decisiones son
   del cliente y viven en el producto.
3. **Efecto de red de datos:** reputación de proveedores compartida entre
   clientes (fase 2) mejora con cada cuenta.
4. **Canal de pagos:** quien captura la decisión captura el pago. Es la ventaja
   que Blinka ya tiene y que un SaaS puro no puede replicar.

---

## 11. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Ramp/Bill dan AP gratis fondeado por interchange | presión de precio en SaaS | foco en cross-border LATAM, donde no compiten; valor en el pago |
| Sin pagos reales en v1, la capa 3 es una promesa | credibilidad en el pitch | presentarla como roadmap con Blinka como rail, con números y supuestos explícitos |
| Churn SMB | LTV bajo | implementación paga + onboarding asistido + precio anual |
| Precio por factura castiga al cliente grande | techo de ingreso | Enterprise negociado y descuento por volumen |
| Error del agente en un pago | pérdida de confianza | fail-closed, HITL obligatorio sobre umbral, cero PAGAR sin regla cumplida |
| Dependencia de un solo canal (Blinka) | riesgo comercial | canales propios (contadores, ERPs) en paralelo |

---

## 12. Alineación con el reto Blinka

| Criterio del reto | Cómo lo usa el modelo de negocio |
|---|---|
| **Autonomía** | define el valor: más Touchless Rate = más ahorro = más disposición a pagar |
| **Seguridad (cero pagos fuera de reglas)** | es el activo vendible; habilita auditoría, SLA y eventualmente seguro |
| **Explicabilidad** | sostiene el pack de auditoría y el precio Enterprise |
| **Reglas configurables** | justifica la implementación paga y el costo de cambio |
| **No mover dinero real** | delimita la capa 3 como roadmap, no como ingreso actual |

---

## 13. Qué se cobra con el entregable y qué es roadmap

| Capa | Estado | Cobrable en el hackathon |
|---|---|---|
| SaaS por facturas | implementado | sí |
| Implementación / add-ons | implementable | sí (servicio) |
| Pack Auditoría | implementado (audit trail + CSV) | sí |
| Multi-entidad / FX | roadmap | no |
| Red de riesgo de proveedores | roadmap | no |
| Comisión por pago | roadmap (requiere rail de Blinka) | no |

Declarar esto separado es parte del pitch: **un modelo de negocio creíble
distingue lo que ya se cobra de lo que se va a cobrar.**

---

## 14. Resumen para la slide

1. **Qué vendemos:** cero pagos fuera de reglas, con explicación de cada decisión.
2. **Quién paga:** el CFO de empresas de EE. UU. que pagan a LATAM; hoy gastan
   $10–23 por factura.
3. **Cómo cobramos:** SaaS $99–1.900/mes por volumen + implementación y add-ons.
4. **La capa grande:** 0,5% del volumen pagado por la rail de Blinka → ~84% del
   ingreso por cliente en el caso base.
5. **Por qué ganamos:** el agente determinista es la confianza que habilita el
   pago; quien decide el pago, captura el pago.

**Cierre:** "El software es la puerta. El pago es el negocio. Blinka pone la rail,
nosotros la confianza."
