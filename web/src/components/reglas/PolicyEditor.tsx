import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PolicySliders } from "@/components/reglas/PolicySliders";
import { CategoryBudgetTable } from "@/components/reglas/CategoryBudgetTable";
import { SimulationResults } from "@/components/reglas/SimulationResults";
import type { PolicySpec, CandidatePolicy, AffectedInvoice } from "@/types/policy";
import type { AuditRecordView } from "@/types/audit";

interface PolicyEditorProps {
  policy: PolicySpec;
  records: AuditRecordView[];
  onApply: (policy: CandidatePolicy) => Promise<PolicySpec>;
  onClose?: () => void;
}

export function PolicyEditor({ policy, records, onApply, onClose }: PolicyEditorProps) {
  const [threshold, setThreshold] = useState(policy.auto_approval_threshold_usd);
  const [monthlyBudget, setMonthlyBudget] = useState(policy.monthly_budget_usd);
  const [driftFactor, setDriftFactor] = useState(policy.vendor_drift_factor);
  const [minConfidence, setMinConfidence] = useState(policy.min_extraction_confidence);
  const [budgets, setBudgets] = useState<Record<string, number>>({ ...policy.category_budgets });
  const [comment, setComment] = useState("Ajuste manual de parámetros");
  const [activeVersion, setActiveVersion] = useState(policy.version);

  const [simulation, setSimulation] = useState<AffectedInvoice[] | null>(null);
  const [stale, setStale] = useState(false);
  const [hasSimulated, setHasSimulated] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mark simulation as stale when any parameter changes
  useEffect(() => {
    if (hasSimulated) {
      setStale(true);
      setSimulation(null);
    }
  }, [threshold, monthlyBudget, driftFactor, minConfidence, budgets, comment]);

  const buildCandidate = (): CandidatePolicy => ({
    auto_approval_threshold_usd: threshold,
    monthly_budget_usd: monthlyBudget,
    vendor_drift_factor: driftFactor,
    min_extraction_confidence: minConfidence,
    allowed_currencies: policy.allowed_currencies,
    category_budgets: budgets,
    created_at: new Date().toISOString().split("T")[0],
    created_by: "admin",
    comment: comment || "Ajuste manual de parámetros",
  });

  const handleSimulate = async () => {
    setSimulating(true);
    setError(null);
    try {
      const res = await fetch("/api/policy/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCandidate()),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSimulation(data.affected ?? []);
      setStale(false);
      setHasSimulated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al simular");
    } finally {
      setSimulating(false);
    }
  };

  const handleApply = async () => {
    setApplying(true);
    setError(null);
    try {
      const newPolicy = await onApply(buildCandidate());
      setActiveVersion(newPolicy.version);
      setThreshold(newPolicy.auto_approval_threshold_usd);
      setMonthlyBudget(newPolicy.monthly_budget_usd);
      setDriftFactor(newPolicy.vendor_drift_factor);
      setMinConfidence(newPolicy.min_extraction_confidence);
      setBudgets({ ...newPolicy.category_budgets });
      setComment("Ajuste manual de parámetros");
      setSimulation(null);
      setStale(false);
      setHasSimulated(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al aplicar");
    } finally {
      setApplying(false);
    }
  };

  const handleReset = () => {
    setThreshold(policy.auto_approval_threshold_usd);
    setMonthlyBudget(policy.monthly_budget_usd);
    setDriftFactor(policy.vendor_drift_factor);
    setMinConfidence(policy.min_extraction_confidence);
    setBudgets({ ...policy.category_budgets });
    setComment("Ajuste manual de parámetros");
    setSimulation(null);
    setStale(false);
    setHasSimulated(false);
  };

  const handleBudgetChange = (category: string, value: number) => {
    setBudgets((prev) => ({ ...prev, [category]: value }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold tracking-tight text-foreground">Editor de política</h3>
          <Badge variant="secondary" className="font-mono text-xs">
            {activeVersion} activa
          </Badge>
        </div>
        {onClose && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground h-8 px-2"
          >
            <X className="size-4 mr-1" />
            Cerrar
          </Button>
        )}
      </div>

      {/* Sliders */}
      <PolicySliders
        threshold={threshold}
        onThresholdChange={setThreshold}
        monthlyBudget={monthlyBudget}
        onMonthlyBudgetChange={setMonthlyBudget}
        driftFactor={driftFactor}
        onDriftFactorChange={setDriftFactor}
        minConfidence={minConfidence}
        onMinConfidenceChange={setMinConfidence}
        disabled={simulating || applying}
      />

      {/* Budgets por categoría */}
      <div className="space-y-2">
        <h4 className="text-sm font-bold text-foreground">Presupuestos por categoría</h4>
        <CategoryBudgetTable
          budgets={budgets}
          onChange={handleBudgetChange}
          disabled={simulating || applying}
          monthlyBudget={monthlyBudget}
        />
      </div>

      {/* Comment */}
      <div className="space-y-2 rounded-xl border border-border/70 bg-card/60 p-4">
        <label className="text-xs font-bold text-foreground flex items-center justify-between">
          <span>Motivo de ajuste (registro obligatorio de auditoría)</span>
          <span className="text-[10px] text-muted-foreground font-normal">
            Quedará registrado en el historial de versiones de política
          </span>
        </label>
        <Input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Ej: Aumento temporal de umbral para cierre de trimestre..."
          disabled={simulating || applying}
          className="text-xs bg-background"
        />
      </div>

      {/* Botones de acción */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          variant="outline"
          onClick={handleSimulate}
          disabled={simulating || applying}
          className="cursor-pointer font-semibold shadow-xs"
        >
          {simulating ? "Simulando impacto..." : "Simular impacto"}
        </Button>
        <Button
          onClick={handleApply}
          disabled={!hasSimulated || applying || simulating}
          className="cursor-pointer font-semibold shadow-xs"
        >
          {applying ? "Aplicando política..." : "Aplicar nueva política"}
        </Button>
        <Button
          variant="ghost"
          onClick={handleReset}
          disabled={simulating || applying}
          className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
        >
          Volver a la versión base
        </Button>
        {onClose && (
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={simulating || applying}
            className="sm:ml-auto cursor-pointer text-xs"
          >
            Cerrar editor
          </Button>
        )}
      </div>

      {!hasSimulated && !simulating && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <span>💡</span>
          <span>
            Haz clic en <strong>Simular impacto</strong> para previsualizar si alguna factura
            existente cambiaría de veredicto antes de aplicar.
          </span>
        </p>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Resultados de simulación */}
      {simulation !== null && (
        <SimulationResults records={records} affected={simulation} stale={stale} />
      )}
    </div>
  );
}
