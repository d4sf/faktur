/**
 * @file Reporte.tsx
 * @description Vista de Auditoría y Descarga de Reporte CSV.
 * Proporciona acceso a la descarga del archivo CSV oficial (14 columnas canónicas)
 * y una tabla interactiva con los KPIs financieros consolidados.
 */

import { useEffect, useState } from "react";
import { Download, RefreshCw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import { formatReasonTitle } from "@/lib/invoiceSubmit";
import { AuditMetricsData } from "@/types/invoice";

interface ReportRecord {
  id: string;
  invoice_number: string | null;
  vendor_name: string | null;
  issue_date: string | null;
  total_usd: number;
  verdict: "PAGAR" | "FRENAR" | "ESCALAR";
  reason_code: string;
  explanation: string;
  decided_by: string;
  decided_at: string;
  policy_version: string;
  estado: string;
}

export default function Reporte() {
  const [records, setRecords] = useState<ReportRecord[]>([]);
  const [metrics, setMetrics] = useState<AuditMetricsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>("");

  interface BackendAuditRecord {
    id: string;
    invoice?: {
      invoice_number?: string | null;
      vendor_name?: string | null;
      issue_date?: string | null;
      total_amount?: number | null;
      currency?: string | null;
    };
    amount_usd?: number;
    verdict?: "PAGAR" | "FRENAR" | "ESCALAR";
    reason_code?: string;
    explanation?: string;
    human_approved?: boolean | null;
    created_at?: string;
    estado?: string;
  }

  /**
   * Carga el registro de auditoría y métricas desde el backend.
   */
  const loadAuditData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/audit-trail");
      if (res.ok) {
        const data = await res.json();
        if (data.metrics) setMetrics(data.metrics);
        if (Array.isArray(data.records)) {
          const mapped: ReportRecord[] = (data.records as BackendAuditRecord[]).map((r) => ({
            id: r.id,
            invoice_number: r.invoice?.invoice_number ?? "S/F",
            vendor_name: r.invoice?.vendor_name ?? "Proveedor verificado",
            issue_date: r.invoice?.issue_date ?? "-",
            total_usd: r.amount_usd ?? 0,
            verdict: r.verdict ?? "PAGAR",
            reason_code: r.reason_code ?? "-",
            explanation: r.explanation ?? "-",
            decided_by: r.human_approved === true ? "humano" : "agente",
            decided_at: r.created_at ?? "-",
            policy_version: "—",
            estado: r.estado ?? "PROCESADA",
          }));
          setRecords(mapped);
        }
      }
    } catch {
      // En caso de fallo de red aislado se preservan los registros cargados
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAuditData();
  }, []);

  const filteredRecords = records.filter((r) => {
    const q = searchTerm.toLowerCase();
    return (
      (r.vendor_name?.toLowerCase().includes(q) ?? false) ||
      (r.invoice_number?.toLowerCase().includes(q) ?? false) ||
      r.reason_code.toLowerCase().includes(q) ||
      formatReasonTitle(r.reason_code).toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Encabezado con Botón de Descarga Principal */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-border pb-5">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl font-logo">
            Reporte y auditoría CSV
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Registro reproducible e inmutable de decisiones financieras con las 14 columnas
            canónicas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={loadAuditData}
            disabled={loading}
            className="h-10 text-xs gap-1.5 shrink-0"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Actualizar</span>
          </Button>

          <Button
            asChild
            size="lg"
            className="h-10 px-4 text-xs font-semibold gap-2 shadow-xs bg-[#185338] hover:bg-[#185338]/90 text-white rounded-xl shrink-0 cursor-pointer"
          >
            {/* Sin `download`: el nombre fechado lo fija el Content-Disposition de la API. */}
            <a href="/api/report.csv">
              <Download className="size-4" />
              <span>Descargar reporte CSV</span>
            </a>
          </Button>
        </div>
      </div>

      {/* Tarjetas de Métricas de Auditoría (Estilo Donezo con 1ra Hero Verde Bosque) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 (Hero Card Verde Bosque) */}
        <div className="rounded-2xl bg-[#185338] text-white p-5 shadow-xs flex flex-col justify-between min-h-[130px]">
          <div>
            <span className="text-xs font-medium text-emerald-100/90">Total procesado</span>
            {loading || !metrics ? (
              <div className="h-9 flex items-center mt-1.5">
                <Skeleton className="h-8 w-28 bg-white/20" />
              </div>
            ) : (
              <div className="text-3xl font-extrabold tracking-tight mt-1.5 font-logo">
                {metrics.total_processed}{" "}
                <span className="text-base font-normal text-emerald-200/80">facturas</span>
              </div>
            )}
          </div>
          <p className="text-[11px] font-medium text-emerald-200 mt-2">
            Volumen acumulado en el ciclo actual
          </p>
        </div>

        {/* KPI 2: Tasa autónoma STP */}
        <div className="rounded-2xl bg-card border border-border/80 p-5 shadow-xs flex flex-col justify-between min-h-[130px] hover:border-border transition-colors">
          <div>
            <span className="text-xs font-medium text-muted-foreground">Tasa autónoma STP</span>
            {loading || !metrics ? (
              <div className="h-9 flex items-center mt-1.5">
                <Skeleton className="h-8 w-20" />
              </div>
            ) : (
              <div className="text-3xl font-extrabold tracking-tight text-foreground mt-1.5 font-logo">
                {metrics.touchless_rate}
                <span className="text-lg font-normal text-muted-foreground">%</span>
              </div>
            )}
          </div>
          <p className="text-[11px] font-medium text-muted-foreground mt-2">
            Pase directo sin firma humana
          </p>
        </div>

        {/* KPI 3: Presupuesto disponible */}
        <div className="rounded-2xl bg-card border border-border/80 p-5 shadow-xs flex flex-col justify-between min-h-[130px] hover:border-border transition-colors">
          <div>
            <span className="text-xs font-medium text-muted-foreground">
              Presupuesto disponible
            </span>
            {loading || !metrics ? (
              <div className="h-9 flex items-center mt-1.5">
                <Skeleton className="h-8 w-32" />
              </div>
            ) : (
              <div className="text-3xl font-extrabold tracking-tight text-foreground mt-1.5 font-logo">
                ${metrics.budget_remaining.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </div>
            )}
          </div>
          <p className="text-[11px] font-medium text-muted-foreground mt-2">
            De $5,000.00 USD global
          </p>
        </div>

        {/* KPI 4: Umbral de corte */}
        <div className="rounded-2xl bg-card border border-border/80 p-5 shadow-xs flex flex-col justify-between min-h-[130px] hover:border-border transition-colors">
          <div>
            <span className="text-xs font-medium text-muted-foreground">Umbral de aprobación</span>
            {loading || !metrics ? (
              <div className="h-9 flex items-center mt-1.5">
                <Skeleton className="h-8 w-28" />
              </div>
            ) : (
              <div className="text-3xl font-extrabold tracking-tight text-foreground mt-1.5 font-logo">
                ${metrics.threshold_limit.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </div>
            )}
          </div>
          <p className="text-[11px] font-medium text-muted-foreground mt-2">
            Límite para auto-pago (Regla 7)
          </p>
        </div>
      </div>

      {/* Tabla Previa del Reporte con Buscador */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtrar por folio, proveedor o código..."
              className="w-full rounded-xl border border-border bg-card pl-9 pr-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {loading
              ? "Cargando registros auditables…"
              : `Mostrando ${filteredRecords.length} registros auditables`}
          </span>
        </div>

        <Card className="rounded-2xl border border-border/80 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/20 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px]">
                    Folio
                  </th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px]">
                    Proveedor
                  </th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px]">
                    Fecha
                  </th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px]">
                    Monto (USD)
                  </th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px]">
                    Veredicto
                  </th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px]">
                    Razón
                  </th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px]">
                    Decidido por
                  </th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px]">
                    Versión
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-24" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-32" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-20" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-20" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-16" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-40" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-14" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-8" />
                      </td>
                    </tr>
                  ))
                ) : filteredRecords.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-10 text-center text-muted-foreground text-xs"
                    >
                      No se encontraron registros de auditoría
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-foreground">
                        {r.invoice_number}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">{r.vendor_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.issue_date}</td>
                      <td className="px-4 py-3 font-semibold text-foreground font-mono">
                        ${r.total_usd.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3">
                        <VerdictBadge verdict={r.verdict} size="sm" />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-[11px] truncate max-w-[160px]">
                        <div
                          className="font-medium text-foreground truncate"
                          title={`Código: ${r.reason_code}`}
                        >
                          {formatReasonTitle(r.reason_code)}
                        </div>
                        <div
                          className="text-[10px] text-muted-foreground truncate"
                          title={r.explanation}
                        >
                          {r.explanation}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground capitalize">
                        <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[10px]">
                          {r.decided_by}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">
                        {r.policy_version}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
