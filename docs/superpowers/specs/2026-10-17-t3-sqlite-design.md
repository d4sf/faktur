# T3 · SQLite: DDL, reglas de integridad, 8 proveedores y budgets — Design

**Fecha:** 2026-10-17
**Estado:** aprobado, pendiente de plan e implementación
**Backlog:** `docs/backlog_implementacion_mvp.md` §T3
**Depende de:** T1 (mergeado), T2 (mergeado, para los enums que el DDL replica)
**ER de referencia:** `docs/propuesta_modelo_ER_faktur.md` §2-§4

## 1. Intent y por qué

El agente necesita persistir ingesta, extracción, decisión, HITL y auditoría de forma reproducible. La garantía anti-doble-pago y las reglas de integridad no pueden depender de que el código TypeScript se acuerde de validar: tienen que ser restricciones de la base. Y el reenvío duplicado tiene que quedar auditable (tabla `ingest_attempts`), no descartado en silencio.

T3 traduce el ER (11 entidades, 12 reglas de integridad) a DDL SQLite ejecutable, con CHECKs, FKs, índices, y seed de 8 proveedores + policy v1 + 4 fx_rates. Es el cimiento sobre el que T4 (fixtures), T5 (motor) y T8 (endpoints) construyen.

## 2. Goals

- 12 tablas creadas con `CREATE TABLE IF NOT EXISTS`: `categories`, `vendors`, `invoices`, `ingest_attempts`, `line_items`, `policies`, `policy_category_budgets`, `fx_rates`, `decisions`, `approvals`, `ledger_entries`, `notifications`.
- `PRAGMA foreign_keys = ON` en cada conexión.
- CHECK constraints sobre todos los enums (verdict, reason_code, invoice status, approval status, attempt status, vendor status, notification channel/status, entry_type).
- UNIQUE constraints: `invoices.file_hash`, `UNIQUE(vendor_id, invoice_number)` (parcial, donde ambos no nulos), `approvals.decision_id`, `decisions.id`.
- FKs con `ON DELETE` apropiado (cascade para line_items, restrict para decisions).
- Índices del ER §7 (file_hash en ingest_attempts, etc.).
- Seed: 8 proveedores, policy v1 con 6 budgets por categoría, 4 fx_rates.
- Módulo inyectable: `loadDb(path)` + `getDb()` con guard.
- Toda transición prohibida de `estados_factura` responde error a nivel de aplicación (RI-3, RI-4, RI-5) — el DDL provee las restricciones, la capa de aplicación (T6/T16) las traduce a 409.

## 3. Non-goals (explícito)

- **No se crea un sistema de migraciones.** `CREATE TABLE IF NOT EXISTS` es suficiente para MVP. Si el schema cambia, se borra la base y se recrea. Migraciones incrementales son fase 2.
- **No se crea una capa de repositorio.** T3 solo provee DDL + seed + acceso. Las funciones de insert/query (ej. `insertInvoice`, `findVendorByTaxId`) son de T5 (motor) y T8 (endpoints).
- **No se añade WAL mode.** Para un demo single-user, el modo default de SQLite es suficiente. WAL se puede añadir después si hay problemas de concurrencia.
- **No se añaden tests del web.** El web no tiene tests hoy.
- **No se implementa `notifications` como funcional.** La tabla existe (para RI-10 y reproducibilidad), pero la lógica de envío es T17.

## 4. Constraints

