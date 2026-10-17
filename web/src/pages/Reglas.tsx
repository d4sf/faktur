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

export default function Reglas() {
  const { policy, records, loading, error, refresh } = usePolicy();

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

  return (
    <div className="space-y-8">
      {/* 1. Encabezado */}
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Reglas de política
        </h2>
        <p className="text-sm text-muted-foreground">
          Parámetros financieros y orden de precedencia determinista del agente de pagos (versión v1
          congelada).
        </p>
      </div>

      {/* 2. Tabla de las 8 reglas con orden de precedencia */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold tracking-tight text-foreground">
              Matriz determinista de precedencia (8 reglas)
            </h3>
            <p className="text-xs text-muted-foreground">
              El motor evalúa las reglas en este orden estricto de 1 a 8. La primera condición que
              se cumple define el veredicto.
            </p>
          </div>
          <span className="text-xs font-mono text-muted-foreground">
            Versión {policy?.version ?? "v1"}
          </span>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/20 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px] whitespace-nowrap">
                    Regla
                  </th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px]">
                    Nombre
                  </th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px] whitespace-nowrap">
                    Salida canónica
                  </th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px]">
                    Condición de disparo
                  </th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px]">
                    Acción del agente
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {POLICY_RULES.map((rule) => (
                  <tr key={rule.ruleNumber} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-foreground whitespace-nowrap">
                      {rule.ruleNumber}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">{rule.name}</td>
                    <td className="px-4 py-3">
                      <VerdictBadge verdict={rule.verdict} size="sm" />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-sm">{rule.condition}</td>
                    <td className="px-4 py-3 text-muted-foreground max-w-sm">{rule.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 3. Editor de política */}
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

      {policy && <PolicyEditor policy={policy} records={records} onApply={handleApply} />}
    </div>
  );
}
