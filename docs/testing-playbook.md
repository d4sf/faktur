# Playbook de pruebas — Demo Faktur / Blinka PayAgent

Guía paso a paso para probar toda la funcionalidad implementada hasta la fecha. Cada sección incluye los pasos, el resultado esperado y qué verificar.

## Prerrequisitos

```bash
# Levantar el entorno
bash ./scripts/compose.sh up -d
# Verificar que está healthy
bash ./scripts/compose.sh ps
```

Esperar a que el status sea `Up (healthy)`. La API está en `http://localhost:3000`, el web en `http://localhost:5173`.

---

## 1. Health check y entorno base

**Pasos:**
1. Abrir http://localhost:3000/api/health
2. Abrir http://localhost:5173

**Esperado:**
- API responde `{"status":"ok"}`
- Web muestra el Tablero con sidebar (8 rutas + Datos), theme toggle y cards

---

## 2. Seed de datos demo

**Pasos:**
1. Navegar a `/datos` en el sidebar
2. Seleccionar perfil "Base demo"
3. Escribir `REINICIAR` en el campo de confirmación
4. Clic en "Reiniciar base"

**Esperado:**
- Conteo de filas por tabla se actualiza
- 12 facturas sembradas con sus decisiones
- 2 aprobaciones pendientes (TC-04 y TC-12)

---

## 3. Tablero (Dashboard)

**URL:** http://localhost:5173/

**Pasos:**
1. Verificar las 3 cards de ROI en la parte superior
2. Verificar la tabla de facturas (12 filas, orden LIFO)
3. Click en "Ver detalle" de una factura
4. Cerrar el inspector

**Esperado:**
- **Card Touchless Rate:** muestra porcentaje (ej. 25.0%)
- **Card Presupuesto Restante:** muestra monto en USD
- **Card Total Procesadas:** muestra 12
- **Tabla:** 12 filas con folio, proveedor, fecha, monto USD, badge de veredicto, reason_code + explanation, botón "Ver detalle"
- **Botón "Revisar":** solo aparece en facturas ESCALADAS (TC-04, TC-05, TC-06, TC-07, TC-10, TC-12)
- **Inspector lateral:** se abre desde la derecha, muestra datos, decisión, línea de tiempo (INGESTA → EXTRACCIÓN → DECISIÓN → RESOLUCIÓN), resolución humana si aplica
- **Empty state:** si la base está vacía, muestra "Sin registros" con link "Subir factura"

**Verificar responsive:**
- Desktop (>1024px): tabla completa, sidebar visible
- Tablet (640-1024px): columnas Fecha y Monto USD ocultas
- Mobile (<640px): solo Folio + Veredicto + Acción, sidebar como hamburger (Sheet)

---

## 4. Subir factura (Dropzone)

**URL:** http://localhost:5173/subir

### 4.1 Casos demo (offline, sin API)

**Pasos:**
1. Clic en "INV-01 (Amazon AWS)" → simula procesamiento
2. Observar la barra de progreso y los mensajes

**Esperado:**
- Estado cambia a "PROCESSING" con barra de progreso
- Mensajes: "Extrayendo datos...", "Verificando estructura...", etc.
- Al terminar: estado "COMPLETED" con veredicto PAGAR (badge verde)
- Se muestra la ficha de la factura + verificación de reglas + próximo paso

### 4.2 Subida real (con API)

**Pasos:**
1. Seleccionar un archivo PDF/JPG/PNG/JSON con "Seleccionar factura"
2. Observar el procesamiento

**Esperado:**
- El archivo se envía a `POST /api/invoices`
- Se extrae con Gemini (si hay API key) o se usa Mock JSON
- Se muestra el veredicto real con reason_code y explanation
- Si es ESCALAR, aparece el chat de revisión (PayAgentChat)

### 4.3 Bloqueo de doble envío

**Pasos:**
1. Iniciar subida de un archivo
2. Intentar subir otro archivo mientras procesa

**Esperado:**
- El segundo envío se ignora (el dropzone está bloqueado durante el procesamiento)

### 4.4 Reenvío duplicado

**Pasos:**
1. Subir una factura que ya fue procesada (mismo archivo)
2. Verificar el resultado

