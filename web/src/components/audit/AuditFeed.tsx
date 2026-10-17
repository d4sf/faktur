import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { AuditTable } from "@/components/audit/AuditTable";
import { InvoiceInspector } from "@/components/audit/InvoiceInspector";
import { RoiCard } from "@/components/audit/RoiCard";
import type { AuditRecordView, AuditTrail } from "@/types/audit";

function formatBudget(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

export function AuditFeed() {
  const [data, setData] = useState<AuditTrail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<AuditRecordView | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    fetch("/api/audit-trail")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((d: AuditTrail) => setData(d))
      .catch((err) => setError(err instanceof Error ? err.message : "Error al cargar"))
      .finally(() => setLoading(false));
  };

  // Carga inicial
  useEffect(() => {
    load();
  }, []);

  const handleSelectRecord = (record: AuditRecordView) => {
    setSelectedRecord(record);
    setInspectorOpen(true);
  };

  const metrics = data?.metrics;

  return (
    <div className="space-y-8">
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 md:gap-5">
        <RoiCard
          title="Tasa de aprobación automática"
          value={metrics ? `${metrics.touchless_rate}%` : "—"}
          subtitle="Facturas aprobadas sin intervención manual"
        />
        <RoiCard
          title="Presupuesto restante"
          value={metrics ? formatBudget(metrics.budget_remaining) : "—"}
          subtitle="Balance mensual disponible en USD"
        />
        <RoiCard
          title="Total procesadas"
          value={metrics ? String(metrics.total_processed) : "—"}
          subtitle="Facturas evaluadas en el ciclo actual"
        />
      </div>

      {/* Tabla */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold tracking-tight text-foreground">
            Facturas procesadas recientemente
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {data ? `${data.records.length} registradas` : ""}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              disabled={loading}
              className="h-7 px-2 text-xs"
            >
              <RefreshCw className={`size-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
              <span>Refrescar</span>
            </Button>
          </div>
        </div>

        {error ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-destructive/50 bg-destructive/10 py-12 px-4 text-center">
            <p className="text-sm text-destructive">Error al cargar los datos: {error}</p>
            <Button variant="outline" size="sm" onClick={load} className="mt-3 text-xs">
              Reintentar
            </Button>
          </div>
        ) : (
          <AuditTable
            records={data?.records ?? []}
            onSelectRecord={handleSelectRecord}
            loading={loading}
          />
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
