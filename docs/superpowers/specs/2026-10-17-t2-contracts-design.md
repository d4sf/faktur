# Spec — T2 · Esquemas Zod y `specs/policy.spec.json` v1 congelado

> **Backlog:** `docs/backlog_implementacion_mvp.md`, tarea T2 (Bloque A · Cimientos).
> **Fecha:** 17/10/2026 · **Estado:** aprobado para implementar.
> **Depende de:** T1 (mergeada en `e65e7a6`).

---

## 0. Corrección de un supuesto que quedó escrito en docs publicados

La versión anterior de este spec, el plan de T1 y la síntesis de T1 en el backlog afirman que **`gemini-3.8-flash` no acepta `$ref` ni `anyOf`** en `response_schema`, y de ahí salen el "aplanar el schema" y el criterio de aceptación correspondiente.

**Eso es falso.** La [documentación oficial de structured outputs](https://ai.google.dev/gemini-api/docs/structured-output) muestra los dos en uso:

- `anyOf`, en un ejemplo explícito de "schemas condicionales" (moderación de contenido).
- `$ref: "#"`, en el ejemplo de estructura recursiva (organigrama).

Lo que sí quedó viejo es el resto del mismo pasaje: la API ya no es `generateContent` con `generationConfig.responseSchema`, sino `client.interactions.create({ model, input, response_format: { type: "text", mime_type: "application/json", schema } })`. **T2 no arregla eso** — la invocación es de T10 — pero este spec no debe volver a afirmar lo de `$ref`.

**Dónde está la afirmación, verificado con grep:** en **dos** lugares, los dos del backlog. La primera versión de esta tabla apuntaba al spec de T1 y al plan, y estaba mal: ninguno de los dos contiene el texto.

| Dónde | Qué dice |
|:---|:---|
| `docs/backlog_implementacion_mvp.md`, síntesis de **T10** | "`gemini-3.8-flash` no acepta `$ref` ni `anyOf`" |
| `docs/backlog_implementacion_mvp.md`, §8 | "el dialecto de `response_schema` cambió entre generaciones… hay que aplanar el schema" |

**Dos documentos más quedan desalineados por las decisiones de §6**, y también hay que corregirlos:

| Dónde | Qué dice | Por qué hay que tocarlo |
|:---|:---|:---|
| `docs/propuesta_modelo_ER_faktur.md` §2.6 | `Marketing 2500` | Con 2500, TC-04 dispara `ALERT_BUDGET_TIGHT` en la regla 6 y nunca llega a la 7, contradiciendo el veredicto que el propio backlog §6.2 le asigna. T3 siembra `policy_category_budgets` desde esa línea. |
| `docs/propuesta_modelo_ER_faktur.md` §2.1 y §2.6 | `Diseño` con tilde | T2 escribe las claves de categoría **sin tilde** (§7.2). Dejarlas desalineadas hace que T3 escriba un `CHECK` con un valor y siembre otro. |

**Qué queda como requisito real**, y es mucho más chico: `z.toJSONSchema()` no debe emitir `$defs` ni indirección por `$ref` para los schemas de extracción, porque el ejemplo de la documentación solo muestra `$ref: "#"` para recursividad explícita, no para reutilización. Verificado empíricamente que con un schema anidado usado una sola vez, `z.toJSONSchema` lo **inlinea** y no emite `$defs` (§5). El aplanado es, por lo tanto, una verificación de que no aparecen, no una transformación.

---

## 1. Por qué

Sin un contrato congelado no hay forma de saber si una decisión se tomó sobre datos válidos: el motor de T5 recibe tipos, la extracción de T10 produce datos y el registro de T7 escribe filas, y los tres podrían discrepar sin que nada se queje.

Y sin los números de política escritos en **un archivo** no hay "cambiar un default es un cambio de versión". Si viven en el código, mover el umbral de $1.000 a $300 es un edit que no queda en el historial ni en el `policy_version` que cada decisión congela.

## 2. Objetivos

1. Un contrato de datos en TypeScript que valida lo que el LLM devuelve, lo que el motor decide y lo que se registra.
2. `specs/policy.spec.json` v1 congelado, validado contra ese contrato al cargarse.
3. La tabla de precedencia del backlog §5 como dato validado, no como prosa ni como `switch` escrito a mano.
4. Que la forma de los schemas sirva para mandárselos a Gemini sin traducción.

## 3. No objetivos

- **No** es el motor. T2 no decide nada; solo declara qué se puede decidir.
- **No** es la base de datos. Ningún DDL, ningún `CREATE TABLE`. T3.
- **No** invoca a Gemini. T10 hace la llamada; T2 solo produce el schema que se le va a mandar.
- **No** define los fixtures. `fixtures/TC-*.json` es T4, aunque se validen contra estos schemas.
- **No** es el seed de proveedores. Eso es T3.

## 4. Anti-objetivos

- **Un schema que acepta de más.** `ExtractedInvoice` tiene que rechazar una factura sin `vendor_tax_id`, porque TC-08 depende de que eso frene. Un schema permisivo convierte un caso de prueba en un PAGAR silencioso.
- **Un JSON que se valida una vez y después se ignora.** Si `loadPolicySpec()` no valida al cargar, el archivo decorativo.
- **Enums que se repiten en tres lugares.** `ReasonCode` vive en un módulo; el JSON y la precedencia lo referencian, no lo repiten.

---

## 5. Verificación empírica previa

Todo lo de esta tabla se comprobó en el contenedor antes de escribir el spec.

| Comprobación | Resultado |
|:---|:---|
| Zod instalado | `4.6.7` |
| `z.toJSONSchema()` existe | Sí, emite JSON Schema 2020-12 |
| Un schema anidado usado una sola vez | Se **inlinea**, sin `$defs` ni `$ref` |
| `z.toJSONSchema` y `$schema`/`additionalProperties` | Los emite; ambos son aceptados por la API |
| `api/src` puede importar un JSON fuera de `src` | **No sin atributo**: TS1543 pide `with { type: "json" }` |
| Con `with { type: "json" }` | Compila y builda, `rootDir: src` no molesta |
| ¿`tsc` copia el JSON al output? | **No.** El JS emitido sigue apuntando a `../../specs/*.json` |
| ¿Funciona en runtime? | En dev sí (bind mount). **En prod no**: `specs/` no está en el `COPY` del stage runtime |
| Gemini y `anyOf` | Soportado (ejemplo de moderación) |
| Gemini y `$ref: "#"` | Soportado (ejemplo de recursión) |
| Forma de la API | `interactions.create({ model, input, response_format: { type, mime_type, schema } })` |

---

## 6. Decisiones

### 6.1 El spec congelado vive en `specs/` y el `Dockerfile` lo copia

**Decisión del dueño del producto.** `specs/policy.spec.json` en la raíz del repo, importado con `import ... with { type: "json" }`, y `COPY` en el stage runtime del `Dockerfile`.

Es la única opción que cumple las dos cosas a la vez: el archivo queda en un lugar visible y auditable del repo, y llega a producción. La alternativa obvia — moverlo a `api/` — funcionaría sin tocar el `Dockerfile` pero contradice `AGENTS.md`, que ya declara que `specs/` es el destino previsto de `policy.spec.json`.

**Consecuencia que hay que aceptar:** T2 toca el `Dockerfile`, que hasta ahora era territorio exclusivo de T1. Es una línea.

### 6.2 La precedencia vive en TypeScript, no en el JSON

**Decisión del dueño del producto.** `specs/policy.spec.json` lleva **números**; el orden y los códigos de las reglas viven en `api/src/domain/precedence.ts` como constante validada por Zod al importarse.

El backlog pedía "la tabla de precedencia escrita como datos, no como prosa", y eso se cumple igual: es un array de objetos, no un párrafo ni un `switch`. Lo que cambia es dónde está, y el efecto es sobre T5: el motor sigue siendo código escrito a mano, una función por regla, con el `switch` explícito que hace fácil depurar. El JSON queda como lo que es, un archivo de configuración versionado.

**Lo que T5 pierde y hay que saber:** el orden deja de ser legible en el archivo que se le muestra al jurado. Se compensa porque `precedence.ts` es corto, tiene un comentario por regla y los `reason_code` son los mismos que salen en el CSV.

### 6.3 Los presupuestos por categoría se derivan de los casos

**Decisión del dueño del producto.** No hay números de negocio en ningún documento, así que se derivan de los 11 casos de prueba del backlog §6.2:

| Categoría | Presupuesto | Por qué ese número |
|:---|---:|:---|
| Infraestructura | 1500 | TC-01 ($420) tiene que pasar |
| Diseño | 1000 | TC-02 ($850) pasa y deja $150; TC-10 ($950) no entra → `ALERT_BUDGET_TIGHT` |
| Marketing | **4000** | TC-04 ($3.500) tiene que **llegar** a la regla 7 y no frenar en la 6 |
| Legal | 3000 | TC-06 dispara antes por presupuesto del periodo ($5.400 > $5.000) |
| Software | 500 | TC-09 ($120) tiene que pasar |
| Retail | 0 | Solo la usa TC-11, que frena en la regla 3 |

**Marketing tiene que ser ≥ 3500.** Con 2500, TC-04 dispara `ALERT_BUDGET_TIGHT` en vez de `ALERT_THRESHOLD_EXCEEDED`, y el caso deja de narrar lo que dice narrar. Por eso el número tiene un test que lo fija (§8), no solo un valor.

### 6.4 Decisiones mías

- **Un módulo por responsabilidad**, con un `index.ts` que reexporta. El dominio tiene seis contratos distintos y un archivo de 300 líneas sería más difícil de leer que seis de 50.
- **Los tipos se derivan con `z.infer`.** Lección de T1: la interfaz escrita a mano no compilaba contra el tipo inferido. Una sola fuente, imposible que derive.
- **Idiomas de Zod 4, no de Zod 3.** `z.url()` en vez de `z.string().url()`, y `z.enum(CATEGORIAS)` sobre un `as const` para que el array y el enum no puedan separarse.
- **`.trim()` en los strings de extracción.** Minor diferido en la revisión de T1: sin esto, un valor con espacios de más llega al motor. Se resuelve acá, que es donde nace el dato.
- **`loadPolicySpec()` valida y cachea.** Si el JSON está mal, revienta al importar, no al cobrar.

### 6.5 `extraction_confidence` lo calcula la app; el modelo no lo emite

**Decisión del dueño del producto.** El schema que se le manda a Gemini **no** lleva `extraction_confidence`.

Las tres fuentes se contradecían: el PRD RF-2.2 no lo lista en `ExtractedInvoice`, el ER lo pone como columna de `invoices`, y el backlog T10 dice que la app lo "calcula". Pedirle al modelo un número que no puede saber produce dos males: o inventa una confianza, o omite un campo requerido y T10 tiene que manejar ese caso.

Lo que sí se le pide: un sub-objeto `field_confidence` con la confianza **por campo**, que es algo el modelo sí puede estimar leyendo el documento. La app promedia (o toma el mínimo) y de ahí sale el número que la regla 1 lee para decidir entre FRENAR y ESCALAR.

Consecuencias: `ExtractedInvoice` **no** lleva `extraction_confidence`; el derivado vive en `extraction.ts` como función aparte; y los fixtures de T4 no lo cargan.

### 6.6 `snake_case` en todo el dominio

**Decisión del dueño del producto.** Todo el contrato de datos usa `snake_case`: `reason_code`, `policy_version`, `file_hash`, `line_items`, y también las claves de `specs/policy.spec.json`.

Es la convención que ya usan `ExtractedInvoice` (que emite el modelo y no se puede cambiar), las columnas del ER, las 14 columnas del CSV del MVP §7 y el `UNIQUE(vendor_id, invoice_number)`. ELEGIR otra obligaría a traducir en el borde de la base, en el CSV y en la API, y son cuatro puntos de traducción que alguien olvida.

Lo que cuesta: el código TypeScript se ve distinto de la convención habitual de TS. Se acepta.

### 6.7 El umbral de confianza es un parámetro de política, valor 0.7

**Decisión del dueño del producto.** `min_extraction_confidence: 0.7` va en `specs/policy.spec.json`.

Ningún documento del repo definía el umbral: el ER dice "bajo el umbral dispara ESCALAR" y nunca dice cuál es, y el PRD no lo menciona. La regla 1 no se puede implementar sin él.

Es un parámetro de política y va en el archivo de política, no en el código: si mañana hay que subirlo o bajarlo es un cambio de política versionado, queda en el registro y cada decisión que lo usó conserva su `policy_version`. Como constante en `policy.ts` sería un número de negocio escondido.

**El valor.** 0.7 deja pasar una factura limpia y frena solo lo que el modelo no leyó con confianza. Subirlo escala de más y hunde el touchless rate, que la meta del PRD pone en >50% sobre el set. Bajarlo deja pasar extracciones malas, que es justo lo que la rúbrica penaliza.

### 6.8 La confianza global es el **mínimo** de los campos críticos

**Decisión del dueño del producto.** Se aplica el mínimo, no el promedio.

El ER solo dice "0..1" y el PRD no lo dice, así que no era derivable. El mínimo es lo fail-closed: un solo campo que el modelo no leyó bien baja la factura entera. Un promedio puede tapar un folio o un monto ilegibles si el resto salió bien, y eso es dejar pasar una factura mala justo porque teve un error.

Se aplica **solo sobre los campos de §6.9**. Promediar sobre el resto no cambia ningún veredicto y solo agrega ruido.

### 6.9 `field_confidence` cubre cinco campos críticos, todos requeridos

**Decisión del dueño del producto.** El objeto lleva confianza de `invoice_number`, `vendor_tax_id`, `total_amount`, `currency` y `due_date`. Los cinco son **requeridos**.

Son los que cambian un veredicto: sin folio no hay dedup, sin tax_id no se sabe a quién se le paga, sin monto no hay umbral ni presupuesto, sin moneda no hay conversión a USD, y la fecha de vencimiento es la que ordena la cola de pago. `vendor_name`, `subtotal`, `tax_amount` y `line_items` no llevan confianza: ninguno cambia una decisión.

Todos requeridos, no opcionales, por una razón práctica: si un campo falta, el motor tiene que poder decir **cuál** no se leyó. Con `field_confidence` parcial no hay forma de distinguir "el modelo no puntuó este campo" de "el modelo no vio este campo", y la explicación del registro pierde el detalle que la rúbrica premia.

### 6.10 En `ExtractedInvoice` son requeridos folio, monto y moneda

**Decisión del dueño del producto.** Requeridos: `invoice_number`, `total_amount`, `currency`. Opcionales: `vendor_name`, `vendor_tax_id`, `issue_date`, `due_date`, `subtotal`, `tax_amount`, `line_items`.

Los tres requeridos son los que, sin ellos, el motor no puede calcular nada. `currency` requerido además hace que la normalización de §6.11 tenga dónde aplicarse: si la moneda viniera ausente no habría nada que normalizar.

`vendor_tax_id` sigue siendo opcional a propósito: **TC-08 depende de que una factura sin tax_id llegue al motor y frene ahí**, en la regla 1, y no de que el parser la rechace. Un schema que exige el tax_id convierte el caso de prueba en un error de validación y deja la regla 1 sin caso.

### 6.11 La moneda se normaliza antes de validar

**Decisión del dueño del producto.** `z.string().trim().toUpperCase()` y recién entonces el `enum` de las cuatro monedas.

Sin esto, un modelo que devuelve `"usd"` o `"USD "` produce un **falso FRENAR** por la regla 7 sobre una factura perfectamente válida, y en el demo eso se ve como un fallo del agente. `"USD"` es la respuesta correcta a un documento que dice "USD"; exigir el case exacto es pedirle al modelo precisión que no tiene por qué tener.

`z.toJSONSchema` reporta la transformación como un `enum` cerrado, así que el modelo sigue recibiendo el conjunto de las cuatro. No hay costo para T10.

### 6.12 Las fechas se validan estrictas, no se coercian

**Decisión del dueño del producto.** `z.iso.date()`: acepta `YYYY-MM-DD` y rechaza `17/10/2026`.

Verificado: `z.iso.date()` existe en Zod 4.6.7 y rechaza el formato con barras. El prompt de T10 le pide normalizar; si no lo logra, la factura frena. Es fail-closed y es lo que pide el PRD.

Coercionar parecería más generoso, pero interpretar `"17/10/2026"` exige adivinar si es día/mes o mes/día, y equivocarse produce una fecha **correcta pero equivocada**. Eso es peor que frenar: frena una factura que un humano leería bien, mientras que una fecha corrida mueve la factura en la cola de pago sin que nadie lo note.

---

## 7. Diseño

### 7.1 Archivos

```
specs/policy.spec.json                  Nuevo. La política v1, congelada.
api/src/domain/extraction.ts            Currency, LineItem, ExtractedInvoice
api/src/domain/policy.ts                Category, PolicySpec, loadPolicySpec
api/src/domain/decision.ts              Verdict, ReasonCode, InvoiceStatus, Decision
api/src/domain/audit.ts                 AuditRecord, Approval, ApprovalStatus
api/src/domain/ingestion.ts             AttemptStatus, IngestAttempt
api/src/domain/precedence.ts            PRECEDENCE: 8 reglas, 10 condiciones
api/src/domain/geminiSchema.ts          toGeminiResponseSchema()
api/src/domain/index.ts                 Barrel
```

Un `.test.ts` por archivo. **Y hay que agregarlos todos al script `test` de `api/package.json` a mano**, que sigue hardcodeado. Ese paso se ha olvidado dos veces en este repo.

### 7.2 `specs/policy.spec.json`

```json
{
  "version": "v1",
  "created_at": "2026-10-17",
  "created_by": "KAY/O",
  "comment": "Version 1 congelada del MVP. Cambiar un default es una version nueva, no un edit.",
  "auto_approval_threshold_usd": 1000,
  "monthly_budget_usd": 5000,
  "vendor_drift_factor": 1.4,
  "min_extraction_confidence": 0.7,
  "allowed_currencies": ["USD", "MXN", "COP", "EUR"],
  "category_budgets": {
    "Infraestructura": 1500,
    "Diseno": 1000,
    "Marketing": 4000,
    "Legal": 3000,
    "Software": 500,
    "Retail": 0
  }
}
```

Claves en `snake_case` por §6.5. Las categorías van **sin tilde** (`Diseno`, no `Diseño`) por la razón de §7.2.

**No lleva** el seed de proveedores (T3), los fixtures (T4) ni la tabla de precedencia (§6.2).

### 7.3 Los contratos

**`extraction.ts`** — `Currency` (4 valores), `LineItem` (`description`, `quantity`, `unit_price`, `total`), `ExtractedInvoice` y `field_confidence`.

**Qué es requerido** (§6.10): `invoice_number`, `total_amount` y `currency`. **Opcionales**: `vendor_name`, `vendor_tax_id`, `issue_date`, `due_date`, `subtotal`, `tax_amount`, `line_items`.

`vendor_tax_id` es opcional **a propósito**: TC-08 depende de que esa factura llegue al motor y frene en la regla 1, no de que el parser la rechace.

`field_confidence` es un objeto con **cinco** campos requeridos — `invoice_number`, `vendor_tax_id`, `total_amount`, `currency`, `due_date` — cada uno `0..1` (§6.9). Es lo único que el modelo emite sobre su propia certeza. El `extraction_confidence` que lee la regla 1 **no** está en el schema: lo deriva la app como el **mínimo** de esos cinco (§6.8), y vive en este módulo como función aparte.

`currency` se normaliza con `trim()` y `toUpperCase()` antes de validar el enum (§6.11). Las fechas usan `z.iso.date()` estricto (§6.12). Todos los strings llevan `trim()`.

**`decision.ts`** — `Verdict` (`PAGAR | FRENAR | ESCALAR`), `ReasonCode` (**diez**, ver §7.4), `InvoiceStatus`, `Decision` (el veredicto append-only con `policy_version`).

`InvoiceStatus` son los siete estados de `estados_factura.mmd`, escritos como **`RECIBIDA | EXTRAIDA | DECIDIDA | PENDIENTE_APROBACION | APROBADA | NEGADA | FRENADA`**. Tres razones y ninguna es negociable:

- **Mayúsculas**, porque es lo único que hacen `Verdict`, `ReasonCode`, `ApprovalStatus` y `AttemptStatus`. Un enum en minúsculas dentro de un sistema donde todo lo demás es mayúsculas se lee como un oversight.
- **Sin tilde**, porque estos valores van a ser un `CHECK` de SQLite en T3 y `PENDIENTE_APROBACION` no es un identificador con el que nadie quiera trabajar. El diagrama escribe `extraída` porque es un diagrama, no código.
- **El `.mmd` y el ER discrepan hoy** (`extraída` contra `extraida`); el valor del código es la referencia y el ER se corrige con el resto de §0.

**`audit.ts`** — `AuditRecord` y `Approval` con `ApprovalStatus` (`PENDIENTE | APROBADA | NEGADA`). `explanation` es string no vacía, porque una decisión sin motivo es exactamente lo que la rúbrica penaliza.

**`ingestion.ts`** — `AttemptStatus` (`RECIBIDA | DUPLICADA | RECHAZADA`) e `IngestAttempt`. El `duplicate_of_invoice_id` es opcional y apunta a la canónica: existe para que el reenvío duplicado quede auditable en vez de rechazarse en silencio.

**`policy.ts`** — `Category` (6 valores), `PolicySpec` (el schema que valida el JSON) y `loadPolicySpec()`, que importa con `with { type: "json" }`, valida, y cachea el resultado.

### 7.4 `reason_code`: diez, y por qué el enum del PRD no alcanza

El Apéndice A del PRD tiene nueve. Faltan dos y sobra uno:

| Regla | Condición | Veredicto | `reason_code` |
|:--|:---|:---|:---|
| 1 | ilegible o incompleto | FRENAR | `ERR_INVALID_DATA` |
| 1 | completo, confianza baja | ESCALAR | `ALERT_LOW_CONFIDENCE` ← **nuevo** |
| 2 | hash o tupla repetidos | FRENAR | `ERR_DUPLICATE_INVOICE` |
| 3 | beneficiario bloqueado | FRENAR | `ERR_BLACKLISTED_VENDOR` |
| 4 | beneficiario no listado | ESCALAR | `ALERT_NEW_VENDOR` |
| 5 | desvío sobre lo acordado | ESCALAR | `ALERT_VENDOR_DRIFT` |
| 6 | presupuesto del periodo | ESCALAR | `ALERT_BUDGET_OVERRUN` ← **reemplaza** al `ERR_` del PRD |
| 6 | presupuesto de categoría | ESCALAR | `ALERT_BUDGET_TIGHT` |
| 7 | supera el umbral autónomo | ESCALAR | `ALERT_THRESHOLD_EXCEEDED` |
| 8 | pasa todo | PAGAR | `SUCCESS_TOUCHLESS_STP` |

`ERR_BUDGET_OVERRUN` queda **sin uso**: ese veredicto FRENAR contradice `estados_factura.mmd`, donde la regla 6 es escalable. Por eso el enum queda en diez y no en once.

### 7.5 `precedence.ts` — 8 reglas, 10 condiciones

Dos reglas tienen doble salida: la 1 (ilegible frena, confianza baja escala) y la 6 (presupuesto del periodo, presupuesto de categoría). Eso da **10 condiciones sobre 8 números de regla**, y el motor de T5 tiene que iterar sobre las condiciones en orden, no sobre los números. La primera versión de este spec decía nueve; la tabla de arriba tenía diez y el texto no cuadraba.

Cada condición lleva `rule` (el número, para agrupar y para que el CSV diga "regla 2"), `id` (estable, para los tests), `verdict`, `reason_code` y `description` (en lenguaje natural, que es lo que lee el jurado). Todo `snake_case` por §6.5.

El array se valida contra un schema de Zod **al importarse**. Si alguien agrega una condición con un `reason_code` que no está en el enum, revienta al cargar el módulo, no tres semanas después en una factura real.

### 7.6 `geminiSchema.ts`

`toGeminiResponseSchema(schema: z.ZodType): object` es un wrapper delgado sobre `z.toJSONSchema()`, más lo que haga falta para el subconjunto que la API acepta.

Tres cosas verificadas que condicionan su implementación:

- **`$schema` se quita.** `z.toJSONSchema` lo emite en la raíz, y los ejemplos de la documentación de Google no lo mandan. Cuesta una línea y es seguro mandarlo o no.
- **`.trim()` no sobrevive la conversión.** `toJSONSchema` solo conserva `minLength`. No es problema: el `.trim()` es de validación en runtime, no de generación, y el modelo no necesita saberlo.
- **El default de Zod 4 es `reused: "inline"`.** Un objeto anidado usado una sola vez —o incluso varias— se inlinea y **no** aparecen `$defs` ni `$ref`. Para producir `$defs` de verdad hay que pedirlo explícitamente con `z.toJSONSchema(schema, { reused: "ref" })` o registrar un id con `.meta({ id: "..." })`. El test de §8 tiene que usar una de esas dos recetas; la ingenua no dispara nada.

**No** es un conversor general de JSON Schema. Si el schema producido trae `$defs`, la función lanza nombrando el schema, en vez de devolver algo que la API va a rechazar tres saltos más adelante.

### 7.7 Carga del spec

```ts
import raw from "../../../specs/policy.spec.json" with { type: "json" };
```

Desde `api/src/domain/policy.ts`, tres niveles arriba. Y el `Dockerfile` runtime suma `COPY --from=build /app/specs ./specs`, porque `tsc` **no** copia el JSON al output (verificado: el JS emitido sigue apuntando al JSON por ruta relativa).

Sin ese `COPY`, todo pasa en dev y revienta en prod. Es exactamente el fallo queTG1 enseñó a no confiar.

---

## 8. Pruebas

**`policy.test.ts`**

- El JSON real valida contra `PolicySpec`.
- Los defaults congelados son los del §6.3: umbral `1000`, presupuesto `5000`, drift `1.4`, cuatro monedas.
- **`Marketing` es ≥ 3500.** Es el número que sostiene TC-04, y nada más lo protege de volver a 2500 y romper el caso sin que ningún test grite.
- Los presupuestos por categoría son todos `>= 0`.
- `min_extraction_confidence` tiene que estar entre 0 y 1: con `1.2` toda factura escalaría y con `0` la rama quedaría muerta. Ambas cosas rompen el demo en direcciones opuestas.
- Un JSON con una categoría desconocida se rechaza.
- `loadPolicySpec()` devuelve el mismo objeto en dos llamadas (cache).

**`decision.test.ts`**

- El enum de `reason_code` tiene exactamente diez y `ERR_BUDGET_OVERRUN` no está.
- `InvoiceStatus` tiene exactamente los siete valores de §7.3, todos en mayúsculas y sin tilde.

**`precedence.test.ts`**

- Hay **ocho** números de regla distintos, del 1 al 8, sin huecos.
- Hay **diez** condiciones: la 1 y la 6 tienen dos salidas cada una, y el resto una.
- **Las reglas 1 a 3 son todas FRENAR y las 4 a 7 todas ESCALAR.** Esa es la frontera de los frenos duros de la que depende `ds02` y el 409 al aprobar: si alguien cambia un veredicto, este test lo dice.
- La regla 8 es PAGAR y es la última.
- Todo `reason_code` de la precedencia está en el enum.
- Los `rule` son correlativos y en orden ascendente en el array.

**`extraction.test.ts`**

- Una factura completa con `line_items` y `field_confidence` valida.
- `extraction_confidence` **no** es una propiedad de `ExtractedInvoice`: agregarla a un objeto de prueba no cambia el tipo.
- **Requeridos que faltan:** sin `invoice_number`, sin `total_amount` o sin `currency` el schema rechaza (§6.10).
- **Opcionales que faltan:** sin `vendor_tax_id` **valida** y queda como beneficiario ausente para que la regla 1 lo frene. Este es TC-08, y el test fija que el schema no lo rechaza.
- `field_confidence` con **cualquiera** de sus cinco campos ausente se rechaza: son requeridos todos (§6.9).
- `field_confidence` con un valor fuera de `0..1` se rechaza.
- **La confianza global es el mínimo** de los cinco: con `[0.95, 0.6, 0.99, 1, 0.9]` devuelve `0.6`, no el promedio (§6.8).
- La confianza global de una factura **sin** `field_confidence` no lanza: la decisión de confianza baja es del motor, no el parser.
- **Moneda normalizada:** `"usd"`, `" USD "` y `"USD"` validan y los tres dan `"USD"`; `"BTC"` se rechaza (§6.11).
- **Fecha estricta:** `"2026-10-17"` valida y `"17/10/2026"` se rechaza (§6.12).
- Un monto negativo se rechaza.
- Un string con espacios de más en `vendor_name` viene `.trim()`eado.

**`geminiSchema.test.ts`**

- El schema de `ExtractedInvoice` **no** produce `$defs` ni `$ref` de reutilización.
- La raíz del schema emitido **no** lleva `$schema`.
- Conserva `line_items` con sus cuatro propiedades: es el criterio de aceptación explícito del backlog.
- Todas las propiedades de `ExtractedInvoice` aparecen en el schema emitido, incluida `field_confidence` y **sin** `extraction_confidence` (§6.5). Si alguien agrega un campo al contrato y olvida el schema, este test lo dice.
- El schema emitido de `currency` es un **enum cerrado** de las cuatro monedas, no un `string` libre: la transformación de §6.11 no debe filtrarse como `string` al otro lado.
- `toGeminiResponseSchema` lanza cuando el schema produce `$defs`, y el fixture tiene que forzarlo con `z.toJSONSchema(s, { reused: "ref" })` o `.meta({ id })`. Reusar un objeto dos veces **no** sirve: con el default `"inline"` Zod lo duplica y no aparece nada.

---

## 9. Criterios de aceptación

1. `npm run typecheck`, `npm run lint` y `npm test` pasan en verde desde el contenedor.
2. `npm test` corre **todos** los `.test.ts` nuevos: cada archivo nuevo está en el script `test` de `api/package.json`. La cuenta de tests sube y se dice cuál es.
3. `npm run build-prod` produce una imagen donde `specs/policy.spec.json` está presente **dentro** de la imagen de runtime. Este criterio no es opcional: sin el `COPY`, dev pasa y prod revienta.
4. `npm run build-prod` produce una imagen donde el JSON se puede importar desde `dist/` sin errores de módulo.
5. `node dist/server.js` en la imagen de producción levanta y responde `GET /api/health`. Prueba end-to-end de que la ruta del JSON se resolvió.
6. Cambiar `auto_approval_threshold_usd` a `300` hace que el test de defaults **falle**. El archivo está congelado y sus defaults son un contrato, no un default de biblioteca.
7. `git status` limpio salvo los archivos de T2.
8. Las tres correcciones del §0 están aplicadas.

## 10. Qué queda para el implementador

Decidido y escrito acá: dónde vive el spec y cómo se carga, dónde vive la precedencia, los valores de los presupuestos por categoría con su porqué, la forma del JSON, los diez `reason_code`, el conteo de 8 reglas y 9 condiciones, la frontera FRENAR/ESCALAR, y las pruebas.

Sin decidir, y el implementador puede resolverlo con criterio:

- Si el barrel `index.ts` exporta los schemas, los types, o ambos. Lo habitual es ambos.
- El texto literal de las `descripcion` de la precedencia.
- Si `toGeminiResponseSchema` acepta el schema de Zod o el tipo ya convertido. Lo primero es más cómodo de llamar.
- Si el `comment` del JSON lleva la fecha o la versión nada más.

Sin tocar:

- `api/src/config/` y `api/src/app.ts` / `server.ts`. T2 no cambia el arranque. **Recomendación explícita: no llamar a `loadPolicySpec()` desde `server.ts`.** Que el spec se valide al importar el primer módulo del dominio que lo usa mantiene el corte de responsabilidad, y evita que un JSON roto impida levantar la API para un health check.
- `web/`.
- `package.json`: no entra ninguna dependencia nueva. `zod` ya está desde T1.

## 11. El hueco de `ALERT_LOW_CONFIDENCE`: cerrado

**Cómo se encontró.** Mapeando los diez `reason_code` contra los once casos del backlog §6.2, **nueve tienen caso y exactamente uno no**. `ALERT_LOW_CONFIDENCE` es el único huérfano: los casos ejercitan la rama FRENAR de la regla 1 (TC-08, sin `tax_id`) pero ninguno la ESCALAR.

Que el hueco sea único y verificable es lo que habilita la solución.

### 11.1 Tres capas, cada una atrapando algo distinto

**Un fixture TC-12 (T4).** Es la única capa que prueba la *plumbing*: que la confianza viaje del schema al motor y llegue a la regla 1. Un test unitario la pasa por alto porque la invoca directo con el valor ya calculado. Si T10 rompe el cable, el test unitario sigue verde y la rama nunca se ejecutó en la vida real.

**Un test unitario en T5.** Atrapa la regresión del *motor*: que alguien cambie `>` por `>=` en la comparación con el umbral, o que el mínimo pase a ser el promedio.

**Un guard en T6.** Es la capa que importa, porque convierte un recordatorio en una restricción. El runner afirma que el conjunto de códigos que produjo es igual al enum:

```ts
const produced = new Set(results.map((r) => r.reason_code));
assert.deepEqual([...produced].sort(), [...REASON_CODES].sort());
```

Hoy ese test falla. Con TC-12 pasa. Y a partir de ahí **es imposible agregar un `reason_code` sin un caso**, porque la suite se niega a quedar verde.

### 11.2 Cómo es TC-12

**Decisión del dueño del producto.** Factura nueva con confianza baja, **reutilizando un proveedor que ya está en el seed**.

Reutilizar el proveedor es deliberado: si TC-12 usara uno nuevo, el seed de §6.1 pasaría de 8 a 9 y T3, el backlog y el ER habría que volver a tocarlos. Con uno existente no cambia nada aguas arriba.

| | |
|:---|:---|
| Proveedor | `SaaS Tools Ltd` (ALLOWLISTED, Software, promedio 120) |
| Monto | `$120`, el mismo que TC-09 |
| `invoice_number` | Propio y distinto, o la regla 2 lo frena por duplicado antes de llegar a la 1 |
| `field_confidence` | Los cinco campos en `0.95` salvo `due_date` en `0.5` |
| Confianza global | `0.5`, el mínimo de los cinco |
| Esperado | 🟡 ESCALAR · `ALERT_LOW_CONFIDENCE` |

Que el monto sea idéntico al de TC-09 es lo que hace el caso limpio: **todas las reglas de dinero pasan** y lo único que dispara es la confianza. Si escalara por presupuesto o por umbral, no probaría la rama que dice probar.

### 11.3 La métrica de touchless se re-baselina

**Decisión del dueño del producto.** La meta de `>50%` se mide sobre **facturas normales**, no sobre el set de trampas, y el set se reporta aparte para transparencia.

Esto no lo causa TC-12 y ya estaba esperando: con once casos el touchless rate es **27.3%**, y con doce sería **25.0%**. El PRD §8 escribe en la misma línea "Meta demo: >50% sobre set de 10" y "Meta piloto: 75% en facturas estándar", que miden cosas distintas. La primera no tiene sentido sobre un set que es **9 de 12 trampas deliberadas** (3 FRENAR y 6 ESCALAR de 12): por construcción el máximo que ese set puede dar es 25%.

T2 no implementa ninguna de las tres capas: sus fixtures son de T4, el motor es de T5 y el runner es de T6. Lo que sí hace T2 es **dejar el contrato que las hace posibles**: el umbral en el JSON (§6.7) y el `field_confidence` de cinco campos requeridos (§6.9). Sin esas dos piezas, TC-12 no se puede ni escribir.

**Efecto colateral:** el set pasa de 11 a 12 casos. Hay que actualizar S7, la síntesis de T4, el §6.2 del backlog y la cobertura del ER.