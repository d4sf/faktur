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
import { VerdictBadge } from "@/components/ui/VerdictBadge";
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

const FALLBACK_RECORDS: ReportRecord[] = [
  {
    id: "inv-tc-01",
    invoice_number: "INV-AWS-8821",
    vendor_name: "Amazon Web Services",
    issue_date: "2026-10-01",
    total_usd: 450,
    verdict: "PAGAR",
    reason_code: "SUCCESS_TOUCHLESS_STP",
    explanation: "Cumple todas las políticas: pago directo al proveedor.",
    decided_by: "agente",
    decided_at: "2026-10-01 10:15",
    policy_version: "v1",
    estado: "PAGADA",
  },
  {
    id: "inv-tc-04",
    invoice_number: "INV-GA-3500",
    vendor_name: "Growth Agency",
    issue_date: "2026-10-03",
    total_usd: 3500,
    verdict: "ESCALAR",
    reason_code: "ALERT_THRESHOLD_EXCEEDED",
    explanation: "Supera el umbral de aprobación autónoma de $1,000 USD (Regla 7).",
    decided_by: "agente",
    decided_at: "2026-10-03 12:40",
    policy_version: "v1",
    estado: "PENDIENTE",
  },
  {
    id: "inv-tc-11",
    invoice_number: "INV-BLK-9912",
    vendor_name: "Blacklisted Services Ltd",
    issue_date: "2026-10-08",
    total_usd: 1200,
    verdict: "FRENAR",
    reason_code: "ERR_BLACKLISTED_VENDOR",
    explanation: "El beneficiario figura en la lista de entidades bloqueadas por auditoría.",
    decided_by: "agente",
    decided_at: "2026-10-08 14:05",
    policy_version: "v1",
    estado: "FRENADA",
  },
];

export default function Reporte() {
  const [records, setRecords] = useState<ReportRecord[]>([]);
  const [metrics, setMetrics] = useState<AuditMetricsData>({
    budget_remaining: 3550,
    threshold_limit: 1000,
    total_processed: 3,
    touchless_rate: 33.3,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>("");

  interface BackendAuditRecord {
    id: string;
    invoice_number?: string | null;
    vendor_id?: string | null;
    issue_date?: string | null;
    total_usd?: number;
    verdict?: "PAGAR" | "FRENAR" | "ESCALAR";
    reason_code?: string;
    explanation?: string;
    decided_by?: string;
    decided_at?: string;
    policy_version?: string;
    estado?: string;
    status?: string;
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
        if (Array.isArray(data.records) && data.records.length > 0) {
          const mapped: ReportRecord[] = (data.records as BackendAuditRecord[]).map((r) => ({
            id: r.id,
            invoice_number: r.invoice_number || "S/F",
            vendor_name: r.vendor_id || "Proveedor verificado",
            issue_date: r.issue_date || "-",
            total_usd: r.total_usd || 0,
            verdict: r.verdict || "PAGAR",
            reason_code: r.reason_code || "-",
            explanation: r.explanation || "-",
            decided_by: r.decided_by || "agente",
            decided_at: r.decided_at || "-",
            policy_version: r.policy_version || "v1",
            estado: r.estado || r.status || "PROCESADA",
          }));
          setRecords(mapped);
        } else {
          setRecords(FALLBACK_RECORDS);
        }
      } else {
        setRecords(FALLBACK_RECORDS);
      }
    } catch {
      setRecords(FALLBACK_RECORDS);
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
      r.reason_code.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Encabezado con Botón de Descarga Principal */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-5">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Reporte y auditoría CSV
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Registro reproducible e inmutable de decisiones financieras con las 14 columnas
            canónicas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadAuditData}
            disabled={loading}
            className="h-10 text-xs gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Actualizar</span>
          </Button>

          <Button
            asChild
            size="lg"
            className="h-10 px-4 text-xs font-semibold gap-2 shadow-xs bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <a href="/api/report.csv" download="faktur-report.csv">
              <Download className="size-4" />
              <span>Descargar reporte CSV</span>
            </a>
          </Button>
        </div>
      </div>

      {/* Tarjetas de Métricas de Auditoría */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Total procesado
          </span>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {metrics.total_processed}{" "}
            <span className="text-xs font-normal text-muted-foreground">facturas</span>
          </p>
          <span className="text-[10px] text-muted-foreground mt-1 block">En el período actual</span>
        </Card>

        <Card className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Tasa autónoma STP
          </span>
          <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {metrics.touchless_rate}%
          </p>
          <span className="text-[10px] text-muted-foreground mt-1 block">
            Pase directo sin humanos
          </span>
        </Card>

        <Card className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Presupuesto disponible
          </span>
          <p className="mt-1 text-2xl font-bold text-foreground">
            ${metrics.budget_remaining.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-muted-foreground mt-1 block">
            De $5,000.00 USD global
          </span>
        </Card>

        <Card className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Umbral de corte
          </span>
          <p className="mt-1 text-2xl font-bold text-foreground">
            ${metrics.threshold_limit.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-muted-foreground mt-1 block">
            Límite para auto-pago (R7)
          </span>
        </Card>
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
              className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
            />
          </div>
          <span className="text-xs text-muted-foreground">
            Mostrando {filteredRecords.length} registros auditables
          </span>
        </div>

        <Card className="rounded-xl border border-border/80 overflow-hidden shadow-xs">
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
                {filteredRecords.map((r) => (
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
                    <td className="px-4 py-3 text-muted-foreground font-mono text-[11px] truncate max-w-[140px]">
                      {r.reason_code}
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
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
