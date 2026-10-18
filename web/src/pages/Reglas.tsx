/**
 * @file Reglas.tsx
 * @description Catálogo oficial de las 8 reglas deterministas de política (versión v1 congelada),
 * panel de parámetros financieros globales (estilo Donezo refinado sin flechas ni puntos distractores),
 * presupuestos por categoría con indicadores limpios y editor interactivo de política en vivo (T20).
 */

import { useState } from "react";
import { FileCode2, Lock, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import { PolicyEditor } from "@/components/reglas/PolicyEditor";
import { usePolicy } from "@/hooks/usePolicy";

/**
 * Representa una regla del motor determinista de cuentas por pagar.
 */
interface PolicyRule {
  ruleNumber: string;
  name: string;
  verdict: "PAGAR" | "FRENAR" | "ESCALAR";
  reasonCode: string;
  condition: string;
  action: string;
}

const POLICY_RULES: PolicyRule[] = [
  {
    ruleNumber: "Regla 1",
    name: "Extracción y legibilidad de datos",
    verdict: "FRENAR",
    reasonCode: "ERR_INVALID_DATA / ALERT_LOW_CONFIDENCE",
    condition: "Datos críticos ilegibles, sin folio o confianza del modelo inferior a 0.70.",
    action: "Frena inmediatamente si falta folio o tax ID; escala si la confianza es baja.",
  },
  {
    ruleNumber: "Regla 2",
    name: "Verificación de duplicados",
    verdict: "FRENAR",
    reasonCode: "ERR_DUPLICATE_INVOICE",
    condition: "Hash SHA-256 o combinación de proveedor y número de factura ya registrada.",
    action: "Bloquea el pago permanentemente para evitar desembolsos duplicados.",
  },
  {
    ruleNumber: "Regla 3",
    name: "Lista de beneficiarios bloqueados",
    verdict: "FRENAR",
    reasonCode: "ERR_BLACKLISTED_VENDOR",
    condition: "El beneficiario o RFC figura en la lista de entidades sancionadas por auditoría.",
    action: "Freno estricto de seguridad. No es aprobable ni por excepción humana.",
  },
  {
    ruleNumber: "Regla 4",
    name: "Proveedor registrado en directorio",
    verdict: "ESCALAR",
    reasonCode: "ALERT_NEW_VENDOR",
    condition: "El proveedor es nuevo o no figura en el catálogo de proveedores activos.",
    action: "Escala a revisión humana para verificar alta de proveedor y cuenta bancaria.",
  },
  {
    ruleNumber: "Regla 5",
    name: "Desvío sobre importe histórico",
    verdict: "ESCALAR",
    reasonCode: "ALERT_VENDOR_DRIFT",
    condition: "El importe supera en más del 40% (factor 1.4x) el promedio histórico acordado.",
    action: "Escala a revisión humana para validar el incremento de costo.",
  },
  {
    ruleNumber: "Regla 6",
    name: "Presupuesto disponible en período y categoría",
    verdict: "ESCALAR",
    reasonCode: "ALERT_BUDGET_OVERRUN / ALERT_BUDGET_TIGHT",
    condition: "El monto compromete el presupuesto mensual de $5,000 USD o agota la categoría.",
    action: "Escala a revisión humana antes de comprometer el saldo disponible.",
  },
  {
    ruleNumber: "Regla 7",
    name: "Límite de aprobación autónoma ($1,000 USD)",
    verdict: "ESCALAR",
    reasonCode: "ALERT_THRESHOLD_EXCEEDED",
    condition: "Cualquier factura con importe superior a $1,000.00 USD.",
    action: "Requiere firma humana de autorización para montos elevados.",
  },
  {
    ruleNumber: "Regla 8",
    name: "Criterio de pase directo y dispersión STP",
    verdict: "PAGAR",
    reasonCode: "SUCCESS_TOUCHLESS_STP",
    condition: "Factura válida que cumple satisfactoriamente las 7 reglas previas.",
    action: "Emisión de pago automático inmediato hacia la cuenta del proveedor.",
  },
];

const CATEGORY_BUDGETS = [
  { category: "Marketing", budget: "$4,000.00 USD", status: "Activo" },
  { category: "Legal", budget: "$3,000.00 USD", status: "Activo" },
  { category: "Infraestructura", budget: "$1,500.00 USD", status: "Activo" },
  { category: "Diseño", budget: "$1,000.00 USD", status: "Activo" },
  { category: "Software", budget: "$500.00 USD", status: "Activo" },
  { category: "Retail", budget: "$0.00 USD", status: "Bloqueado" },
];

export default function Reglas() {
  const { policy, records, loading, error, refresh } = usePolicy();
  const [isEditing, setIsEditing] = useState(false);

  const handleApply = async (candidate: import("@/types/policy").CandidatePolicy) => {
    const res = await fetch("/api/policy", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(candidate),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    const newPolicy = await res.json();
    await refresh();
    return newPolicy;
  };

  const threshold = policy?.auto_approval_threshold_usd ?? 1000;
  const monthlyBudget = policy?.monthly_budget_usd ?? 5000;
  const driftFactor = policy?.vendor_drift_factor ?? 1.4;
  const minConfidence = policy?.min_extraction_confidence ?? 0.7;
  const activeVersion = policy?.version ?? "v1";

  const categoryItems = policy?.category_budgets
    ? Object.entries(policy.category_budgets).map(([category, budget]) => ({
        category,
        budget: `$${budget.toLocaleString("en-US", { minimumFractionDigits: 2 })} USD`,
        status: budget > 0 ? "Activo" : "Bloqueado",
      }))
    : CATEGORY_BUDGETS;

  return (
    <div className="space-y-6">
      {/* 1. Encabezado */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-1">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Reglas de política
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Parámetros financieros y orden de precedencia determinista del agente de pagos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto shrink-0">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#185338] text-white text-xs font-semibold shadow-xs shrink-0 whitespace-nowrap">
            <Lock className="size-3.5 shrink-0" />
            <span>
              {activeVersion} {policy ? "Activa" : "Congelada"}
            </span>
          </div>

          <a
            href="/api/policy"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-card border border-border/80 text-foreground text-xs font-semibold shadow-xs hover:bg-muted/50 transition-colors shrink-0 whitespace-nowrap"
          >
            <FileCode2 className="size-3.5 text-muted-foreground shrink-0" />
            <span>Spec JSON</span>
          </a>

          <Button
            type="button"
            variant={isEditing ? "secondary" : "default"}
            size="sm"
            onClick={() => setIsEditing((prev) => !prev)}
            className="rounded-full text-xs font-semibold gap-1.5 h-8 px-3.5 shadow-xs shrink-0 whitespace-nowrap cursor-pointer"
          >
            {isEditing ? (
              <>
                <X className="size-3.5" />
                <span>Cerrar editor</span>
              </>
            ) : (
              <>
                <SlidersHorizontal className="size-3.5" />
                <span>Editar política</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Editor interactivo desplegable */}
      {isEditing && (
        <div className="rounded-2xl bg-card border border-primary/30 p-6 shadow-sm transition-all animate-in fade-in-50 duration-200">
          {loading && (
            <div className="space-y-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              Error al cargar la política: {error}
            </div>
          )}

          {policy && (
            <PolicyEditor
              policy={policy}
              records={records}
              onApply={handleApply}
              onClose={() => setIsEditing(false)}
            />
          )}
        </div>
      )}

      {/* 2. Tarjetas KPI superiores (Estilo Donezo: 1ra verde bosque + 3 blancas, sin flechas y subtítulos limpios sin puntos) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 (Hero Card Verde Bosque) */}
        <div className="rounded-2xl bg-[#185338] text-white p-5 shadow-xs flex flex-col justify-between min-h-[130px]">
          <div>
            <span className="text-xs font-medium text-emerald-100/90">Umbral autónomo</span>
            {loading && !policy ? (
              <div className="h-9 flex items-center mt-1.5">
                <Skeleton className="h-8 w-28 bg-white/20" />
              </div>
            ) : (
              <div className="text-3xl font-extrabold tracking-tight mt-1.5">
                ${threshold.toLocaleString("en-US")}
                <span className="text-base font-normal text-emerald-200/80">.00</span>
              </div>
            )}
          </div>
          <p className="text-[11px] font-medium text-emerald-200 mt-2">
            Pago directo sin firma humana
          </p>
        </div>

        {/* KPI 2: Presupuesto mensual */}
        <div className="rounded-2xl bg-card border border-border/80 p-5 shadow-xs flex flex-col justify-between min-h-[130px] hover:border-border transition-colors">
          <div>
            <span className="text-xs font-medium text-muted-foreground">Presupuesto mensual</span>
            {loading && !policy ? (
              <div className="h-9 flex items-center mt-1.5">
                <Skeleton className="h-8 w-28" />
              </div>
            ) : (
              <div className="text-3xl font-extrabold tracking-tight text-foreground mt-1.5">
                ${monthlyBudget.toLocaleString("en-US")}
                <span className="text-base font-normal text-muted-foreground">.00</span>
              </div>
            )}
          </div>
          <p className="text-[11px] font-medium text-muted-foreground mt-2">
            Límite global por ciclo
          </p>
        </div>

        {/* KPI 3: Tolerancia de desvío */}
        <div className="rounded-2xl bg-card border border-border/80 p-5 shadow-xs flex flex-col justify-between min-h-[130px] hover:border-border transition-colors">
          <div>
            <span className="text-xs font-medium text-muted-foreground">Tolerancia de desvío</span>
            {loading && !policy ? (
              <div className="h-9 flex items-center mt-1.5">
                <Skeleton className="h-8 w-20" />
              </div>
            ) : (
              <div className="text-3xl font-extrabold tracking-tight text-foreground mt-1.5">
                {driftFactor}
                <span className="text-lg font-normal text-muted-foreground">x</span>
              </div>
            )}
          </div>
          <p className="text-[11px] font-medium text-muted-foreground mt-2">
            Máximo +{Math.round((driftFactor - 1) * 100)}% sobre acordado
          </p>
        </div>

        {/* KPI 4: Confianza mínima IA */}
        <div className="rounded-2xl bg-card border border-border/80 p-5 shadow-xs flex flex-col justify-between min-h-[130px] hover:border-border transition-colors">
          <div>
            <span className="text-xs font-medium text-muted-foreground">Confianza mínima IA</span>
            {loading && !policy ? (
              <div className="h-9 flex items-center mt-1.5">
                <Skeleton className="h-8 w-20" />
              </div>
            ) : (
              <div className="text-3xl font-extrabold tracking-tight text-foreground mt-1.5">
                {Math.round(minConfidence * 100)}
                <span className="text-lg font-normal text-muted-foreground">%</span>
              </div>
            )}
          </div>
          <p className="text-[11px] font-medium text-muted-foreground mt-2">
            Filtro de legibilidad OCR
          </p>
        </div>
      </div>

      {/* 3. Matriz determinista de las 8 reglas (Screenshot 1: Bento Card amplia) */}
      <div className="rounded-2xl bg-card border border-border/80 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-border/60">
          <div>
            <h2 className="text-base font-bold text-foreground">
              Matriz determinista de precedencia
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              El motor evalúa las reglas en este orden estricto de 1 a 8. La primera condición que
              se cumple define el veredicto.
            </p>
          </div>
          <span className="px-3 py-1 rounded-full bg-muted/60 text-xs font-mono font-medium text-muted-foreground self-start sm:self-auto">
            Precedencia 1 → 8
          </span>
        </div>

        <div className="overflow-x-auto mt-2">
          <table className="w-full text-left text-xs min-w-[640px]">
            <thead className="border-b border-border/60 text-muted-foreground">
              <tr>
                <th className="sticky left-0 bg-card z-10 py-3 px-3 font-semibold uppercase tracking-wider text-[10px] whitespace-nowrap shadow-[1px_0_0_0_var(--border)]">
                  Regla
                </th>
                <th className="py-3 px-3 font-semibold uppercase tracking-wider text-[10px]">
                  Nombre
                </th>
                <th className="py-3 px-3 font-semibold uppercase tracking-wider text-[10px] whitespace-nowrap">
                  Veredicto
                </th>
                <th className="py-3 px-3 font-semibold uppercase tracking-wider text-[10px]">
                  Condición de disparo
                </th>
                <th className="py-3 px-3 font-semibold uppercase tracking-wider text-[10px]">
                  Acción del agente
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {POLICY_RULES.map((rule) => (
                <tr key={rule.ruleNumber} className="hover:bg-muted/30 transition-colors">
                  <td className="sticky left-0 bg-card z-10 py-3.5 px-3 font-mono font-bold text-foreground whitespace-nowrap shadow-[1px_0_0_0_var(--border)]">
                    {rule.ruleNumber}
                  </td>
                  <td className="py-3.5 px-3 font-medium text-foreground min-w-[140px] max-w-[200px]">
                    {rule.name}
                  </td>
                  <td className="py-3.5 px-3 whitespace-nowrap">
                    <VerdictBadge verdict={rule.verdict} size="sm" />
                  </td>
                  <td className="py-3.5 px-3 text-muted-foreground min-w-[180px] max-w-xs">
                    {rule.condition}
                  </td>
                  <td className="py-3.5 px-3 text-muted-foreground min-w-[180px] max-w-xs">
                    {rule.action}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Presupuestos por categoría (Screenshot 2: con puntito, sin fondo ni píldora de color) */}
      <div className="rounded-2xl bg-card border border-border/80 p-6 shadow-xs">
        <div className="pb-3 border-b border-border/60">
          <h2 className="text-base font-bold text-foreground">
            Presupuestos asignados por categoría
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Límites mensuales asignados para el control de gastos por rubro.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mt-4">
          {categoryItems.map((cat) => {
            const isBlocked = cat.status === "Bloqueado";

            return (
              <div
                key={cat.category}
                className="rounded-xl border border-border/70 bg-card p-3.5 space-y-1.5 hover:border-border transition-colors"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-foreground truncate" title={cat.category}>
                    {cat.category}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`size-1.5 rounded-full shrink-0 ${isBlocked ? "bg-rose-500" : "bg-emerald-500"}`}
                    />
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                      {cat.status}
                    </span>
                  </div>
                </div>
                <p className="font-mono text-xs font-bold text-foreground pt-0.5">{cat.budget}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