**Esperado:**
- Se muestra veredicto FRENAR con reason_code `ERR_DUPLICATE_INVOICE`
- No se muestra un error, sino un veredicto normal

---

## 5. Detalle de factura

**URL:** http://localhost:5173/factura/:id

**Pasos:**
1. Navegar a una factura existente (ej. `/factura/<id>`)

**Esperado:**
- Se muestra el detalle con los datos de la factura
- (Actualmente es un placeholder "Próximamente" — pendiente de implementar)

---

## 6. Reglas de política (Editor)

**URL:** http://localhost:5173/reglas

### 6.1 Vista estática

**Pasos:**
1. Verificar la tabla de 8 reglas (Regla, Nombre, Salida canónica, Condición de disparo, Acción)
2. Verificar los 4 KPIs (Umbral $1,000, Presupuesto $5,000, Drift 1.4x, Confianza 70%)
3. Verificar los 6 budgets por categoría

**Esperado:**
- Tabla con 8 filas, badges de veredicto (PAGAR/FRENAR/ESCALAR)
- KPIs con valores formateados
- Budgets: Marketing $4,000, Legal $3,000, Infraestructura $1,500, Diseño $1,000, Software $500, Retail $0

### 6.2 Editor interactivo

**Pasos:**
1. Mover el slider de "Umbral autónomo" de $1,000 a $300
2. Verificar que el valor se actualiza ($300.00)
3. Verificar que el botón "Simular" se habilita
4. Verificar que "Aplicar" sigue deshabilitado

**Esperado:**
- Slider funciona, valor se actualiza en tiempo real
- "Simular" se habilita al cambiar un parámetro
- "Aplicar" deshabilitado hasta simular

### 6.3 Simulación

**Pasos:**
1. Con umbral en $300, presionar "Simular"
2. Observar la tabla de resultados

**Esperado:**
- Botón muestra "Simulando..." y se deshabilita
- Aparece tabla con facturas afectadas (before → after)
- Cada fila: Folio, Proveedor, Antes (badge), Después (badge), Nuevo motivo
- Si no hay afectadas: "Ninguna factura se vería afectada con estos parámetros."

### 6.4 Invalidación de simulación

**Pasos:**
1. Después de simular, mover cualquier slider
2. Verificar que la simulación se borra

**Esperado:**
- Simulación se borra automáticamente
- Aparece "Los parámetros cambiaron, presiona Simular de nuevo"
- "Aplicar" se deshabilita

### 6.5 Aplicar

**Pasos:**
1. Ajustar sliders (ej. umbral a $300)
2. Presionar "Simular"
3. Presionar "Aplicar"

**Esperado:**
- Botón muestra "Aplicando..."
- Badge cambia a "v2 activa"
- Sliders se resetean a valores de v2
- Simulación se limpia
- "Aplicar" se deshabilita

### 6.6 Volver a la versión base

**Pasos:**
1. Ajustar sliders sin aplicar
2. Presionar "Volver a la versión base"

**Esperado:**
- Todos los sliders vuelven a valores de la política activa
- Comment vuelve a "Ajuste manual de parámetros"
- Simulación se limpia

### 6.7 Budgets por categoría

**Pasos:**
1. Cambiar el budget de "Software" de $500 a $1000
2. Simular

**Esperado:**
- Tabla editable acepta el cambio
- Al simular, las facturas de Software que antes excedían el budget ahora pasan

---

## 7. Bandeja de aprobaciones (HITL)

**URL:** http://localhost:5173/bandeja

**Pasos:**
1. Navegar a "Bandeja" en el sidebar
2. Verificar las tarjetas de aprobación pendiente

**Esperado:**
- Tarjetas para facturas ESCALADAS (TC-04, TC-05, TC-06, TC-07, TC-10, TC-12)
- Cada tarjeta muestra: invoice_id, proveedor, importe, reason_code, explanation, fecha
- Botón "Revisar" en cada tarjeta

**Pasos (aprobar):**
1. Click en "Revisar" de una tarjeta
2. En el modal, click "Autorizar Pago"
3. Verificar que la tarjeta desaparece de la bandeja

