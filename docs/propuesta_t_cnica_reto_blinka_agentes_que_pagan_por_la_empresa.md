# Propuesta Técnica: Blinka PayAgent (Human-in-the-Loop Financial Guardrails)

> **Equipo:** KAY/O  
> **Reto:** Blinka - Agentes que pagan por la empresa  
> **Metodología:** Spec-Driven Development (SDD) & Vibecoding Asistido  

---

## 1. Resumen Ejecutivo y Visión del Producto

Las empresas constituidas en EE. UU. que operan con contratistas y proveedores globales enfrentan una sobrecarga operativa crítica: revisión manual de facturas dispares, consultas desestructuradas por chat, riesgo constante de pagos duplicados y conciliación manual tardía.

**Blinka PayAgent** es un agente autónomo de gobernanza financiera diseñado bajo el principio de *Zero-Trust Financial Automation*. El agente no ejecuta transferencias bancarias reales; su propósito es actuar como el **cerebro decisorio de confianza** que evalúa, clasifica y audita cada factura entrante en tres estados deterministas: **PAGAR**, **FRENAR** o **ESCALAR A HUMANO**.

La solución combina un **Dashboard Financiero de Alta Densidad** (para trazabilidad y control de políticas) con un **Asistente Conversacional Embebido** (para resolución contextual de excepciones *Human-in-the-Loop* y auditoría en lenguaje natural).

---

## 2. Alineación Estricta con la Rúbrica de Éxito de Blinka

| Criterio del Jurado | Cómo lo resuelve Blinka PayAgent |
| :--- | :--- |
| **Autonomía** | Procesa automáticamente el 100% de las facturas que cumplen las reglas comerciales sin requerir intervención humana, reduciendo el tiempo de revisión a menos de 2 segundos por documento. |
| **Seguridad (Cero errores)** | **Aislamiento determinista:** El LLM únicamente extrae datos a JSON tipado. La decisión de pagar la ejecuta un motor lógico estricto contra un archivo formal de especificación (`spec.json`). **Cero pagos aprobados fuera de política.** |
| **Explicabilidad** | Cada factura procesada genera un registro de auditoría (*Audit Trail*) legible para cualquier persona sin conocimientos técnicos, detallando la regla exacta evaluada y el veredicto. |

---

## 3. Arquitectura del Sistema (3 Capas)

