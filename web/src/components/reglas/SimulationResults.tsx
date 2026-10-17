import { VerdictBadge } from "@/components/ui/VerdictBadge";
import type { AffectedInvoice } from "@/types/policy";
import type { AuditRecordView } from "@/types/audit";

interface SimulationResultsProps {
  records: AuditRecordView[];
  affected: AffectedInvoice[];
  stale: boolean;
}

export function SimulationResults({ records, affected, stale }: SimulationResultsProps) {
  if (stale) {
    return (
      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 text-center">
        <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">
          Los parámetros cambiaron. Presiona "Simular" de nuevo.
        </p>
      </div>
    );
  }

  if (affected.length === 0) {
    return (
      <div className="rounded-xl border border-border/80 bg-card shadow-xs p-4 text-center">
        <p className="text-sm text-muted-foreground">
          Ninguna factura se vería afectada con estos parámetros.
        </p>
      </div>
    );
  }

  // Map affected to records for display
  const affectedMap = new Map(affected.map((a) => [a.invoice_id, a]));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-foreground">
          Facturas afectadas ({affected.length})
        </h4>
      </div>
      <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-muted/30 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px]">
                  Folio
                </th>
                <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px]">
                  Proveedor
                </th>
                <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px]">
                  Antes
                </th>
                <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px]">
                  Después
                </th>
                <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px]">
                  Nuevo motivo
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {records
                .filter((r) => affectedMap.has(r.invoice_id))
                .map((rec) => {
                  const aff = affectedMap.get(rec.invoice_id);
                  if (!aff) return null;
                  return (
                    <tr key={rec.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-foreground">
                        {rec.invoice.invoice_number}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {rec.invoice.vendor_name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <VerdictBadge verdict={aff.before} size="sm" />
                      </td>
                      <td className="px-4 py-3">
                        <VerdictBadge verdict={aff.after} size="sm" />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">
                        <div className="truncate text-[11px] font-mono">{aff.reason_code}</div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