- **Stack fijo** (ADR 0001): `better-sqlite3@13` (ya en dependencies, prebuilds para Alpine musl). No se cambia a `node:sqlite`.
- **IDs como TEXT con UUID.** Los schemas de T2 usan `z.string().min(1)`. Se generan con `crypto.randomUUID()` en TypeScript. Las tablas de seed usan claves naturales (`tax_id`, `version`, `currency`) como PK.
- **Enums como CHECK constraints.** Los valores deben coincidir exactamente con los de T2: `PAGAR | FRENAR | ESCALAR`, `SUCCESS_TOUCHLESS_STP | ERR_INVALID_DATA | ...`, etc. Sin tilde en los estados de factura.
- **FKs activas.** `PRAGMA foreign_keys = ON` debe ejecutarse en cada conexión nueva. better-sqlite3 no lo activa por defecto.
- **Inyectable.** `loadDb(path)` abre/crea la base, aplica DDL + seed si es nueva, y la cachea. `getDb()` devuelve la base cacheada o lanza si no se ha cargado. Sigue el patrón de T1 (`loadEnv(source)`).
- **Paths relativos en DDL.** El schema SQL va en un archivo `.sql` o en un template string en `schema.ts`. Prefiero template string en TS para tener type-safety y evitar archivos sueltos.
- **Seed idempotente.** `INSERT OR IGNORE` para que re-cargar la base no duplique datos.
- **Test isolation.** Los tests llaman `closeDb()` en `afterEach`/`after` para liberar la instancia cacheada. `loadDb(":memory:")` no tiene caché especial; siempre se cachea y se libera con `closeDb()`.
- **RI-3 y RI-5 son de aplicación, no de DDL.** El DDL provee las FKs; el endpoint/motor verifica el veredicto antes de insertar. SQLite no puede verificar el verdict de un decision_id referenciado sin trigger.
- **`invoices.currency` es FK a `fx_rates(currency)`.** Obliga a que fx_rates esté seeded antes de insertar facturas. El seed inserta fx_rates antes que cualquier factura (que viene de runtime, no de seed).
- **`vendors.category` es FK a `categories(name)`.** Y `policy_category_budgets.category` también. La tabla `categories` es la fuente de verdad de las 6 categorías.
- **Timestamps como ISO-8601 strings.** Validación de formato solo en la capa de aplicación (T2 Zod), no en DDL (SQLite no soporta REGEXP por defecto).
- **Montos con CHECK >= 0.** `subtotal`, `tax_amount`, `total_amount`, `historical_avg_usd`, `amount_usd_evaluated`, `budget_usd`, `auto_approval_threshold_usd`, `monthly_budget_usd`, `rate_to_usd` (CHECK > 0), `total_usd`, `byte_size` (INTEGER, CHECK >= 0).

## 5. Decisiones tomadas en esta sesión

| Decisión | Elegido | Por qué |
|:---|:---|:---|
| Driver | `better-sqlite3` (ya en deps) | Prebuilds disponibles, síncrono, simple. |
| IDs | `TEXT` con `crypto.randomUUID()` | Compatible con T2, sin capa de conversión. |
| DDL | `CREATE TABLE IF NOT EXISTS` en template string TS | Idempotente, sin archivos sueltos, type-safe. |
| Módulo | Inyectable (`loadDb` + `getDb`) | Tests herméticos con base temporal. |
| Migraciones | Ninguna (one-shot) | MVP; si cambia el schema, se borra y recrea. |
| WAL | No (modo default) | Single-user demo; se puede añadir después. |
| FK enforcement | `PRAGMA foreign_keys = ON` por conexión | Obligatorio para que las FKs funcionen en SQLite. |
| Seed | Función `seed(db)` llamada desde `loadDb` si las tablas están vacías | Idempotente con `INSERT OR IGNORE`. |

## 6. Estructura de archivos

| Archivo | Acción | Responsabilidad |
|:---|:---|:---|
| `api/src/db/schema.ts` | Crear | DDL: `CREATE TABLE` para las 11 tablas + índices. Exporta `SCHEMA_SQL` (string) y `applySchema(db)`. |
| `api/src/db/seed.ts` | Crear | `seedVendors(db)`, `seedPolicies(db)`, `seedFxRates(db)`. Usa `INSERT OR IGNORE`. |
| `api/src/db/index.ts` | Crear | `loadDb(path)`, `getDb()`, `closeDb()`. Aplica schema + seed. Guard si no inicializado. |
| `api/src/db/index.test.ts` | Crear | Tests de schema, constraints, seed. |
| `api/package.json` | Modificar | Añadir `src/db/index.test.ts` al script `test`. |

