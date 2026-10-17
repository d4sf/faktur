/**
 * @file Bandeja.tsx
 * @description Bandeja de aprobación humana (Human-in-the-loop / HITL).
 * Permite a los revisores financieros examinar facturas con veredicto ESCALAR,
 * inspeccionar las reglas de negocio evaluadas, interactuar con el asistente PayAgent
 * y autorizar o rechazar pagos con doble confirmación y auditoría inmutable.
 * Incluye actualización automática en tiempo real de nuevos casos.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, Clock, RefreshCw, Search, X } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import { InvoiceDetailCard } from "@/components/subir/InvoiceDetailCard";
import { RuleEvaluationList } from "@/components/subir/RuleEvaluationList";
import { NextStepCard } from "@/components/subir/NextStepCard";
import { PayAgentChat } from "@/components/subir/PayAgentChat";
import { InvoiceData, PendingApproval, SystemRule } from "@/types/invoice";

/**
 * Las 8 reglas deterministas de la política de gastos.
 */
const SYSTEM_RULES: SystemRule[] = [
  { id: 1, label: "Regla 1", name: "Datos válidos y confianza" },
  { id: 2, label: "Regla 2", name: "Duplicados" },
  { id: 3, label: "Regla 3", name: "Lista de exclusión" },
  { id: 4, label: "Regla 4", name: "Proveedor conocido" },
  { id: 5, label: "Regla 5", name: "Deriva de importe" },
  { id: 6, label: "Regla 6", name: "Presupuesto disponible" },
  { id: 7, label: "Regla 7", name: "Umbral de aprobación" },
  { id: 8, label: "Regla 8", name: "Pase directo (STP)" },
];

/**
 * Mapea el código de alerta del backend a la regla correspondiente del sistema.
 */
function determineFailingRuleId(reasonCode?: string): number | undefined {
  if (!reasonCode) return undefined;
  if (reasonCode === "ERR_INVALID_DATA" || reasonCode === "ALERT_LOW_CONFIDENCE") return 1;
  if (reasonCode === "ERR_DUPLICATE_INVOICE") return 2;
  if (reasonCode === "ERR_BLACKLISTED_VENDOR") return 3;
  if (reasonCode === "ALERT_NEW_VENDOR") return 4;
  if (reasonCode === "ALERT_VENDOR_DRIFT") return 5;
  if (reasonCode === "ALERT_BUDGET_OVERRUN" || reasonCode === "ALERT_BUDGET_TIGHT") return 6;
  if (reasonCode === "ALERT_THRESHOLD_EXCEEDED") return 7;
  if (reasonCode === "SUCCESS_TOUCHLESS_STP") return 8;
  return undefined;
}

/**
 * Casos iniciales de demostración en caso de que la base de datos esté vacía o recién inicializada.
 */
const FALLBACK_PENDING: PendingApproval[] = [
  {
    id: "app-tc-04",
    invoice_id: "inv-tc-04",
    vendor_name: "Growth Agency",
    amount_usd: 3500,
    reason_code: "ALERT_THRESHOLD_EXCEEDED",
    explanation:
      "El importe de $3,500.00 USD supera el umbral de aprobación autónoma de $1,000.00 USD (Regla 7).",
    requested_at: "Hace 5 min",
  },
  {
    id: "app-tc-09",
    invoice_id: "inv-tc-09",
    vendor_name: "Estudio Creativo Alpha",
    amount_usd: 1450,
    reason_code: "ALERT_BUDGET_TIGHT",
    explanation:
      "El monto acumulado excede el presupuesto asignado a la categoría Diseño (Regla 6).",
    requested_at: "Hace 15 min",
  },
];

interface AuditRecordResponse {
  record?: {
    id?: string;
    invoice_number?: string | null;
    vendor_id?: string | null;
    issue_date?: string | null;
    due_date?: string | null;
    currency?: string | null;
    total_amount?: number | null;
    total_usd?: number | null;
    line_items?: Array<{ concept?: string; total?: number }>;
  };
}

