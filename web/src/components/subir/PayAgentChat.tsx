import { useState } from "react";
import { AlertTriangle, Bot, Check, Send, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
 * Componente que renderiza el chat interactivo con el agente Blinka PayAgent.
 * Cuenta con un flujo de doble confirmación para prevenir clics accidentales en las decisiones financieras.
 */
export function PayAgentChat({ invoice, onResolve }: PayAgentChatProps) {
  const [justification, setJustification] = useState("");
  const [pendingAction, setPendingAction] = useState<"APROBAR" | "RECHAZAR" | null>(null);

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

  return (
    <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
      {/* Cabecera del chat con avatar y estado en vivo */}
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Bot className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-foreground">Blinka PayAgent</span>
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <p className="text-[10px] text-muted-foreground">Asistente de revisión · En línea</p>
          </div>
        </div>
        <span className="rounded-sm bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
          Ref: {invoice.invoice_number}
        </span>
      </div>

      {/* Historial de conversación del chat */}
      <div className="p-3.5 space-y-3 max-h-[340px] overflow-y-auto bg-muted/10">
        {/* Mensaje inicial del agente explicando la excepción */}
        <div className="flex items-start gap-2.5">
          <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary mt-0.5">
            <Bot className="size-3.5" />
          </div>
          <div className="space-y-1 max-w-[88%]">
            <div className="rounded-2xl rounded-tl-sm border border-border/80 bg-background p-3 text-xs leading-relaxed text-foreground shadow-xs">
              <p className="font-semibold text-foreground mb-1">Alerta de excepción detectada</p>
              <p>
                Hola, he evaluado la factura <strong>{invoice.invoice_number}</strong> de{" "}
                <strong>{invoice.vendor_name}</strong> por un importe de{" "}
                <strong>
                  ${invoice.total_usd.toLocaleString("en-US", { minimumFractionDigits: 2 })} USD
                </strong>
                .
              </p>
              <p className="mt-1.5 text-amber-700 dark:text-amber-400 bg-amber-500/10 p-2 rounded-md border border-amber-500/20 text-[11px]">
                ⚠️ <strong>Regla 7:</strong> {invoice.reason_description}
              </p>
              <p className="mt-2 text-muted-foreground">
                Como revisor humano asignado, redacta tu justificación abajo y decide si deseas
                autorizar o rechazar esta factura.
              </p>
            </div>
            <span className="text-[9px] text-muted-foreground pl-1">PayAgent · Ahora</span>
          </div>
        </div>

        {/* Mensajes si el caso ya fue resuelto */}
        {invoice.resolved_status && (
          <>
            {/* Burbuja del revisor humano */}
            <div className="flex items-start justify-end gap-2.5">
              <div className="space-y-1 max-w-[88%] text-right">
                <div
                  className={`rounded-2xl rounded-tr-sm p-3 text-xs leading-relaxed text-left text-white shadow-xs ${
                    invoice.resolved_status === "APROBADO_HUMANO" ? "bg-emerald-600" : "bg-rose-600"
                  }`}
                >
                  <p className="font-bold flex items-center gap-1.5 mb-1">
                    {invoice.resolved_status === "APROBADO_HUMANO" ? (
                      <>
                        <Check className="size-3.5" />
                        <span>Aprobado excepcionalmente</span>
                      </>
                    ) : (
                      <>
                        <X className="size-3.5" />
                        <span>Factura rechazada</span>
                      </>
                    )}
                  </p>
                  <p className="text-white/95 text-[11px]">{invoice.resolved_reason}</p>
                </div>
                <span className="text-[9px] text-muted-foreground pr-1">
                  Tú (Revisor) · {invoice.resolved_at || "Registrado"}
                </span>
              </div>
              <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground mt-0.5">
                <User className="size-3.5" />
              </div>
            </div>

            {/* Confirmación final del agente */}
            <div className="flex items-start gap-2.5">
              <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary mt-0.5">
                <Bot className="size-3.5" />
              </div>
              <div className="space-y-1 max-w-[88%]">
                <div className="rounded-2xl rounded-tl-sm border border-border/80 bg-background p-3 text-xs leading-relaxed text-foreground shadow-xs">
                  <p className="font-semibold text-foreground mb-1">
                    ✓ Decisión registrada en auditoría
                  </p>
                  <p className="text-muted-foreground text-[11px]">
                    {invoice.resolved_status === "APROBADO_HUMANO"
                      ? "He registrado tu aprobación. La factura fue autorizada con tu justificación y programada para pago."
                      : "He registrado tu rechazo. El desembolso quedó bloqueado definitivamente en la bitácora."}
                  </p>
                </div>
                <span className="text-[9px] text-muted-foreground pl-1">PayAgent · Confirmado</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Área interactiva inferior (Chat input + Botones con salvaguarda) */}
      {!invoice.resolved_status ? (
        <div className="border-t border-border bg-background p-3 space-y-3">
          {/* 1. Caja de texto para ingresar la justificación primero */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              Justificación de auditoría (opcional):
            </label>
            <div className="relative">
              <input
                type="text"
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Escribe el motivo o justificación de revisión..."
                className="w-full rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:bg-background transition-all pr-8"
              />
              <Send className="absolute right-2.5 top-2 size-3.5 text-muted-foreground" />
            </div>
          </div>

          {/* 2. Diálogo de confirmación para evitar clics accidentales */}
          {pendingAction ? (
            <div className="rounded-md border border-border bg-muted/50 p-3 space-y-2 animate-in fade-in">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <AlertTriangle
                  className={`size-4 ${
                    pendingAction === "APROBAR" ? "text-amber-500" : "text-rose-500"
                  }`}
                />
                <span>
                  {pendingAction === "APROBAR"
                    ? `¿Confirmas autorizar el pago de $${invoice.total_usd.toLocaleString("en-US", { minimumFractionDigits: 2 })} USD a ${invoice.vendor_name}?`
                    : `¿Confirmas rechazar definitivamente la factura ${invoice.invoice_number}?`}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Esta acción se registrará formalmente en el expediente de auditoría con tu
                justificación.
              </p>
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleCancelAction}
                  className="h-7 text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleConfirmAction}
                  className={`h-7 text-xs text-white ${
                    pendingAction === "APROBAR"
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-rose-600 hover:bg-rose-700"
                  }`}
                >
                  {pendingAction === "APROBAR" ? "Sí, autorizar pago" : "Sí, rechazar factura"}
                </Button>
              </div>
            </div>
          ) : (
            /* 3. Botones de acción ubicados debajo del chat, claros y protegidos */
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => handleStartAction("APROBAR")}
                className="flex-1 h-8 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-xs"
              >
                <Check className="size-3.5" />
                <span>Aprobar pago</span>
              </Button>

              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => handleStartAction("RECHAZAR")}
                className="flex-1 h-8 text-xs font-semibold gap-1.5 shadow-xs"
              >
                <X className="size-3.5" />
                <span>Rechazar factura</span>
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="border-t border-border/80 bg-muted/20 px-3.5 py-2 text-center text-[11px] text-muted-foreground">
          Conversación finalizada · Auditoría inmutable
        </div>
      )}
    </div>
  );
}
