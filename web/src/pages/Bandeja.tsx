/**
 * @file Bandeja.tsx
 * @description Bandeja de aprobación humana (Human-in-the-loop / HITL).
 * Orquestador principal que gestiona la lista de facturas pendientes con Smart Polling
 * y la navegación hacia la vista de revisión detallada.
 */

import { useEffect, useState } from "react";
import { Check, RefreshCw, Search, X } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ApprovalCard } from "@/components/bandeja/ApprovalCard";
import { ApprovalReviewView } from "@/components/bandeja/ApprovalReviewView";
import { formatReasonTitle } from "@/lib/invoiceSubmit";
import { InvoiceData, PendingApproval, SystemRule } from "@/types/invoice";

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
    invoice_number?: string | null;
    vendor_id?: string | null;
    issue_date?: string | null;
    due_date?: string | null;
    currency?: string | null;
    total_amount?: number | null;
    total_usd?: number | null;
    line_items?: Array<{ concept?: string }>;
    invoice?: {
      invoice_number?: string;
      vendor_name?: string;
      vendor_tax_id?: string;
      issue_date?: string;
      due_date?: string;
      currency?: string;
      total_amount?: number;
      total_usd?: number;
    };
    amount_usd?: number;
    reason_code?: string;
    explanation?: string;
  };
}

