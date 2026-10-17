import { StepperInput } from "@/components/ui/stepper-input";
import { Ban, CheckCircle2 } from "lucide-react";

interface CategoryBudgetTableProps {
  budgets: Record<string, number>;
  onChange: (category: string, value: number) => void;
  disabled?: boolean;
  monthlyBudget?: number;
}

const CATEGORIES = ["Infraestructura", "Diseno", "Marketing", "Legal", "Software", "Retail"];

export function CategoryBudgetTable({
  budgets,
  onChange,
  disabled = false,
  monthlyBudget,
}: CategoryBudgetTableProps) {
  const totalAllocated = Object.values(budgets).reduce((sum, val) => sum + (Number(val) || 0), 0);
  const exceedsMonthly = monthlyBudget !== undefined && totalAllocated > monthlyBudget;

  return (
    <div className="space-y-3">
      {/* Resumen de asignación */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-xl bg-muted/40 border border-border/60 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">Asignación por categorías:</span>
          <span className="font-mono font-bold text-foreground">
            ${totalAllocated.toLocaleString("en-US")} USD
          </span>
          {monthlyBudget !== undefined && (
            <span className="text-muted-foreground">
              de ${monthlyBudget.toLocaleString("en-US")} USD mensual
            </span>
          )}
        </div>

        {exceedsMonthly && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-500 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
            ⚠️ Suma excede el límite mensual global
          </span>
        )}
      </div>

      {/* Grid de categorías editables */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {CATEGORIES.map((cat) => {
          const currentBudget = budgets[cat] ?? 0;
          const isBlocked = currentBudget === 0;
          const percentageOfTotal =
            totalAllocated > 0 ? Math.round((currentBudget / totalAllocated) * 100) : 0;

          return (
            <div
              key={cat}
              className={`rounded-xl border p-3.5 space-y-2.5 transition-all ${
                isBlocked
                  ? "bg-rose-500/5 border-rose-500/20 dark:bg-rose-950/10"
                  : "bg-card border-border/70 hover:border-border"
              }`}
            >
              {/* Top row: Category name and status */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`size-2 rounded-full ${
                      isBlocked ? "bg-rose-500" : "bg-emerald-500"
                    }`}
                  />
                  <span className="font-bold text-foreground">{cat}</span>
                </div>

                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    isBlocked
                      ? "text-rose-600 bg-rose-500/10 dark:text-rose-400"
                      : "text-emerald-600 bg-emerald-500/10 dark:text-emerald-400"
                  }`}
                >
                  {isBlocked ? "Bloqueado" : `${percentageOfTotal}% del total`}
                </span>
              </div>

              {/* Bottom row: Input and Quick Block/Unblock Button */}
              <div className="flex items-center gap-2">
                <StepperInput
                  value={currentBudget}
                  onChange={(val) => onChange(cat, Math.max(0, val))}
                  min={0}
                  step={50}
                  prefix="$"
                  disabled={disabled}
                  className="flex-1"
                  inputClassName="w-full text-right"
                />

                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(cat, isBlocked ? 500 : 0)}
                  title={isBlocked ? "Asignar $500 inicial" : "Bloquear categoría ($0)"}
                  className={`h-8 px-2.5 rounded-md border text-xs font-medium inline-flex items-center gap-1 transition-all cursor-pointer ${
                    isBlocked
                      ? "bg-muted hover:bg-muted/80 text-foreground border-border"
                      : "bg-muted/30 hover:bg-rose-500/10 hover:text-rose-500 hover:border-rose-500/30 text-muted-foreground border-border/60"
                  }`}
                >
                  {isBlocked ? (
                    <>
                      <CheckCircle2 className="size-3 text-emerald-500" />
                      <span>Activar</span>
                    </>
                  ) : (
                    <>
                      <Ban className="size-3 text-rose-500" />
                      <span>$0</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
