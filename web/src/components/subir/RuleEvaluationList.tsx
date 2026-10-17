import { AlertTriangle, Check, Loader2, Minus, X } from "lucide-react";
import { FlowState, InvoiceData, SystemRule } from "@/types/invoice";

interface RuleEvaluationListProps {
  /**
   * Catálogo de las reglas del motor de políticas.
   */
  rules: SystemRule[];
  /**
   * Índice de la regla actualmente evaluada en la animación (-1 a 7).
   */
  evaluatedRuleIndex: number;
  /**
   * Estado actual del flujo.
   */
  flowState: FlowState;
  /**
   * Factura actual con veredicto y regla de fallo asociada.
   */
  invoice: InvoiceData | null;
}

/**
 * Componente que renderiza el checklist interactivo de las 8 reglas del negocio
 * con soporte para cortocircuito determinista (short-circuit): si una regla falla,
 * se detiene de inmediato y marca las reglas posteriores como omitidas.
 */
export function RuleEvaluationList({
  rules,
  evaluatedRuleIndex,
  flowState,
  invoice,
}: RuleEvaluationListProps) {
  const failingRuleId = invoice?.failingRuleId;
  const isFailureVerdict = Boolean(invoice?.verdict && invoice.verdict !== "PAGAR");
  const failingRuleIdx = failingRuleId ? rules.findIndex((r) => r.id === failingRuleId) : -1;
  const hasFailure = isFailureVerdict && failingRuleIdx !== -1;

  return (
    <div className="space-y-2 border-t border-border/60 pt-4">
      {rules.map((rule, idx) => {
        const isThisFailingRule = hasFailure && idx === failingRuleIdx;
        const isPastFailingRule = hasFailure && idx > failingRuleIdx;
        const isPriorToFailure = !hasFailure || idx < failingRuleIdx;

        // Determinación del estado exacto de cada regla
        let status: "pending" | "evaluating" | "approved" | "blocked" | "escalated" | "skipped" =
          "pending";

        if (flowState === "IDLE" || !invoice) {
          status = "pending";
        } else if (flowState === "PROCESSING") {
          if (isPastFailingRule) {
            // Si ya se alcanzó la regla que falló, las posteriores se marcan como omitidas
            status = evaluatedRuleIndex >= failingRuleIdx ? "skipped" : "pending";
          } else if (isThisFailingRule) {
            if (evaluatedRuleIndex === idx) {
              // En cuanto la animación llega a la regla infractora, muestra directamente su estado real
              status = invoice.verdict === "FRENAR" ? "blocked" : "escalated";
            } else if (evaluatedRuleIndex > idx) {
              status = invoice.verdict === "FRENAR" ? "blocked" : "escalated";
            } else {
              status = "pending";
            }
          } else if (isPriorToFailure) {
            if (evaluatedRuleIndex > idx) {
              status = "approved";
            } else if (evaluatedRuleIndex === idx) {
              status = "evaluating";
            } else {
              status = "pending";
            }
          }
        } else if (flowState === "COMPLETED") {
          if (isPastFailingRule) {
            status = "skipped";
          } else if (isThisFailingRule) {
            status = invoice.verdict === "FRENAR" ? "blocked" : "escalated";
          } else {
            status = "approved";
          }
        }

        return (
          <div
            key={rule.id}
            className={`flex items-center justify-between text-xs py-1 transition-opacity duration-200 ${
              status === "skipped" ? "opacity-45" : "opacity-100"
            }`}
          >
            <div className="flex items-center gap-2">
              {status === "blocked" && (
                <X className="size-3.5 text-rose-600 dark:text-rose-400 shrink-0 stroke-[2.5] animate-in zoom-in-75 duration-200" />
              )}
              {status === "escalated" && (
                <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400 shrink-0 stroke-[2.5] animate-in zoom-in-75 duration-200" />
              )}
              {status === "approved" && (
                <Check className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 stroke-[2.5]" />
              )}
              {status === "evaluating" && (
                <Loader2 className="size-3.5 text-primary animate-spin shrink-0" />
              )}
              {status === "skipped" && (
                <Minus className="size-3.5 text-muted-foreground/60 shrink-0" />
              )}
              {status === "pending" && (
                <div className="size-3.5 rounded-full border border-border/80 shrink-0" />
              )}

              <span
                className={`font-semibold whitespace-nowrap ${
                  status === "skipped" ? "text-muted-foreground" : "text-foreground"
                }`}
              >
                {rule.label}
              </span>
              <span className="text-muted-foreground text-[11px] truncate max-w-[140px]">
                {rule.name}
              </span>
            </div>

            <span
              className={`text-[11px] font-medium whitespace-nowrap ${
                status === "blocked"
                  ? "text-rose-600 dark:text-rose-400 font-semibold"
                  : status === "escalated"
                    ? "text-amber-600 dark:text-amber-400 font-semibold"
                    : status === "approved"
                      ? "text-emerald-600 dark:text-emerald-400 font-medium"
                      : status === "evaluating"
                        ? "text-primary font-medium"
                        : status === "skipped"
                          ? "text-muted-foreground/70 italic"
                          : "text-muted-foreground"
              }`}
            >
              {status === "blocked" && "Bloqueada"}
              {status === "escalated" && "Escalada"}
              {status === "approved" && "Aprobada"}
              {status === "evaluating" && "Evaluando..."}
              {status === "skipped" && "Omitida"}
              {status === "pending" && "Pendiente"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