## 7. DDL — tablas y constraints clave

### 7.0 `categories`
```sql
CREATE TABLE categories (
  name TEXT PRIMARY KEY
);
```

Seed: `INSERT OR IGNORE INTO categories (name) VALUES ('Infraestructura'),('Diseno'),('Marketing'),('Legal'),('Software'),('Retail');`

### 7.1 `vendors`
```sql
CREATE TABLE vendors (
  id TEXT PRIMARY KEY,
  tax_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL REFERENCES categories(name),
  status TEXT NOT NULL CHECK (status IN ('ALLOWLISTED','BLOCKLISTED')),
  historical_avg_usd REAL NOT NULL DEFAULT 0 CHECK (historical_avg_usd >= 0),
  first_seen_at TEXT,
  last_seen_at TEXT
);
```

### 7.2 `invoices`
```sql
CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  vendor_id TEXT REFERENCES vendors(id),
  invoice_number TEXT,
  status TEXT NOT NULL CHECK (status IN ('RECIBIDA','EXTRAIDA','DECIDIDA','PENDIENTE_APROBACION','APROBADA','NEGADA','FRENADA')),
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_hash TEXT NOT NULL UNIQUE,
  issue_date TEXT,
  due_date TEXT,
  currency TEXT NOT NULL REFERENCES fx_rates(currency),
  subtotal REAL CHECK (subtotal IS NULL OR subtotal >= 0),
  tax_amount REAL CHECK (tax_amount IS NULL OR tax_amount >= 0),
  total_amount REAL NOT NULL CHECK (total_amount >= 0),
  fx_rate_used REAL NOT NULL,
  total_usd REAL NOT NULL,
  extraction_confidence REAL,
  extraction_json TEXT NOT NULL,
  ingested_at TEXT NOT NULL,
  UNIQUE(vendor_id, invoice_number)
);
```

Nota: el `UNIQUE(vendor_id, invoice_number)` es parcial en el sentido de que SQLite trata NULLs como distintos (dos filas con `vendor_id = NULL` e `invoice_number = 'X'` no violan el constraint). Esto es el comportamiento deseado: TC-08 (sin vendor) no dispara el dedup por tupla.

### 7.3 `ingest_attempts`
```sql
CREATE TABLE ingest_attempts (
  id TEXT PRIMARY KEY,
  invoice_id TEXT REFERENCES invoices(id),
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  file_hash TEXT NOT NULL,
  attempt_status TEXT NOT NULL CHECK (attempt_status IN ('RECIBIDA','DUPLICADA','RECHAZADA')),
  duplicate_of_invoice_id TEXT REFERENCES invoices(id),
  submitted_at TEXT NOT NULL
);
CREATE INDEX idx_ingest_attempts_file_hash ON ingest_attempts(file_hash);
```

### 7.4 `line_items`
```sql
CREATE TABLE line_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity >= 0),
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  total REAL NOT NULL CHECK (total >= 0)
);
```

### 7.5 `policies`
```sql
CREATE TABLE policies (
  version TEXT PRIMARY KEY,
  auto_approval_threshold_usd REAL NOT NULL CHECK (auto_approval_threshold_usd >= 0),
  monthly_budget_usd REAL NOT NULL CHECK (monthly_budget_usd >= 0),
  vendor_drift_factor REAL NOT NULL CHECK (vendor_drift_factor > 0),
  allowed_currencies TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  comment TEXT NOT NULL
);
```

`allowed_currencies` se guarda como JSON string (`'["USD","MXN","COP","EUR"]'`). La validación de que sea un array válido de monedas es de T5 (motor), no del DDL.