export default function Bandeja() {
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Caso en modo de revisión completa (igual a la vista de Subir con chat y reglas)
  const [selectedApproval, setSelectedApproval] = useState<PendingApproval | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceData | null>(null);

  const [notification, setNotification] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  /**
   * Carga la lista de facturas pendientes desde la API real.
   * @param silent Si es true, omite el spinner para no parpadear en la actualización automática.
   */
  const fetchApprovals = async (silent: boolean = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/approvals?status=pendiente");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setApprovals(data.length > 0 ? data : FALLBACK_PENDING);
        }
      } else {
        setApprovals((prev) => (prev.length > 0 ? prev : FALLBACK_PENDING));
      }
    } catch {
      setApprovals((prev) => (prev.length > 0 ? prev : FALLBACK_PENDING));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  /**
   * Inicialización y temporizador de actualización automática en tiempo real cada 6 segundos.
   */
  useEffect(() => {
    fetchApprovals(false);

    const intervalId = setInterval(() => {
      fetchApprovals(true);
    }, 6000);

    return () => clearInterval(intervalId);
  }, []);

  /**
   * Abre la vista completa de revisión con el detalle de la factura, las 8 reglas y el chat del asistente.
   */
  const handleOpenReview = async (item: PendingApproval) => {
    setSelectedApproval(item);

    let auditData: AuditRecordResponse | null = null;
    try {
      const res = await fetch(`/api/invoices/${item.invoice_id}`);
      if (res.ok) {
        auditData = (await res.json()) as AuditRecordResponse;
      }
    } catch {
      // Usar datos locales si no está disponible en la base de datos
    }

    const rec = auditData?.record;
    const failingRuleId = determineFailingRuleId(item.reason_code);

    const invoice: InvoiceData = {
      id: item.invoice_id,
      fileName: `${item.invoice_id}.pdf`,
      fileSize: "215 KB",
      invoice_number: rec?.invoice_number || item.invoice_id.toUpperCase(),
      vendor_name: item.vendor_name || rec?.vendor_id || "Proveedor registrado",
      vendor_tax_id: rec?.vendor_id || "TAX-ID-PROV",
      issue_date: rec?.issue_date || new Date().toISOString().split("T")[0],
      due_date: rec?.due_date || "-",
      currency: rec?.currency || "USD",
      total_amount: rec?.total_amount || item.amount_usd,
      total_usd: rec?.total_usd || item.amount_usd,
      concept: rec?.line_items?.[0]?.concept || item.explanation,
      verdict: "ESCALAR",
      reason_code: item.reason_code,
      reason_description: item.explanation,
      failingRuleId,
      approvalId: item.id,
    };

    setSelectedInvoice(invoice);
  };

  /**
   * Cierra el modo de revisión y vuelve a la lista general de la bandeja.
   */
  const handleCloseReview = () => {
    setSelectedInvoice(null);
    setSelectedApproval(null);
  };

  /**
   * Procesa la resolución humana (aprobado o rechazado) emitida desde el chat del asistente.
   */
  const handleResolveHuman = async (approved: boolean, justification: string) => {
    if (!selectedApproval || !selectedInvoice) return;

    const isApproved = approved;
    const comment =
      justification.trim() ||
      (isApproved ? "Aprobado por el revisor financiero" : "Rechazado por el revisor");

    try {
      if (!selectedApproval.id.startsWith("app-tc-")) {
        await fetch(`/api/approvals/${selectedApproval.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            approve: isApproved,
            resolved_by: "Revisor (Bandeja Web)",
            comment,
          }),
        });
      }

      // Actualizar estado del caso en pantalla
      setSelectedInvoice({
        ...selectedInvoice,
        resolved_status: isApproved ? "APROBADO_HUMANO" : "RECHAZADO_HUMANO",
        resolved_reason: comment,
        resolved_at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });

      // Retirar el caso de la lista de pendientes
      setApprovals((prev) => prev.filter((item) => item.id !== selectedApproval.id));

      setNotification({
        type: "success",
        text: `Factura de ${selectedApproval.vendor_name || "Proveedor"} ${
          isApproved ? "autorizada para pago" : "rechazada formalmente"
        }.`,
      });
    } catch (err) {
      console.error("Error al resolver aprobación:", err);
      setNotification({
        type: "error",
        text: "Hubo un error al comunicar la decisión con el servidor.",
      });
    }
  };

  // Filtrado por término de búsqueda
  const filteredApprovals = approvals.filter((item) => {
    const q = searchTerm.toLowerCase();
    return (
      (item.vendor_name?.toLowerCase().includes(q) ?? false) ||
      item.invoice_id.toLowerCase().includes(q) ||
      item.reason_code.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* VISTA 1: Modo de Revisión Completa del Caso (Igual a Subir factura) */}
      {selectedInvoice && selectedApproval ? (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Barra superior de navegación en el caso */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCloseReview}
              className="gap-2 text-xs font-semibold h-8 w-fit"
            >
              <ArrowLeft className="size-3.5" />
              <span>Volver a la lista de pendientes</span>
            </Button>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium">
                Revisión Human-in-the-Loop:
              </span>
              <VerdictBadge verdict="ESCALAR" size="sm" />
            </div>
          </div>

          {/* Banner de notificación */}
          {notification && (
            <div
              className={`rounded-lg border p-3.5 text-xs font-medium flex items-center justify-between transition-all ${
                notification.type === "success"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                  : "border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-300"
              }`}
            >
              <span>{notification.text}</span>
              <button
                type="button"
                onClick={() => setNotification(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}

          {/* Grilla idéntica a Subir: Ficha a la izquierda, Reglas y Chat interactivo a la derecha */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
            {/* Columna Izquierda: Ficha de la factura */}
            <InvoiceDetailCard
              invoice={selectedInvoice}
              flowState="COMPLETED"
              processingMessage=""
              processingProgress={100}
              onReset={handleCloseReview}
            />

            {/* Columna Derecha: Reglas, Veredicto, Próximo paso y Chat interactivo con PayAgent */}
            <div className="space-y-5 lg:col-span-5">
              <Card className="rounded-xl border border-border/80 shadow-xs">
                <CardContent className="p-6 space-y-6">
                  <div>
                    <h4 className="text-sm font-bold text-foreground">Verificación de políticas</h4>
                    <p className="text-xs text-muted-foreground">
                      Evaluación determinista sobre las 8 reglas del negocio.
                    </p>
                  </div>

                  {/* Lista interactiva de las 8 reglas con la regla que disparó la alerta */}
                  <RuleEvaluationList
                    rules={SYSTEM_RULES}
                    evaluatedRuleIndex={7}
                    flowState="COMPLETED"
                    invoice={selectedInvoice}
                  />

                  {/* Sección final: Veredicto, Próximo paso y Chat de resolución */}
                  <div className="border-t border-border/60 pt-4 space-y-4">
                    {/* Veredicto */}
                    <div className="rounded-lg border border-border/80 bg-card p-4 space-y-2 shadow-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">
                          Veredicto del sistema:
                        </span>
                        <VerdictBadge verdict={selectedInvoice.verdict} size="lg" />
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {selectedInvoice.reason_description}
                      </p>
                    </div>

                    {/* Orientación del próximo paso */}
                    <NextStepCard invoice={selectedInvoice} onReset={handleCloseReview} />

                    {/* Chat interactivo con el asistente PayAgent para consultar dudas y decidir con doble confirmación */}
                    <PayAgentChat invoice={selectedInvoice} onResolve={handleResolveHuman} />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      ) : (
        /* VISTA 2: Lista Principal de la Bandeja de Pendientes */
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Encabezado de la Bandeja */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-5">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  Bandeja de revisión
                </h2>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                  <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                  <span>{approvals.length} pendientes</span>
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Facturas escaladas por el motor determinista que requieren intervención y firma
                humana.
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              {/* Indicador de actualización automática en tiempo real */}
              <div className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Actualización automática</span>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchApprovals(false)}
                disabled={loading}
                className="h-9 gap-1.5 text-xs"
              >
                <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
                <span>Actualizar</span>
              </Button>
              <Button asChild size="sm" className="h-9 text-xs font-semibold gap-1.5 shadow-xs">
                <Link to="/subir">Subir factura</Link>
              </Button>
            </div>
          </div>

          {/* Banner de notificación temporal */}
          {notification && (
            <div
              className={`rounded-lg border p-3.5 text-xs font-medium flex items-center justify-between transition-all ${
                notification.type === "success"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                  : "border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-300"
              }`}
            >
              <span>{notification.text}</span>
              <button
                type="button"
                onClick={() => setNotification(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}

          {/* Barra de búsqueda y contador */}
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por proveedor o folio..."
                className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
              />
            </div>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Mostrando {filteredApprovals.length} de {approvals.length} facturas
            </span>
          </div>

          {/* Cuadrícula de Tarjetas de Facturas Pendientes */}
          {filteredApprovals.length === 0 ? (
            <Card className="rounded-xl border border-dashed border-border/80 bg-muted/10 p-12 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 mb-3">
                <Check className="size-6" />
              </div>
              <h4 className="text-sm font-bold text-foreground">Bandeja al día</h4>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                No hay facturas pendientes de revisión humana en este momento. Todas las decisiones
                han sido resueltas o procesadas de forma autónoma.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {filteredApprovals.map((item) => (
                <Card
                  key={item.id}
                  className="rounded-xl border border-border/80 bg-card shadow-xs hover:border-foreground/20 transition-all flex flex-col justify-between"
                >
                  <CardContent className="p-5 space-y-4">
                    {/* Cabecera de la tarjeta */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                          {item.invoice_id}
                        </span>
                        <h4 className="font-bold text-foreground truncate text-sm">
                          {item.vendor_name || "Proveedor sin nombre"}
                        </h4>
                      </div>
                      <VerdictBadge verdict="ESCALAR" size="sm" />
                    </div>

                    {/* Importe a autorizar */}
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground font-medium">
                        Importe a autorizar:
                      </span>
                      <span className="font-mono text-sm font-bold text-foreground">
                        ${item.amount_usd.toLocaleString("en-US", { minimumFractionDigits: 2 })} USD
                      </span>
                    </div>

                    {/* Razón de escalación */}
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-semibold text-[11px]">
                        <AlertTriangle className="size-3.5 shrink-0" />
                        <span>{item.reason_code}</span>
                      </div>
                      <p className="text-muted-foreground text-[11px] leading-relaxed line-clamp-2">
                        {item.explanation}
                      </p>
                    </div>
                  </CardContent>

                  {/* Pie de tarjeta con botón para abrir revisión */}
                  <div className="border-t border-border/60 bg-muted/10 p-3 flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="size-3" />
                      <span>{item.requested_at}</span>
                    </span>
                    <Button
                      size="sm"
                      onClick={() => handleOpenReview(item)}
                      className="h-8 px-3.5 text-xs font-semibold shadow-xs gap-1.5"
                    >
                      <span>Revisar caso</span>
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