```
┌─────────────────────────────────────────────────────────────┐
│                       CAPA 1: INGESTA                       │
│  Dropzone UI / Ingesta de Facturas (PDF, Imagen, Mock JSON) │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 CAPA 2: EXTRACCIÓN ESTRUCTURADA             │
│        Gemini 1.5 Flash / Multimodal Structured Output      │
│     (Genera JSON estricto validado con esquema Zod)         │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             CAPA 3: MOTOR DE REGLAS DETERMINISTA            │
│         Evaluación contra spec.json (Límites, Duplicados,   │
│                 Presupuesto, Whitelist de Proveedores)      │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
               ▼                               ▼
       [DECISIÓN: AUTO]                [DECISIÓN: EXCEPCIÓN]
     🟢 PAGADA  |  🔴 FRENADA              🟡 ESCALADA
               │                               │
               │                               ▼
               │                ┌─────────────────────────────┐
               │                │   HUMAN-IN-THE-LOOP PANEL   │
               │                │ Chat interactivo + Botones  │
               │                │ [Aprobar una vez] [Denegar] │
               │                └──────────────┬──────────────┘
               │                               │
               ▼                               ▼
┌─────────────────────────────────────────────────────────────┐
│               CAPA 4: AUDIT TRAIL & DASHBOARD               │
│   Registro inmutable de decisiones + Consulta en lenguaje    │
│            natural ("¿Por qué se frenó esta factura?")      │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Matriz de Reglas y Clasificación de Decisiones

El agente evalúa cada factura secuencialmente bajo las siguientes compuertas lógicas:

### A. Reglas de Freno Inmediato (🔴 FRENAR)
1. **Detección de Duplicados (Hash & Tupla):** Se evalúa si el hash del archivo o el par `(vendor_tax_id, invoice_number)` ya existen en el registro histórico de facturas pagadas o en trámite.
2. **Proveedor en Lista Negra (Blacklist):** Si el identificador fiscal o nombre coincide con entidades suspendidas o fraudulentas.
3. **Inconsistencia de Datos Críticos:** Ausencia de número fiscal, datos bancarios incompletos o moneda no soportada por la tesorería de la empresa.

### B. Reglas de Escalado a Persona (🟡 ESCALAR)
1. **Umbral de Monto Excedido:** Facturas que superan el límite de pago autónomo establecido por política (ej. $> \$1,000\text{ USD}$).
2. **Proveedor Nuevo / No Verificado:** Proveedor legítimo sin historial previo en la base de datos permitida (*Whitelist*).
3. **Límite de Presupuesto del Periodo:** El monto de la factura excede el saldo mensual restante asignado a la categoría de gasto correspondiente.
4. **Desviación de Comportamiento (*Vendor Drift*):** El monto cobrado supera en más del $40\%$ el promedio histórico de cobro del proveedor en los últimos 3 periodos.

### C. Regla de Pago Autónomo (🟢 PAGAR)
* Se ejecuta exclusivamente cuando la factura pasa **todas** las validaciones de frenado y ninguno de los disparadores de escalado se activa.

---

## 5. El Factor Diferenciador: Novedad e Impacto Visual

Para destacar frente al resto de propuestas en la demostración en vivo, el proyecto incorpora tres elementos diferenciadores:

1. **Simulador de Decisiones y Cambio de Políticas en Caliente:**
   * El jurado puede mover sliders de límites (ej. reducir el umbral de aprobación de $\$1,000$ a $\$300$) y ver cómo facturas que antes se pagaban de forma autónoma cambian en tiempo real a estado *Escalado*.
2. **Módulo "Ask Auditor" (Auditoría Conversacional):**
   * En lugar de obligar al CFO a leer logs técnicos, el dashboard incluye un asistente lateral donde se puede preguntar:  
     * *"¿Por qué rechazaste la factura de AWS?"*  
     * *Respuesta del Agente:* *"Se frenó porque el número de factura #INV-9022 ya fue pagado el 12 de octubre. Adicionalmente, el importe de $450 USD superaba el saldo restante de la partida de Infraestructura ($200 USD)."*
3. **Notificación Interactiva Slack-Style:**
   * En las facturas escaladas, se renderiza una tarjeta de mensaje estilo Slack con acciones rápidas: `[Autorizar con Sobrecupo]`, `[Solicitar Corrección al Proveedor]` o `[Rechazar Definitivamente]`.

---

## 6. Especificación de Datos y Casos de Prueba (SDD)

El conjunto de pruebas preconfigurado para la demo incluye 10 escenarios diseñados para probar la solidez del sistema frente a casos trampa:

| ID | Proveedor | Monto | Moneda | Caso Evaluado | Veredicto Esperado | Justificación |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `TC-01` | CloudServers Inc | \$420.00 | USD | Recurrente normal | 🟢 PAGAR | Dentro de política y proveedor verificado. |
| `TC-02` | DevStudio Latam | \$850.00 | USD | Pago dentro de rango | 🟢 PAGAR | Presupuesto y proveedor en regla. |
| `TC-03` | CloudServers Inc | \$420.00 | USD | Duplicado intencional | 🔴 FRENAR | Factura con mismo número y emisor ya pagada. |
| `TC-04` | Growth Agency | \$3,500.00 | USD | Límite superado | 🟡 ESCALAR | Supera el umbral automático de \$1,000 USD. |
| `TC-05` | Nuevo Redactor | \$350.00 | USD | Proveedor desconocido | 🟡 ESCALAR | Emisor no presente en el registro de proveedores. |
| `TC-06` | Legal Global | \$5,000.00 | EUR | Moneda y presupuesto | 🟡 ESCALAR | Presupuesto mensual insuficiente y moneda EUR. |
| `TC-07` | Freelance Design | \$1,200.00 | USD | Desviación de cobro | 🟡 ESCALAR | Monto $+150\%$ sobre su promedio histórico (\$480). |
| `TC-08` | Entidad Fantasma | \$900.00 | USD | Datos incompletos | 🔴 FRENAR | Falta tax ID y dirección fiscal válida. |
| `TC-09` | SaaS Tools Ltd | \$120.00 | USD | Microgasto estándar | 🟢 PAGAR | Cumple todas las reglas de gasto recurrente. |
| `TC-10` | DevStudio Latam | \$950.00 | USD | Límite mensual al tope | 🟡 ESCALAR | Deja la categoría con saldo negativo. |

---

## 7. Plan de Ejecución Rápida en el Hackathon (Vibecoding Workflow)

### Fase 1: Especificación y Contratos (30 minutos)
* Definir el archivo formal `spec.md` y el esquema Zod `invoiceSchema`.
* Generar los archivos JSON/PDF de prueba que contengan los 10 casos de prueba.

### Fase 2: Motor Lógico y Validación (1.5 horas)
* Implementar el motor de reglas en TypeScript/Node.js sin depender de LLM para la toma de decisiones.
* Integrar la llamada a Gemini Flash únicamente para la transformación de documentos a JSON estructurado.

### Fase 3: Dashboard Frontend (2 horas)
* Construir la interfaz en una sola vista con Tailwind CSS:
  * Barra superior: Resumen de presupuesto y configuración de umbrales.
  * Centro: Dropzone y tabla de estados con badges visuales.
  * Panel derecho/modal: Historial de auditoría y chat interactivo "Ask Auditor".

### Fase 4: Pulido de Demo y Pitch (1 hora)
* Cargar el set de pruebas completo.
* Preparar el guion de presentación demostrando primero un caso automático, luego un freno por duplicado y finalmente una resolución de escalado en vivo.