### 7.6 `policy_category_budgets`
```sql
CREATE TABLE policy_category_budgets (
  policy_version TEXT NOT NULL REFERENCES policies(version),
  category TEXT NOT NULL REFERENCES categories(name),
  budget_usd REAL NOT NULL CHECK (budget_usd >= 0),
  PRIMARY KEY (policy_version, category)
);
```

### 7.7 `fx_rates`
```sql
CREATE TABLE fx_rates (
  currency TEXT PRIMARY KEY,
  rate_to_usd REAL NOT NULL CHECK (rate_to_usd > 0),
  as_of TEXT NOT NULL
);
```

### 7.8 `decisions`
```sql
CREATE TABLE decisions (
  id TEXT PRIMARY KEY,
  invoice_id TEXT REFERENCES invoices(id),
  ingest_attempt_id TEXT REFERENCES ingest_attempts(id),
  verdict TEXT NOT NULL CHECK (verdict IN ('PAGAR','FRENAR','ESCALAR')),
  reason_code TEXT NOT NULL CHECK (reason_code IN ('SUCCESS_TOUCHLESS_STP','ERR_INVALID_DATA','ALERT_LOW_CONFIDENCE','ERR_DUPLICATE_INVOICE','ERR_BLACKLISTED_VENDOR','ALERT_NEW_VENDOR','ALERT_VENDOR_DRIFT','ALERT_BUDGET_OVERRUN','ALERT_BUDGET_TIGHT','ALERT_THRESHOLD_EXCEEDED')),
  explanation TEXT NOT NULL,
  policy_version TEXT NOT NULL REFERENCES policies(version),
  amount_usd_evaluated REAL NOT NULL CHECK (amount_usd_evaluated >= 0),
  decided_by TEXT NOT NULL CHECK (decided_by IN ('AGENTE','HUMANO')),
  decided_at TEXT NOT NULL,
  CHECK (
    (invoice_id IS NOT NULL AND ingest_attempt_id IS NULL) OR
    (invoice_id IS NULL AND ingest_attempt_id IS NOT NULL)
  )
);
```

El CHECK de RI-11 (exactamente uno de invoice_id/ingest_attempt_id) está en el DDL.

### 7.9 `approvals`
```sql
CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL UNIQUE REFERENCES decisions(id),
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  status TEXT NOT NULL CHECK (status IN ('PENDIENTE','APROBADA','NEGADA')),
  requested_at TEXT NOT NULL,
  resolved_by TEXT,
  resolved_at TEXT,
  comment TEXT,
  override_with_overbudget INTEGER NOT NULL DEFAULT 0 CHECK (override_with_overbudget IN (0,1))
);
```

RI-3 (HITL solo sobre ESCALAR) es de aplicación, no de DDL. El DDL no puede verificar el verdict del decision_id referenciado sin un trigger. Se implementa en T16 (endpoint) con un check antes del INSERT.

### 7.10 `ledger_entries`
```sql
CREATE TABLE ledger_entries (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  decision_id TEXT NOT NULL REFERENCES decisions(id),
  policy_version TEXT NOT NULL,
  amount_usd REAL NOT NULL CHECK (amount_usd >= 0),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('COMPROMISO_PAGAR')),
  created_at TEXT NOT NULL
);
```

RI-5 (ledger solo PAGAR) es de aplicación: el endpoint/motor verifica que el veredicto final sea PAGAR antes de insertar. El DDL no puede verificarlo sin trigger.

### 7.11 `notifications`
```sql
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  invoice_id TEXT REFERENCES invoices(id),
  decision_id TEXT REFERENCES decisions(id),
  channel TEXT NOT NULL CHECK (channel IN ('SLACK_CARD','WEBHOOK','CONSOLE','EMAIL_LOCAL')),
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDIENTE','ENVIADA','FALLIDA')),
  created_at TEXT NOT NULL
);
```

## 7.12 Índices

