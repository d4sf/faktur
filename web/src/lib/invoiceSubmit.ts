/**
 * @file invoiceSubmit.ts
 * @description Lógica del envío de facturas al backend: validación del archivo, envío
 * multipart a `POST /api/invoices`, mapeo de la respuesta a `InvoiceData` y bloqueo de
 * doble envío. Vive fuera de React para poder testearse sin DOM.
 */

import type { InvoiceData, Verdict } from "@/types/invoice";

/**
 * Límite de subida alineado con `MAX_UPLOAD_BYTES` de la API.
 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Tipos MIME aceptados por el backend.
 */
export const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/json",
] as const;

/**
 * Extensiones aceptadas, usadas cuando el navegador no informa el MIME.
 */
export const ACCEPTED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".json"] as const;

/**
 * Mensajes legibles para los códigos de error de la API.
 */
const ERROR_MESSAGES: Record<string, string> = {
  file_too_large: "El archivo supera el límite de 5 MB.",
  invalid_file_type: "Formato no soportado. Usá PDF, PNG, JPG o JSON.",
  extraction_invalid:
    "El documento no parece una factura válida: no se pudieron extraer los datos.",
  extraction_unavailable: "El servicio de extracción no está disponible. Reintentá en un momento.",
  extraction_not_configured:
    "Falta configurar GEMINI_API_KEY en .env: sin la clave no se pueden leer PDFs ni imágenes. Mientras tanto podés subir un JSON de fixtures/ o usar un caso de ejemplo.",
  currency_not_allowed: "La moneda de la factura no está permitida por la política.",
  invalid_multipart: "No se pudo leer el archivo enviado.",
  missing_file: "No se recibió ningún archivo.",
};

/**
 * Etapa de progreso reportada por el submitter.
 */
export interface SubmitStage {
  progress: number;
  message: string;
}

/**
 * Resultado de un intento de envío.
 */
export type SubmitOutcome =
  | { status: "completed"; invoice: InvoiceData }
  | { status: "skipped" }
  | { status: "error"; message: string };

/**
 * Dependencias inyectables para poder testear el submitter sin red.
 */
export interface InvoiceSubmitterDeps {
  fetchImpl?: typeof fetch;
  onStage?: (stage: SubmitStage) => void;
}

/**
 * Valida tipo y tamaño de un archivo antes de enviarlo.
 *
 * @returns Un mensaje de error, o `null` si el archivo es válido.
 */
export function validateInvoiceFile(file: {
  name: string;
  size: number;
  type?: string;
}): string | null {
  if (file.size === 0) return "El archivo está vacío.";
  if (file.size > MAX_UPLOAD_BYTES) return "El archivo supera el límite de 5 MB.";

  const name = file.name.toLowerCase();
  const extensionAccepted = ACCEPTED_EXTENSIONS.some((extension) => name.endsWith(extension));
  const mimeAccepted =
    file.type !== undefined &&
    file.type !== "" &&
    (ACCEPTED_MIME_TYPES as readonly string[]).includes(file.type);

  if (!mimeAccepted && !extensionAccepted) {
    return "Formato no soportado. Usá PDF, PNG, JPG o JSON.";
  }
  return null;
}

/**
 * Toma el primer archivo de una lista (drop o input) y descarta el resto.
 */
export function pickDroppedFile(files: ArrayLike<File> | null | undefined): File | null {
  if (files === null || files === undefined || files.length === 0) return null;
  return files[0] ?? null;
}

/**
 * Asocia un `reason_code` con el número de regla determinista que lo produjo.
 */
export function determineFailingRuleId(reasonCode: string | undefined): number | undefined {
  if (reasonCode === "ERR_INVALID_DATA" || reasonCode === "ALERT_LOW_CONFIDENCE") return 1;
  if (reasonCode === "ERR_DUPLICATE_INVOICE") return 2;
  if (reasonCode === "ERR_BLACKLISTED_VENDOR") return 3;
  if (reasonCode === "ALERT_NEW_VENDOR") return 4;
  if (reasonCode === "ALERT_VENDOR_DRIFT") return 5;
  if (reasonCode === "ALERT_BUDGET_OVERRUN" || reasonCode === "ALERT_BUDGET_TIGHT") return 6;
  if (reasonCode === "ALERT_THRESHOLD_EXCEEDED") return 7;
  return undefined;
}

