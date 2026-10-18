import { Download, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { AuditTable } from "@/components/audit/AuditTable";
import { DashboardCharts } from "@/components/audit/DashboardCharts";
import { InvoiceInspector } from "@/components/audit/InvoiceInspector";
import { RoiCard } from "@/components/audit/RoiCard";
import type { AuditRecordView, AuditTrail } from "@/types/audit";

function formatBudget(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

export function AuditFeed() {
  const [data, setData] = useState<AuditTrail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<AuditRecordView | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const load = (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    const minDelay = silent ? new Promise<void>((r) => setTimeout(r, 450)) : Promise.resolve();

    Promise.all([
      fetch("/api/audit-trail").then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<AuditTrail>;
      }),
      minDelay,
    ])
      .then(([d]) => {
        setData(d);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error al actualizar"))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  };

  // Carga inicial
  useEffect(() => {
    load(false);
  }, []);

  const handleSelectRecord = (record: AuditRecordView) => {
    setSelectedRecord(record);
    setInspectorOpen(true);
  };

  const metrics = data?.metrics;

  return (
    <div className="space-y-8">
      {/* KPIs con estilo Donezo refinado (1ra Hero Verde Bosque) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <RoiCard
          variant="hero"
          title="Tasa de aprobación autónoma"
          value={metrics ? `${metrics.touchless_rate}%` : "—"}
          subtitle="Facturas procesadas directamente sin firma humana (STP)"
          loading={loading && !metrics}
        />
        <RoiCard
          title="Presupuesto disponible"
          value={metrics ? formatBudget(metrics.budget_remaining) : "—"}
          subtitle="Balance mensual restante para dispersión"
          loading={loading && !metrics}
        />
        <RoiCard
          title="Total procesadas"
          value={metrics ? `${metrics.total_processed}` : "—"}
          subtitle="Evaluadas con las 8 reglas deterministas"
          loading={loading && !metrics}
        />
      </div>

      {/* Gráficos de Estadísticas y Analítica Visual */}
      <DashboardCharts records={data?.records ?? []} metrics={metrics} />

      {/* Tabla */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold tracking-tight text-foreground">
            Facturas procesadas recientemente
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {data ? `${data.records.length} registradas` : ""}
            </span>
            <Button
              variant="outline"
              size="sm"
              asChild
              className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground shadow-xs gap-1"
            >
              <a href="/api/report.csv" download>
                <Download className="size-3.5" />
                <span>Exportar CSV</span>
              </a>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => load(true)}
              disabled={refreshing || loading}
              className="h-7 px-2.5 text-xs shadow-xs cursor-pointer transition-colors"
            >
              <RefreshCw
                className={`size-3.5 mr-1 text-[#185338] ${refreshing ? "animate-spin" : ""}`}
              />
              <span>{refreshing ? "Actualizando…" : "Refrescar"}</span>
            </Button>
          </div>
        </div>

        {error && !data ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-destructive/50 bg-destructive/10 py-12 px-4 text-center">
            <p className="text-sm text-destructive">Error al cargar los datos: {error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => load(false)}
              className="mt-3 text-xs"
            >
              Reintentar
            </Button>
          </div>
        ) : (
          <div className="relative">
            {refreshing && (
              <div className="absolute inset-x-0 top-0 h-0.5 bg-[#185338]/20 overflow-hidden z-10 rounded-t-xl">
                <div className="h-full bg-[#185338] animate-pulse w-full" />
              </div>
            )}
            <AuditTable
              records={data?.records ?? []}
              onSelectRecord={handleSelectRecord}
              loading={loading && !data}
            />
          </div>
        )}
      </div>

      {/* Inspector lateral */}
      <InvoiceInspector
        record={selectedRecord}
        open={inspectorOpen}
        onOpenChange={setInspectorOpen}
      />
    </div>
  );
}