```sql
CREATE INDEX idx_ingest_attempts_file_hash ON ingest_attempts(file_hash);
CREATE INDEX idx_invoices_vendor_id ON invoices(vendor_id);
CREATE INDEX idx_decisions_invoice_id ON decisions(invoice_id);
CREATE INDEX idx_decisions_ingest_attempt_id ON decisions(ingest_attempt_id);
CREATE INDEX idx_line_items_invoice_id ON line_items(invoice_id);
CREATE INDEX idx_ledger_entries_invoice_id ON ledger_entries(invoice_id);
CREATE INDEX idx_ledger_entries_decision_id ON ledger_entries(decision_id);
CREATE INDEX idx_notifications_invoice_id ON notifications(invoice_id);
CREATE INDEX idx_notifications_decision_id ON notifications(decision_id);
CREATE UNIQUE INDEX idx_policies_one_active ON policies(is_active) WHERE is_active = 1;
```

## 8. Seed data

### 8.0 Categories (6)

```sql
INSERT OR IGNORE INTO categories (name) VALUES
  ('Infraestructura'),('Diseno'),('Marketing'),('Legal'),('Software'),('Retail');
```

Verificación: `SELECT COUNT(*) FROM categories` = 6.

### 8.1 Vendors (8)

Los 8 de §6.1 del backlog. `id` = UUID generado, `tax_id` = clave de negocio.

| tax_id | display_name | category | status | historical_avg_usd |
|:---|:---|:---|:---|---:|
| CLOUD-SERVERS-INC | CloudServers Inc | Infraestructura | ALLOWLISTED | 420 |
| DEVSTUDIO-LATAM | DevStudio Latam | Diseno | ALLOWLISTED | 850 |
| GROWTH-AGENCY | Growth Agency | Marketing | ALLOWLISTED | 3000 |
| LEGAL-GLOBAL | Legal Global | Legal | ALLOWLISTED | 4000 |
| FREELANCE-DESIGN | Freelance Design | Diseno | ALLOWLISTED | 480 |
| SAAS-TOOLS-LTD | SaaS Tools Ltd | Software | ALLOWLISTED | 120 |
| AWS-AMAZON | AWS Amazon | Infraestructura | ALLOWLISTED | 350 |
| VENTA-POS-DUO | Venta Pos Duo | Retail | BLOCKLISTED | 0 |

`first_seen_at` y `last_seen_at` se setean al timestamp de seed.

### 8.2 Policies (v1)

```sql
INSERT INTO policies (version, auto_approval_threshold_usd, monthly_budget_usd, vendor_drift_factor, allowed_currencies, is_active, created_at, created_by, comment)
VALUES ('v1', 1000.0, 5000.0, 1.4, '["USD","MXN","COP","EUR"]', 1, '2026-10-17T00:00:00Z', 'KAY/O', 'Version 1 congelada del MVP.');
```

### 8.3 Policy category budgets (v1)

| category | budget_usd |
|:---|---:|
| Infraestructura | 1500 |
| Diseno | 1000 |
| Marketing | 4000 |
| Legal | 3000 |
| Software | 500 |
| Retail | 0 |

### 8.4 FX rates (4)

| currency | rate_to_usd | as_of |
|:---|---:|:---|
| USD | 1.0 | 2026-10-17 |
| MXN | 0.055 | 2026-10-17 |
| COP | 0.00024 | 2026-10-17 |
| EUR | 1.08 | 2026-10-17 |

## 8.5 Verificación de seed

Después de ejecutar `seed(db)`, verificar:

- `SELECT COUNT(*) FROM categories` = 6.
- `SELECT COUNT(*) FROM vendors` = 8.
- `SELECT COUNT(*) FROM policies` = 1 (version 'v1').
- `SELECT COUNT(*) FROM policy_category_budgets` = 6.
- `SELECT COUNT(*) FROM fx_rates` = 4.
- `SELECT tax_id FROM vendors ORDER BY tax_id` incluye los 8 tax_ids de §8.1.
- `SELECT version FROM policies` = 'v1'.
- `SELECT category FROM policy_category_budgets ORDER BY category` incluye las 6 categorías.

