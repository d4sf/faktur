/**
 * @file ApprovalReviewView.tsx
 * @description Vista detallada de revisión de factura escalada con las 8 reglas y chat con PayAgent.
 */

import { ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import { InvoiceDetailCard } from "@/components/subir/InvoiceDetailCard";
import { RuleEvaluationList } from "@/components/subir/RuleEvaluationList";
import { NextStepCard } from "@/components/subir/NextStepCard";
import { PayAgentChat } from "@/components/subir/PayAgentChat";
import { InvoiceData, SystemRule } from "@/types/invoice";

interface ApprovalReviewViewProps {
  invoice: InvoiceData;
  rules: SystemRule[];
  notification: { type: "success" | "error"; text: string } | null;
  onCloseNotification: () => void;
  onBack: () => void;
  onResolve: (approved: boolean, justification: string) => void;
  /** `false` para roles sin `approval:resolve`: oculta aprobar/rechazar. */
  canResolve?: boolean;
}

export function ApprovalReviewView({
  invoice,
  rules,
  notification,
  onCloseNotification,
  onBack,
  onResolve,
  canResolve = true,
}: ApprovalReviewViewProps) {
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Barra superior de navegación en el caso */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <Button
          variant="outline"
          size="sm"
          onClick={onBack}
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
            onClick={onCloseNotification}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Grilla: Ficha a la izquierda, Reglas y Chat interactivo a la derecha */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
        {/* Columna Izquierda: Ficha de la factura */}
        <InvoiceDetailCard
          invoice={invoice}
          flowState="COMPLETED"
          processingMessage=""
          processingProgress={100}
          onReset={onBack}
        />

        {/* Columna Derecha: Reglas, Veredicto, Próximo paso y Chat con PayAgent */}
        <div className="space-y-5 lg:col-span-5">
          <Card className="rounded-xl border border-border/80 shadow-xs">
            <CardContent className="p-6 space-y-6">
              <div>
                <h4 className="text-sm font-bold text-foreground">Verificación de políticas</h4>
                <p className="text-xs text-muted-foreground">
                  Evaluación determinista sobre las 8 reglas del negocio.
                </p>
              </div>

              {/* Lista de las 8 reglas */}
              <RuleEvaluationList
                rules={rules}
                evaluatedRuleIndex={7}
                flowState="COMPLETED"
                invoice={invoice}
              />

              {/* Sección final: Veredicto, Próximo paso y Chat de resolución */}
              <div className="border-t border-border/60 pt-4 space-y-4">
                {/* Veredicto */}
                <div className="rounded-lg border border-border/80 bg-card p-4 space-y-2 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">
                      Veredicto del sistema:
                    </span>
                    <VerdictBadge verdict={invoice.verdict} size="lg" />
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {invoice.reason_description}
                  </p>
                </div>

                {/* Orientación del próximo paso */}
                <NextStepCard invoice={invoice} onReset={onBack} />

                {/* Chat interactivo con el asistente PayAgent para consultar y decidir */}
                <PayAgentChat invoice={invoice} onResolve={onResolve} readOnly={!canResolve} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
