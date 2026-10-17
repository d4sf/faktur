import { Check, X } from "lucide-react";
import { FlowState, InvoiceData, SystemRule } from "@/types/invoice";

interface RuleEvaluationListProps {
  /**
   * Catálogo de las reglas del motor de políticas.
   */
  rules: SystemRule[];
  /**
   * Índice de la regla actualmente evaluada en la animación.
   */
  evaluatedRuleIndex: number;
  /**
   * Estado actual del flujo.
   */
  flowState: FlowState;
  /**
   * Factura actual con veredicto y regla de fallo asociada.
   */
  invoice: InvoiceData;
}

/**
 * Componente que renderiza el checklist interactivo de las 8 reglas del negocio.
 */
export function RuleEvaluationList({
  rules,
  evaluatedRuleIndex,
  flowState,
  invoice,
}: RuleEvaluationListProps) {
  return (
    <div className="space-y-2 border-t border-border/60 pt-4">
      {rules.map((rule, idx) => {
        const isEvaluated = evaluatedRuleIndex >= idx;
        const isCurrent = evaluatedRuleIndex === idx && flowState === "PROCESSING";
        const isFailing =
          flowState === "COMPLETED" &&
          invoice.verdict !== "PAGAR" &&
          invoice.failingRuleId === rule.id;

        return (
          <div key={rule.id} className="flex items-center justify-between text-xs py-1">
            <div className="flex items-center gap-2">
              {isFailing ? (
                <X
                  className={`size-3.5 shrink-0 ${
                    invoice.verdict === "FRENAR"
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-amber-600 dark:text-amber-400"
                  }`}
                />
              ) : isEvaluated ? (
                <Check className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <div className="size-3.5 rounded-full border border-border shrink-0" />
              )}
              <span className="font-semibold text-foreground whitespace-nowrap">{rule.label}</span>
              <span className="text-muted-foreground text-[11px] truncate max-w-[140px]">
                {rule.name}
              </span>
            </div>

            <span
              className={`text-[11px] font-medium whitespace-nowrap ${
                isFailing
                  ? invoice.verdict === "FRENAR"
                    ? "text-rose-600 dark:text-rose-400 font-semibold"
                    : "text-amber-600 dark:text-amber-400 font-semibold"
                  : isEvaluated
                    ? "text-emerald-600 dark:text-emerald-400 font-medium"
                    : "text-muted-foreground"
              }`}
            >
              {isCurrent
                ? "Evaluando..."
                : isFailing
                  ? invoice.verdict === "FRENAR"
                    ? "Bloqueada"
                    : "Escalada"
                  : isEvaluated
                    ? "Aprobada"
                    : "Pendiente"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
