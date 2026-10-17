import { useState, useEffect } from "react";
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
}

export function PolicyEditor({ policy, records, onApply }: PolicyEditorProps) {
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
    created_at: new Date().toISOString(),
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
        <h3 className="text-base font-bold tracking-tight text-foreground">Editor de política</h3>
        <Badge variant="secondary" className="font-mono text-xs">
          {activeVersion} activa
        </Badge>
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
        <h4 className="text-sm font-medium text-foreground">Presupuestos por categoría</h4>
        <CategoryBudgetTable
          budgets={budgets}
          onChange={handleBudgetChange}
          disabled={simulating || applying}
        />
      </div>

      {/* Comment */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Comentario (auditoría)</label>
        <Input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Ajuste manual de parámetros"
          disabled={simulating || applying}
        />
      </div>

      {/* Botones */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={handleSimulate} disabled={simulating || applying}>
          {simulating ? "Simulando..." : "Simular"}
        </Button>
        <Button onClick={handleApply} disabled={!hasSimulated || applying || simulating}>
          {applying ? "Aplicando..." : "Aplicar"}
        </Button>
        <Button variant="ghost" onClick={handleReset} disabled={simulating || applying}>
          Volver a la versión base
        </Button>
      </div>

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
