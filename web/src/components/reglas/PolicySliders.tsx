import { Slider } from "@/components/ui/slider";

interface PolicySlidersProps {
  threshold: number;
  onThresholdChange: (v: number) => void;
  monthlyBudget: number;
  onMonthlyBudgetChange: (v: number) => void;
  driftFactor: number;
  onDriftFactorChange: (v: number) => void;
  minConfidence: number;
  onMinConfidenceChange: (v: number) => void;
  disabled?: boolean;
}

function formatMoney(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

export function PolicySliders({
  threshold,
  onThresholdChange,
  monthlyBudget,
  onMonthlyBudgetChange,
  driftFactor,
  onDriftFactorChange,
  minConfidence,
  onMinConfidenceChange,
  disabled = false,
}: PolicySlidersProps) {
  return (
    <div className="space-y-6">
      {/* Umbral autónomo */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">Umbral autónomo</label>
          <span className="text-sm font-mono font-bold text-foreground">
            {formatMoney(threshold)}
          </span>
        </div>
        <Slider
          min={0}
          max={5000}
          step={100}
          value={[threshold]}
          onValueChange={([v]: number[]) => onThresholdChange(v)}
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">Máximo para pago sin intervención humana</p>
      </div>

      {/* Presupuesto mensual */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">Presupuesto mensual</label>
          <span className="text-sm font-mono font-bold text-foreground">
            {formatMoney(monthlyBudget)}
          </span>
        </div>
        <Slider
          min={0}
          max={10000}
          step={500}
          value={[monthlyBudget]}
          onValueChange={([v]: number[]) => onMonthlyBudgetChange(v)}
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">Límite de dispersión global por ciclo</p>
      </div>

      {/* Tolerancia de desvío */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">Tolerancia de desvío</label>
          <span className="text-sm font-mono font-bold text-foreground">
            +{Math.round((driftFactor - 1) * 100)}%
          </span>
        </div>
        <Slider
          min={1.0}
          max={3.0}
          step={0.1}
          value={[driftFactor]}
          onValueChange={([v]: number[]) => onDriftFactorChange(v)}
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">
          Máximo sobre histórico acordado (factor {driftFactor.toFixed(1)}x)
        </p>
      </div>

      {/* Confianza mínima */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">Confianza mínima IA</label>
          <span className="text-sm font-mono font-bold text-foreground">
            {Math.round(minConfidence * 100)}%
          </span>
        </div>
        <Slider
          min={0}
          max={1}
          step={0.05}
          value={[minConfidence]}
          onValueChange={([v]: number[]) => onMinConfidenceChange(v)}
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">Umbral mínimo de legibilidad de campos</p>
      </div>
    </div>
  );
}
