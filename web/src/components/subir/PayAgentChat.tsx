import { useState } from "react";
import { Check, CheckCircle2, Loader2, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNaturalExplanation, formatReasonTitle } from "@/lib/invoiceSubmit";
import { InvoiceData } from "@/types/invoice";

interface PayAgentChatProps {
  /**
   * Datos de la factura que requiere revisión por escalación.
   */
  invoice: InvoiceData;
  /**
   * Callback invocado al confirmar la resolución humana (aprobado o rechazado).
   */
  onResolve: (approved: boolean, justification: string) => void;
}

/**
 * Panel de revisión y decisión humana con soporte de explicación con IA.
 * Reemplaza el asistente conversacional por un flujo directo de auditoría.
 */
export function PayAgentChat({ invoice, onResolve }: PayAgentChatProps) {
  const [justification, setJustification] = useState("");
  const [pendingAction, setPendingAction] = useState<"APROBAR" | "RECHAZAR" | null>(null);

  // Estado de la explicación con IA
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [aiCached, setAiCached] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);

  const handleStartAction = (action: "APROBAR" | "RECHAZAR") => {
    setPendingAction(action);
  };

  const handleCancelAction = () => {
    setPendingAction(null);
  };

  const handleConfirmAction = () => {
    if (!pendingAction) return;
    const isApproved = pendingAction === "APROBAR";
    onResolve(isApproved, justification);
    setPendingAction(null);
  };

  const handleExplain = async (regenerate: boolean) => {
    const targetId = invoice.id || invoice.invoice_number;
    if (!targetId) return;
    setExplaining(true);
    setExplainError(null);
    try {
      const res = await fetch(`/api/invoices/${encodeURIComponent(targetId)}/explain`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ regenerate }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        let msg = data?.error ?? `HTTP ${res.status}`;
        if (msg === "not_found" || msg === "invoice_not_found") {
          msg = "Factura no encontrada para generar explicación.";
        } else if (msg === "not_explainable") {
          msg = "Esta factura no requiere explicación (solo facturas escaladas o frenadas).";
        } else if (msg === "explanation_not_configured") {
          msg = "El servicio de IA no está configurado (falta GEMINI_API_KEY).";
        } else if (msg === "explanation_unavailable") {
          msg = "El servicio de IA no está disponible en este momento.";
        } else if (msg === "rate_limit_exceeded") {
          msg = "Límite de solicitudes alcanzado. Intenta nuevamente en unos segundos.";
        }
        throw new Error(msg);
      }
      const data = (await res.json()) as { explanation: string; cached: boolean };
      setAiExplanation(data.explanation);
      setAiCached(data.cached);
    } catch (err) {
      setExplainError(err instanceof Error ? err.message : "Error al generar explicación");
    } finally {
      setExplaining(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden space-y-4 p-5">
      {/* Cabecera del panel de decisión */}
      <div className="flex items-center justify-between border-b border-border/60 pb-3">
        <div>
          <h5 className="text-xs font-bold text-foreground">Resolución Humana Requerida</h5>
          <p className="text-[11px] text-muted-foreground">
            Excepción en políticas · Autorización manual de pago
          </p>
        </div>
        <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
          Folio: {invoice.invoice_number}
        </span>
      </div>

      {/* Detalle de la excepción que provocó la escalación */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-1.5 text-xs text-amber-950 dark:text-amber-200">
        <div className="flex items-start justify-between gap-2">
          <span className="font-semibold text-amber-900 dark:text-amber-200">
            Motivo de escalación
          </span>
          <span className="text-xs font-semibold text-amber-800 dark:text-amber-300 text-right">
            {formatReasonTitle(invoice.reason_code)}
          </span>
        </div>
        <p className="text-amber-900/90 dark:text-amber-200/90 leading-relaxed">
          {invoice.reason_description}
        </p>
      </div>

      {/* Sección Explicar con IA */}
      <div className="space-y-2.5 pt-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground">Análisis y recomendación</span>
          <Button
            size="sm"
            onClick={() => handleExplain(false)}
            disabled={explaining}
            className="h-7 px-3 text-xs font-semibold bg-[#185338] hover:bg-[#185338]/90 text-white shadow-xs rounded-lg transition-all cursor-pointer"
          >
            {explaining ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin text-white" />
                Generando explicación…
              </span>
            ) : (
              <span>Explicar con IA</span>
            )}
          </Button>
        </div>

        {explainError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {explainError}
          </div>
        )}

        {aiExplanation && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5 space-y-2 text-xs animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">
                Explicación generada por el motor de IA
              </span>
              {aiCached && (
                <span className="text-[10px] text-muted-foreground font-mono">cacheada</span>
              )}
            </div>
            <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {formatNaturalExplanation(aiExplanation)}
            </p>
            <div className="flex justify-end pt-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleExplain(true)}
                disabled={explaining}
                className="h-6 px-2 text-[11px] text-[#185338] dark:text-emerald-400 font-semibold hover:underline hover:bg-transparent cursor-pointer"
              >
                Regenerar explicación
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Si ya fue resuelto: Estado de cierre de auditoría */}
      {invoice.resolved_status ? (
        <div
          className={`rounded-lg border p-4 space-y-2 text-xs ${
            invoice.resolved_status === "APROBADO_HUMANO"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-200"
              : "border-rose-500/30 bg-rose-500/10 text-rose-950 dark:text-rose-200"
          }`}
        >
          <div className="flex items-center gap-2 font-bold">
            {invoice.resolved_status === "APROBADO_HUMANO" ? (
              <>
                <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                <span>Factura Aprobada por el Revisor</span>
              </>
            ) : (
              <>
                <XCircle className="size-4 text-rose-600 dark:text-rose-400" />
                <span>Factura Rechazada por el Revisor</span>
              </>
            )}
          </div>
          <p className="text-muted-foreground leading-relaxed">
            <strong>Justificación registrada:</strong>{" "}
            {invoice.resolved_reason || "Sin justificación adicional."}
          </p>
          <p className="text-[10px] text-muted-foreground/80">
            Resuelto a las {invoice.resolved_at || "recientemente"} · Pista inmutable en ledger
          </p>
        </div>
      ) : (
        /* Formulario de Decisión Humana */
        <div className="space-y-3 pt-2 border-t border-border/60">
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1.5">
              Justificación de auditoría (opcional):
            </label>
            <input
              type="text"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Ej: Aprobado según excepción comercial aprobada por Finanzas..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Diálogo de confirmación previa para evitar clics accidentales */}
          {pendingAction !== null ? (
            <div className="rounded-lg border border-border bg-muted/40 p-3.5 space-y-2.5 animate-in fade-in duration-200">
              <p className="text-xs font-bold text-foreground">
                ¿Confirmas que deseas {pendingAction === "APROBAR" ? "APROBAR" : "RECHAZAR"} esta
                factura?
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Esta acción asentará la decisión humana en el registro inmutable de auditoría.
              </p>
              <div className="flex gap-2 justify-end pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCancelAction}
                  className="h-7 text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleConfirmAction}
                  className={`h-7 text-xs text-white ${
                    pendingAction === "APROBAR"
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-rose-600 hover:bg-rose-700"
                  }`}
                >
                  Sí, confirmar decisión
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button
                type="button"
                onClick={() => handleStartAction("APROBAR")}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-9 gap-1.5"
              >
                <Check className="size-4" />
                <span>Aprobar pago</span>
              </Button>
              <Button
                type="button"
                onClick={() => handleStartAction("RECHAZAR")}
                className="bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs h-9 gap-1.5"
              >
                <X className="size-4" />
                <span>Rechazar factura</span>
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