**Esperado:**
- La factura pasa a PAGAR
- Se descuenta el presupuesto (si aplica)
- Se crea un ledger entry
- No se puede aprobar dos veces (segunda llamada retorna `already_resolved`)

---

## 8. Detalle de aprobación

**URL:** http://localhost:5173/aprobacion/:id

**Pasos:**
1. Navegar a una aprobación pendiente

**Esperado:**
- Se muestra el detalle de la aprobación
- Botones para aprobar/rechazar
- (Actualmente puede ser placeholder — verificar estado actual)

---

## 9. Reporte CSV

**URL:** http://localhost:5173/reporte

**Pasos:**
1. Navegar a "Reporte" en el sidebar
2. Click en "Descargar CSV"

**Esperado:**
- Se descarga un archivo CSV con las facturas procesadas
- Columnas: ID, Emisor, Monto Original, Monto USD, Estado, Justificación, Acción
- El CSV es reproducible (mismo resultado en cualquier orden)

---

## 10. Datos (Administración)

**URL:** http://localhost:5173/datos

**Pasos:**
1. Verificar el conteo de filas por tabla
2. Seleccionar perfil "Base demo"
3. Escribir `REINICIAR` en el campo de confirmación
4. Clic en "Reiniciar base"

**Esperado:**
- Conteo se actualiza (12 facturas, 12 decisiones, etc.)
- Perfiles: "reference" (solo schema + seed base) y "demo" (12 TCs con decisiones y aprobaciones)

---

## 11. Tema (Dark/Light)

**Pasos:**
1. Click en el toggle de tema (footer del sidebar o header mobile)
2. Verificar que el tema cambia
3. Recargar la página
4. Verificar que la preferencia persiste

**Esperado:**
- Toggle cambia entre dark y light
- Persiste en `localStorage`
- Anti-FOUC: no hay flash de tema claro al cargar

---

## 12. Responsive

**Pasos:**
1. Redimensionar la ventana del browser

**Esperado:**
- **Desktop (>1024px):** sidebar visible, Bento Grid 4 columnas, tabla completa
- **Tablet (640-1024px):** sidebar colapsado (Sheet), Bento Grid 2 columnas, tabla con columnas ocultas
- **Mobile (<640px):** sidebar como Sheet (hamburger), Bento Grid 1 columna, tabla con solo Folio + Veredicto + Acción

---

## 13. Comandos de calidad

```bash
# Typecheck (api + web)
bash ./scripts/compose.sh exec -T app npm run typecheck

# Lint
bash ./scripts/compose.sh exec -T app npm run lint

# Tests (api + web)
bash ./scripts/compose.sh exec -T app npm test

# Build del web
bash ./scripts/compose.sh exec -T app npm run build -w web

# Prettier
bash ./scripts/compose.sh exec -T app npx prettier --check .

# Build de producción (Docker)
COMPOSE_ENV=prod bash ./scripts/compose.sh build
```

Todos deberían pasar sin errores.

---

## 14. API endpoints (verificación directa)

```bash
# Health
curl -s http://localhost:3000/api/health
# → {"status":"ok"}

# Audit trail (métricas + registros)
curl -s http://localhost:3000/api/audit-trail | head -c 200

# Policy
curl -s http://localhost:3000/api/policy | head -c 200

# Aprobaciones pendientes
curl -s http://localhost:3000/api/approvals?status=pendiente | head -c 200

# Detalle de factura (reemplazar ID)
curl -s http://localhost:3000/api/invoices/<invoice_id> | head -c 200
```

---

## 15. Parar el entorno

```bash
bash ./scripts/compose.sh down
```

---

## Notas

- El `DESIGN.md` en la raíz documenta toda la política de estilos. Si modificas componentes, sigue las convenciones ahí definidas.
- El frontend consume la API en `/api/*`. En dev, Vite proxea a `localhost:3000`. En prod, Fastify sirve el SPA del mismo origen.
- Los datos demo (perfil "demo") siembran los 12 TCs con sus decisiones y aprobaciones. El perfil "reference" solo siembra categorías, vendors, policy v1, budgets y fx_rates.
- El `ALLOW_DB_RESET=true` es necesario para habilitar el reset de base de datos. En producción, se requiere un `ADMIN_TOKEN`.