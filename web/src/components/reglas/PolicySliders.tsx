import { Slider } from "@/components/ui/slider";
import { StepperInput } from "@/components/ui/stepper-input";

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
  const driftPercentage = Math.round((driftFactor - 1) * 100);
  const confidencePercentage = Math.round(minConfidence * 100);

  return (
    <div className="space-y-6">
      {/* 1. Umbral autónomo */}
      <div className="rounded-xl border border-border/70 bg-card/60 p-4 space-y-3 hover:border-border transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <label className="text-sm font-bold text-foreground">Umbral autónomo</label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Monto máximo para dispersión directa STP sin firma humana.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <StepperInput
              value={threshold}
              onChange={onThresholdChange}
              min={0}
              max={10000}
              step={50}
              prefix="$"
              disabled={disabled}
              inputClassName="w-20"
            />
          </div>
        </div>

        <Slider
          min={0}
          max={5000}
          step={50}
          value={[threshold]}
          onValueChange={([v]: number[]) => onThresholdChange(v)}
          disabled={disabled}
        />

        {/* Atajos de valor rápido */}
        <div className="flex items-center gap-1.5 pt-1">
          <span className="text-[11px] text-muted-foreground mr-1">Atajos:</span>
          {[500, 1000, 2000, 2500].map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={disabled}
              onClick={() => onThresholdChange(preset)}
              className={`text-[11px] font-mono px-2 py-0.5 rounded-md border transition-all cursor-pointer ${
                threshold === preset
                  ? "bg-primary text-primary-foreground border-primary font-bold shadow-xs"
                  : "bg-muted/40 border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              ${preset.toLocaleString("en-US")}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Presupuesto mensual */}
      <div className="rounded-xl border border-border/70 bg-card/60 p-4 space-y-3 hover:border-border transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <label className="text-sm font-bold text-foreground">Presupuesto mensual</label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Límite de dispersión global por ciclo mensual de pagos.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <StepperInput
              value={monthlyBudget}
              onChange={onMonthlyBudgetChange}
              min={0}
              max={50000}
              step={250}
              prefix="$"
              disabled={disabled}
              inputClassName="w-20"
            />
          </div>
        </div>

        <Slider
          min={0}
          max={15000}
          step={250}
          value={[monthlyBudget]}
          onValueChange={([v]: number[]) => onMonthlyBudgetChange(v)}
          disabled={disabled}
        />

        {/* Atajos de valor rápido */}
        <div className="flex items-center gap-1.5 pt-1">
          <span className="text-[11px] text-muted-foreground mr-1">Atajos:</span>
          {[3000, 5000, 7500, 10000].map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={disabled}
              onClick={() => onMonthlyBudgetChange(preset)}
              className={`text-[11px] font-mono px-2 py-0.5 rounded-md border transition-all cursor-pointer ${
                monthlyBudget === preset
                  ? "bg-primary text-primary-foreground border-primary font-bold shadow-xs"
                  : "bg-muted/40 border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              ${preset.toLocaleString("en-US")}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Tolerancia de desvío */}
      <div className="rounded-xl border border-border/70 bg-card/60 p-4 space-y-3 hover:border-border transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <label className="text-sm font-bold text-foreground">Tolerancia de desvío</label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Factor máximo permitido sobre el histórico acordado (factor {driftFactor.toFixed(2)}
              x).
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <StepperInput
              value={driftPercentage}
              onChange={(pct) => onDriftFactorChange(Number((1 + pct / 100).toFixed(2)))}
              min={0}
              max={200}
              step={5}
              prefix="+"
              suffix="%"
              disabled={disabled}
              inputClassName="w-14"
            />
          </div>
        </div>

        <Slider
          min={1.0}
          max={3.0}
          step={0.05}
          value={[driftFactor]}
          onValueChange={([v]: number[]) => onDriftFactorChange(Number(v.toFixed(2)))}
          disabled={disabled}
        />

        {/* Atajos de valor rápido */}
        <div className="flex items-center gap-1.5 pt-1">
          <span className="text-[11px] text-muted-foreground mr-1">Atajos:</span>
          {[
            { label: "+20% (1.2x)", factor: 1.2 },
            { label: "+40% (1.4x)", factor: 1.4 },
            { label: "+60% (1.6x)", factor: 1.6 },
            { label: "+100% (2.0x)", factor: 2.0 },
          ].map((preset) => (
            <button
              key={preset.factor}
              type="button"
              disabled={disabled}
              onClick={() => onDriftFactorChange(preset.factor)}
              className={`text-[11px] font-mono px-2 py-0.5 rounded-md border transition-all cursor-pointer ${
                Math.abs(driftFactor - preset.factor) < 0.02
                  ? "bg-primary text-primary-foreground border-primary font-bold shadow-xs"
                  : "bg-muted/40 border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Confianza mínima IA */}
      <div className="rounded-xl border border-border/70 bg-card/60 p-4 space-y-3 hover:border-border transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <label className="text-sm font-bold text-foreground">Confianza mínima IA</label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Umbral mínimo de legibilidad y certeza OCR para procesar campos críticos.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <StepperInput
              value={confidencePercentage}
              onChange={(pct) => onMinConfidenceChange(Number((pct / 100).toFixed(2)))}
              min={10}
              max={100}
              step={5}
              suffix="%"
              disabled={disabled}
              inputClassName="w-14"
            />
          </div>
        </div>

        <Slider
          min={0.1}
          max={1.0}
          step={0.05}
          value={[minConfidence]}
          onValueChange={([v]: number[]) => onMinConfidenceChange(Number(v.toFixed(2)))}
          disabled={disabled}
        />

        {/* Atajos de valor rápido */}
        <div className="flex items-center gap-1.5 pt-1">
          <span className="text-[11px] text-muted-foreground mr-1">Atajos:</span>
          {[60, 70, 80, 90].map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={disabled}
              onClick={() => onMinConfidenceChange(preset / 100)}
              className={`text-[11px] font-mono px-2 py-0.5 rounded-md border transition-all cursor-pointer ${
                confidencePercentage === preset
                  ? "bg-primary text-primary-foreground border-primary font-bold shadow-xs"
                  : "bg-muted/40 border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {preset}%
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