/**
 * Títulos amigables en lenguaje natural para los códigos canónicos de veredicto.
 */
export const REASON_TITLES: Record<string, string> = {
  SUCCESS_TOUCHLESS_STP: "Aprobación autónoma directa",
  ERR_INVALID_DATA: "Datos fiscales incompletos",
  ALERT_LOW_CONFIDENCE: "Confianza insuficiente en lectura",
  ERR_DUPLICATE_INVOICE: "Factura duplicada",
  ERR_BLACKLISTED_VENDOR: "Proveedor en lista negra",
  ALERT_NEW_VENDOR: "Proveedor no autorizado",
  ALERT_VENDOR_DRIFT: "Desviación de tarifa acordada",
  ALERT_BUDGET_OVERRUN: "Presupuesto del período superado",
  ALERT_BUDGET_TIGHT: "Saldo insuficiente en categoría",
  ALERT_THRESHOLD_EXCEEDED: "Supera umbral de aprobación",
};

/**
 * Retorna el título descriptivo en lenguaje natural de un código de razón.
 */
export function formatReasonTitle(code: string | undefined): string {
  if (!code) return "Evaluación completada";
  return REASON_TITLES[code] || code;
}

/**
 * Convierte cualquier código de razón técnico presente en un evento de línea de tiempo
 * a su equivalente descriptivo en lenguaje natural.
 */
export function formatTimelineDetail(detail: string): string {
  const match = detail.match(/^([A-Z]+)\s+([A-Z0-9_]+):\s*(.*)$/);
  if (match) {
    const [, verdict, code, explanation] = match;
    const title = formatReasonTitle(code);
    return `${verdict} · ${title}: ${explanation}`;
  }
  let res = detail;
  for (const [code, title] of Object.entries(REASON_TITLES)) {
    if (res.includes(code)) {
      res = res.replace(`${code}:`, `${title}:`).replace(code, title);
    }
  }
  return res;
}

/**
 * Respuesta de `POST /api/invoices` (campos que consume la UI).
 */
interface IngestResponse {
  attempt_id?: string;
  invoice_id?: string | null;
  status?: string;
  verdict?: string;
  reason_code?: string;
  explanation?: string;
  amount_usd_evaluated?: number;
}

/**
 * Mapea un código HTTP desconocido o un error de la API a un mensaje legible.
 */