Si alguna verificación falla, `loadDb` lanza un error nombrando el conteo esperado y el obtenido. No se usa `INSERT OR IGNORE` silencioso sin verificación.

## 9. Módulo de acceso

### 9.1 `api/src/db/index.ts`

```ts
import Database from "better-sqlite3";

let db: Database.Database | null = null;

export function loadDb(path: string): Database.Database {
  if (db) return db;
  const instance = new Database(path);
  instance.pragma("foreign_keys = ON");
  applySchema(instance);
  seed(instance);
  db = instance;
  return db;
}

export function getDb(): Database.Database {
  if (!db) throw new Error("DB no inicializada: llamar loadDb(path) primero");
  return db;
}

export function closeDb(): void {
  if (db) { db.close(); db = null; }
}
```

`path` puede ser `":memory:"` para tests. `applySchema` ejecuta `SCHEMA_SQL` (múltiples statements con `db.exec()`). `seed` usa `INSERT OR IGNORE`.

### 9.2 Path por defecto

El arranque del server (T1) usa `DATA_DIR` (de `env.ts`). El path de la base es `${DATA_DIR}/faktur.db`. `loadDb` se llama en `server.ts` después de `loadEnv()`.

## 10. Criterio de aceptación (del backlog)

- Insertar un `file_hash` repetido en `invoices` falla por constraint (no por un `if` en TS).
- El mismo hash sí entra en `ingest_attempts`.
- Crear una aprobación sobre un veredicto que no sea ESCALAR falla (RI-3, capa de aplicación).
- `decisions.policy_version` es `NOT NULL`.
- Toda transición prohibida de `estados_factura` revienta en la capa de aplicación con 409.
- Seed correcto: 8 vendors, policy v1 con 6 budgets, 4 fx_rates.

## 11. Lo que queda al builder

- Decidir si los CHECK constraints de `allowed_currencies` (JSON array) se validan en DDL o en la capa de aplicación. Recomendación: en la capa de aplicación (T5), el DDL solo verifica que no sea null/empty.
- Decidir el formato de timestamps: ISO-8601 string (`2026-10-17T00:00:00Z`) o Unix epoch. Recomendación: ISO string, consistente con `z.iso.datetime()` de T2.
- Decidir si `byte_size` es INTEGER o REAL. Recomendación: INTEGER (es un conteo de bytes).
- Verificar que `better-sqlite3` prebuilds resuelven en la imagen de prod (ya verificado en T1, pero conviene re-verificar con la base real).

## 12. Fuera de scope (explícito)

- Sistema de migraciones incremental.
- Capa de repositorio (funciones de insert/query) — eso es T5/T8.
- WAL mode.
- Tabla `users` / RBAC.
- `notifications` como funcional (la tabla existe, la lógica es T17).

## 13. Riesgos

- **`PRAGMA foreign_keys` se resetea por conexión.** better-sqlite3 abre una conexión por instancia; si se cierra y reabre, hay que re-ejecutar el pragma. Mitigación: `loadDb` lo ejecuta siempre al abrir.
- **`CREATE TABLE IF NOT EXISTS` no altera tablas existentes.** Si el schema cambia entre versiones, la base vieja no se actualiza. Para MVP se borra y recrea. Mitigación: documentar en el README.
- **Seed con `INSERT OR IGNORE` puede ocultar errores.** Si un proveedor tiene datos mal, el seed lo ignora silenciosamente. Mitigación: el seed verifica el conteo después de insertar y lanza si no son 8.
- **`allowed_currencies` como JSON string en SQLite.** SQLite no tiene tipo array. La validación de que sea un array válido de monedas es de T5. El DDL solo verifica `NOT NULL`.
EOF
echo "spec escrito"