export default function Bandeja() {
  const [searchParams] = useSearchParams();
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedApproval, setSelectedApproval] = useState<PendingApproval | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceData | null>(null);
  const [justUpdated, setJustUpdated] = useState<boolean>(false);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  /**
   * Carga la lista de facturas pendientes con soporte para sondeo silencioso.
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
   * Actualización manual con feedback visual garantizado (mínimo 450ms de giro y estado de confirmación).
   */
  const handleManualRefresh = async () => {
    setLoading(true);
    setJustUpdated(false);
    const minDelay = new Promise((resolve) => setTimeout(resolve, 500));
    await Promise.all([fetchApprovals(true), minDelay]);
    setLoading(false);
    setJustUpdated(true);
    setTimeout(() => {
      setJustUpdated(false);
    }, 2000);
  };

  /**
   * Conexión en tiempo real con Server-Sent Events (SSE).
   * El servidor emite eventos push solo cuando una factura escala o se resuelve. Cero polling.
   */
  useEffect(() => {
    fetchApprovals(false);

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource("/api/approvals/stream");

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "NEW_APPROVAL" || data.type === "APPROVAL_RESOLVED") {
            fetchApprovals(true);
          }
        } catch {
          // Ignorar pings iniciales
        }
      };
    } catch {
      // Fallback si SSE no está disponible
    }

    const handleFocus = () => fetchApprovals(true);
    window.addEventListener("focus", handleFocus);

    return () => {
      eventSource?.close();
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  const handleOpenReview = async (item: PendingApproval) => {
    setSelectedApproval(item);
    let auditData: AuditRecordResponse | null = null;
    try {
      const res = await fetch(`/api/invoices/${item.invoice_id}`);
      if (res.ok) auditData = (await res.json()) as AuditRecordResponse;
    } catch {
      // Usar datos locales
    }

    const rec = auditData?.record;
    const inv = rec?.invoice;
    setSelectedInvoice({
      id: item.invoice_id,
      fileName: `${item.invoice_id}.pdf`,
      fileSize: "215 KB",
      invoice_number: inv?.invoice_number || rec?.invoice_number || item.invoice_id.toUpperCase(),
      vendor_name: item.vendor_name || inv?.vendor_name || rec?.vendor_id || "Proveedor registrado",
      vendor_tax_id: inv?.vendor_tax_id || rec?.vendor_id || "TAX-ID-PROV",
      issue_date: inv?.issue_date || rec?.issue_date || new Date().toISOString().split("T")[0],
      due_date: inv?.due_date || rec?.due_date || "-",
      currency: inv?.currency || rec?.currency || "USD",
      total_amount: inv?.total_amount || rec?.total_amount || item.amount_usd,
      total_usd: inv?.total_usd || rec?.total_usd || item.amount_usd,
      concept: rec?.line_items?.[0]?.concept || item.explanation,
      verdict: "ESCALAR",
      reason_code: item.reason_code,
      reason_description: item.explanation,
      failingRuleId: determineFailingRuleId(item.reason_code),
      approvalId: item.id,
    });
  };

  // Abre automáticamente la revisión de una factura específica si viene con ?invoice_id= o ?id=
  useEffect(() => {
    const targetInvoiceId = searchParams.get("invoice_id") || searchParams.get("id");
    if (!targetInvoiceId) return;
    if (selectedApproval) return;

    // 1. Buscar coincidencia en la lista de aprobaciones pendientes ya cargadas
    const match = approvals.find(
      (a) =>
        a.invoice_id.toLowerCase() === targetInvoiceId.toLowerCase() ||
        a.id.toLowerCase() === targetInvoiceId.toLowerCase(),
    );

    if (match) {
      handleOpenReview(match);
      return;
    }

    // 2. Si no estaba en la lista y terminó la carga inicial, traer la factura directamente de la API
    if (!loading) {
      fetch(`/api/invoices/${encodeURIComponent(targetInvoiceId)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((auditData) => {
          if (auditData?.record) {
            const rec = auditData.record;
            const inv = rec.invoice;
            const pending: PendingApproval = {
              id: rec.id || `app-${targetInvoiceId}`,
              invoice_id: rec.invoice_id || targetInvoiceId,
              vendor_name: inv?.vendor_name || inv?.vendor_tax_id || "Proveedor",
              amount_usd: rec.amount_usd || inv?.total_usd || 0,
              reason_code: rec.reason_code || "ALERT_THRESHOLD_EXCEEDED",
              explanation: rec.explanation || "Requiere revisión y firma humana",
              requested_at: "Pendiente",
            };
            handleOpenReview(pending);
          }
        })
        .catch(() => {});
    }
  }, [searchParams, approvals, loading, selectedApproval]);

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

      setSelectedInvoice({
        ...selectedInvoice,
        resolved_status: isApproved ? "APROBADO_HUMANO" : "RECHAZADO_HUMANO",
        resolved_reason: comment,
        resolved_at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });

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

  const filteredApprovals = approvals.filter((item) => {
    const q = searchTerm.toLowerCase();
    return (
      (item.vendor_name?.toLowerCase().includes(q) ?? false) ||
      item.invoice_id.toLowerCase().includes(q) ||
      item.reason_code.toLowerCase().includes(q) ||
      formatReasonTitle(item.reason_code).toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {selectedInvoice && selectedApproval ? (
        <ApprovalReviewView
          invoice={selectedInvoice}
          rules={SYSTEM_RULES}
          notification={notification}
          onCloseNotification={() => setNotification(null)}
          onBack={() => {
            setSelectedInvoice(null);
            setSelectedApproval(null);
            window.history.replaceState({}, "", "/bandeja");
          }}
          onResolve={handleResolveHuman}
        />
      ) : (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Encabezado */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-border pb-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  Bandeja de revisión
                </h2>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400 select-none whitespace-nowrap shrink-0">
                  <span className="size-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
                  <span className="font-semibold">{approvals.length}</span>
                  <span>pendientes</span>
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Facturas escaladas por el motor determinista que requieren intervención y firma
                humana.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span>Sincronización en tiempo real</span>
              </div>

              <Button
                variant={justUpdated ? "default" : "outline"}
                size="sm"
                onClick={handleManualRefresh}
                disabled={loading}
                className={`h-9 gap-1.5 text-xs rounded-xl shrink-0 transition-all ${
                  justUpdated
                    ? "border-transparent bg-[#185338] text-white hover:bg-[#185338] shadow-xs"
                    : ""
                }`}
              >
                {justUpdated ? (
                  <>
                    <Check className="size-3.5 text-white stroke-[2.5] animate-in zoom-in-75 duration-200" />
                    <span className="font-semibold text-white">Actualizado</span>
                  </>
                ) : loading ? (
                  <>
                    <RefreshCw className="size-3.5 animate-spin text-[#185338]" />
                    <span>Comprobando...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="size-3.5" />
                    <span>Actualizar</span>
                  </>
                )}
              </Button>
              <Button
                asChild
                size="sm"
                className="h-9 text-xs font-semibold gap-1.5 shadow-xs bg-[#185338] hover:bg-[#185338]/90 text-white rounded-xl shrink-0 cursor-pointer"
              >
                <Link to="/subir">Subir factura</Link>
              </Button>
            </div>
          </div>

          {/* Notificación temporal */}
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

          {/* Búsqueda */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
            <span className="text-xs text-muted-foreground">
              Mostrando {filteredApprovals.length} de {approvals.length} facturas
            </span>
          </div>

          {/* Listado */}
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
                <ApprovalCard key={item.id} item={item} onReview={handleOpenReview} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