export function describeError(status: number, payload: { error?: unknown } | null): string {
  const code = typeof payload?.error === "string" ? payload.error : null;
  if (code !== null && ERROR_MESSAGES[code] !== undefined) return ERROR_MESSAGES[code];
  return `No se pudo procesar la factura (HTTP ${status}).`;
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isVerdict(value: string | undefined): value is Verdict {
  return value === "PAGAR" || value === "FRENAR" || value === "ESCALAR";
}

/**
 * Construye el modelo de vista con los datos extraídos (best effort: si el detalle falla,
 * igual se muestra el veredicto de la respuesta).
 */
async function buildInvoice(
  file: File,
  result: IngestResponse,
  fetchImpl: typeof fetch,
): Promise<InvoiceData> {
  const invoice: InvoiceData = {
    id: result.invoice_id ?? result.attempt_id ?? `inv-${file.name}`,
    fileName: file.name,
    fileSize: `${Math.max(1, Math.round(file.size / 1024))} KB`,
    invoice_number: "—",
    vendor_name: "Proveedor identificado",
    vendor_tax_id: "N/A",
    issue_date: new Date().toISOString().slice(0, 10),
    due_date: "—",
    currency: "USD",
    total_amount: result.amount_usd_evaluated ?? 0,
    total_usd: result.amount_usd_evaluated ?? 0,
    concept: "Servicios procesados vía IA",
    verdict: isVerdict(result.verdict) ? result.verdict : "ESCALAR",
    reason_code: result.reason_code ?? "EVALUADA",
    reason_description: result.explanation ?? "Evaluación determinista completada con éxito.",
    failingRuleId: determineFailingRuleId(result.reason_code),
    duplicate: result.status === "DUPLICADA" || result.reason_code === "ERR_DUPLICATE_INVOICE",
  };

  if (result.invoice_id) {
    const detailResponse = await fetchImpl(`/api/invoices/${result.invoice_id}`).catch(() => null);
    if (detailResponse !== null && detailResponse.ok) {
      const detail = (await readJson(detailResponse)) as {
        audit_record?: Record<string, unknown>;
        vendor?: { display_name?: string; tax_id?: string };
      } | null;
      const record = detail?.audit_record;
      if (record) {
        invoice.invoice_number = (record.invoice_number as string) ?? invoice.invoice_number;
        invoice.vendor_name = detail?.vendor?.display_name ?? invoice.vendor_name;
        invoice.vendor_tax_id = detail?.vendor?.tax_id ?? invoice.vendor_tax_id;
        invoice.issue_date = (record.issue_date as string) ?? invoice.issue_date;
        invoice.due_date = (record.due_date as string) ?? invoice.due_date;
        invoice.currency = (record.currency as string) ?? invoice.currency;
        invoice.total_amount = (record.total_amount as number) ?? invoice.total_amount;
        invoice.total_usd = (record.total_usd as number) ?? invoice.total_usd;
      }
    }
  }

  if (invoice.verdict === "ESCALAR") {
    const approvalsResponse = await fetchImpl("/api/approvals?status=pendiente").catch(() => null);
    if (approvalsResponse !== null && approvalsResponse.ok) {
      const approvals = (await readJson(approvalsResponse)) as
        { id: string; invoice_id: string | null }[] | null;
      const found = approvals?.find((approval) => approval.invoice_id === result.invoice_id);
      if (found) invoice.approvalId = found.id;
    }
  }

  return invoice;
}

/**
 * Crea un submitter con bloqueo de doble envío: mientras hay un envío en vuelo,
 * cualquier llamada adicional devuelve `{ status: "skipped" }` sin tocar la red.
 */
export function createInvoiceSubmitter(deps: InvoiceSubmitterDeps = {}) {
  let inFlight = false;

  const submit = async (file: File): Promise<SubmitOutcome> => {
    if (inFlight) return { status: "skipped" };
    inFlight = true;

    const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
    const stage = (progress: number, message: string) => deps.onStage?.({ progress, message });

    let progressTimer: ReturnType<typeof setInterval> | null = null;
    try {
      stage(20, "Analizando documento…");

      let currentProgress = 20;
      progressTimer = setInterval(() => {
        if (currentProgress < 45) {
          currentProgress = 45;
          stage(45, "Extrayendo entidades con IA multimodal…");
        } else if (currentProgress < 70) {
          currentProgress = 70;
          stage(70, "Normalizando moneda FX y validando ítems…");
        } else if (currentProgress < 85) {
          currentProgress = 85;
          stage(85, "Evaluando orden de precedencia de 8 reglas…");
        } else if (currentProgress < 95) {
          currentProgress = 95;
          stage(95, "Generando veredicto y traza de auditoría…");
        }
      }, 700);

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetchImpl("/api/invoices", { method: "POST", body: formData });
      const payload = await readJson(response);

      if (progressTimer) {
        clearInterval(progressTimer);
        progressTimer = null;
      }

      if (!response.ok) {
        return { status: "error", message: describeError(response.status, payload) };
      }

      stage(98, "Evaluando reglas deterministas de política…");

      const invoice = await buildInvoice(file, (payload ?? {}) as IngestResponse, fetchImpl);
      return { status: "completed", invoice };
    } catch {
      return {
        status: "error",
        message: "No se pudo conectar con el agente. Revisá la conexión y reintentá.",
      };
    } finally {
      if (progressTimer) clearInterval(progressTimer);
      inFlight = false;
    }
  };

  return { submit, isSubmitting: () => inFlight };
}
