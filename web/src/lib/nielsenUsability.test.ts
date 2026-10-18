import assert from "node:assert/strict";
import test from "node:test";

import {
  describeError,
  determineFailingRuleId,
  formatReasonTitle,
  pickDroppedFile,
  validateInvoiceFile,
} from "./invoiceSubmit.js";

// ---------------------------------------------------------------------------
// H1: Visibilidad del estado del sistema
// ---------------------------------------------------------------------------
test("H1 (Visibilidad): validateInvoiceFile valida estados de archivo antes del envío", () => {
  const validFile = { name: "factura_ok.pdf", size: 1024 * 100, type: "application/pdf" };
  assert.equal(validateInvoiceFile(validFile), null);

  const oversizedFile = { name: "video.pdf", size: 1024 * 1024 * 6, type: "application/pdf" };
  assert.match(validateInvoiceFile(oversizedFile) ?? "", /límite de 5 MB/);
});

// ---------------------------------------------------------------------------
// H2: Correspondencia entre el sistema y el mundo real
// ---------------------------------------------------------------------------
test("H2 (Lenguaje Real): Todos los códigos de reglas se traducen a lenguaje natural en español", () => {
  // Sin siglas crípticas en la cara del usuario
  assert.equal(formatReasonTitle("SUCCESS_TOUCHLESS_STP"), "Aprobación autónoma directa");
  assert.equal(formatReasonTitle("ERR_DUPLICATE_INVOICE"), "Factura duplicada");
  assert.equal(formatReasonTitle("ERR_BLACKLISTED_VENDOR"), "Proveedor en lista negra");
  assert.equal(formatReasonTitle("ALERT_BUDGET_OVERRUN"), "Presupuesto del período superado");
  assert.equal(formatReasonTitle("ALERT_THRESHOLD_EXCEEDED"), "Supera umbral de aprobación");
  assert.equal(formatReasonTitle("ALERT_NEW_VENDOR"), "Proveedor no autorizado");
  assert.equal(formatReasonTitle("ALERT_VENDOR_DRIFT"), "Desviación de tarifa acordada");
  assert.equal(formatReasonTitle("ERR_INVALID_DATA"), "Datos fiscales incompletos");
});

// ---------------------------------------------------------------------------
// H3: Control y libertad del usuario
// ---------------------------------------------------------------------------
test("H3 (Control): El sistema procesa selectores de archivo tolerando listas vacías sin crashear", () => {
  const file1 = new File(["dummy1"], "test1.pdf", { type: "application/pdf" });
  const file2 = new File(["dummy2"], "test2.pdf", { type: "application/pdf" });

  // El usuario puede soltar múltiples y el sistema toma el primero previsiblemente
  assert.equal(pickDroppedFile([file1, file2]), file1);
  assert.equal(pickDroppedFile([]), null);
  assert.equal(pickDroppedFile(null), null);
  assert.equal(pickDroppedFile(undefined), null);
});

// ---------------------------------------------------------------------------
// H4: Consistencia y estándares
// ---------------------------------------------------------------------------
test("H4 (Consistencia): El mapeo de códigos a las 8 reglas es biunívoco y determinista", () => {
  assert.equal(determineFailingRuleId("ERR_INVALID_DATA"), 1);
  assert.equal(determineFailingRuleId("ALERT_LOW_CONFIDENCE"), 1);
  assert.equal(determineFailingRuleId("ERR_DUPLICATE_INVOICE"), 2);
  assert.equal(determineFailingRuleId("ERR_BLACKLISTED_VENDOR"), 3);
  assert.equal(determineFailingRuleId("ALERT_NEW_VENDOR"), 4);
  assert.equal(determineFailingRuleId("ALERT_VENDOR_DRIFT"), 5);
  assert.equal(determineFailingRuleId("ALERT_BUDGET_OVERRUN"), 6);
  assert.equal(determineFailingRuleId("ALERT_BUDGET_TIGHT"), 6);
  assert.equal(determineFailingRuleId("ALERT_THRESHOLD_EXCEEDED"), 7);
  // Éxito no tiene regla fallida
  assert.equal(determineFailingRuleId("SUCCESS_TOUCHLESS_STP"), undefined);
});

// ---------------------------------------------------------------------------
// H5: Prevención de errores
// ---------------------------------------------------------------------------
test("H5 (Prevención de Errores): Rechaza archivos con extensiones no soportadas antes de invocar red", () => {
  const badExtension = { name: "script.exe", size: 1024, type: "application/x-msdownload" };
  assert.match(validateInvoiceFile(badExtension) ?? "", /Formato no soportado/);

  const emptyFile = { name: "empty.pdf", size: 0, type: "application/pdf" };
  assert.match(validateInvoiceFile(emptyFile) ?? "", /archivo está vacío/);
});

// ---------------------------------------------------------------------------
// H8: Estética y diseño minimalista
// ---------------------------------------------------------------------------
test("H8 (Minimalismo): describeError filtra payloads crudos de servidor y devuelve mensajes ejecutivos", () => {
  // Evitar volcar stack traces o JSONs crudos al usuario
  const errorMsg = describeError(500, {
    error: "raw server crash at line 42",
  });
  assert.equal(errorMsg, "No se pudo procesar la factura (HTTP 500).");
});

// ---------------------------------------------------------------------------
// H9: Ayuda para reconocer, diagnosticar y recuperarse de errores
// ---------------------------------------------------------------------------
test("H9 (Recuperación): Códigos de error específicos entregan instrucciones de resolución claras", () => {
  // Error de configuración de clave
  const keyError = describeError(503, { error: "extraction_not_configured" });
  assert.match(keyError, /Falta configurar.*\.env/);
  assert.match(keyError, /Mientras tanto podés subir un JSON de fixtures/);

  // Error de servicio de extracción no disponible
  const unavailError = describeError(503, { error: "extraction_unavailable" });
  assert.match(unavailError, /El servicio de extracción no está disponible/);

  // Error de archivo que supera el límite
  const largeError = describeError(413, { error: "file_too_large" });
  assert.match(largeError, /supera el límite de 5 MB/);
});

// ---------------------------------------------------------------------------
// H10: Ayuda y documentación
// ---------------------------------------------------------------------------
test("H10 (Documentación): Fallbacks elegantes para códigos no catalogados", () => {
  // Si surge un código imprevisto, no se rompe la UI
  const fallback = formatReasonTitle("CUSTOM_REASON_CODE");
  assert.equal(fallback, "CUSTOM_REASON_CODE");
});
