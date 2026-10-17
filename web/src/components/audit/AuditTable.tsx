import { Eye } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import type { AuditRecordView } from "@/types/audit";

interface AuditTableProps {
  records: AuditRecordView[];
  onSelectRecord: (record: AuditRecordView) => void;
  loading?: boolean;
}

function formatUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

/**
 * Formatea el monto en su moneda original (ej. `MXN 1,000.00`).
 */
function formatOriginal(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

function formatDate(s: string): string {
  try {
    return new Date(s).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return s;
  }
}

export function AuditTable({ records, onSelectRecord, loading = false }: AuditTableProps) {
  if (loading) {
    return (
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
                  Fecha
                </th>
                <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px]">
                  Monto USD
                </th>
                <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px]">
                  Veredicto
                </th>
                <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px]">
                  Motivo
                </th>
                <th className="px-4 py-3 text-right font-semibold uppercase tracking-wider text-[10px]">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-20" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-28" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-16" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-16" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-14" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-32" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-16" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-border/80 bg-card shadow-xs py-12 px-4 text-center">
        <p className="text-sm text-muted-foreground">Sin registros</p>
        <Link to="/subir" className="mt-2 text-xs text-primary hover:underline">
          Subir factura
        </Link>
      </div>
    );
  }

  return (
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
              <th className="hidden px-4 py-3 font-semibold uppercase tracking-wider text-[10px] md:table-cell">
                Fecha
              </th>
              <th className="hidden px-4 py-3 font-semibold uppercase tracking-wider text-[10px] md:table-cell">
                Monto USD
              </th>
              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px]">
                Veredicto
              </th>
              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px]">
                Motivo
              </th>
              <th className="px-4 py-3 text-right font-semibold uppercase tracking-wider text-[10px]">
                Acción
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {records.map((rec) => (
              <tr
                key={rec.id}
                className="hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => onSelectRecord(rec)}
              >
                <td className="px-4 py-3 font-mono font-medium text-foreground">
                  {rec.invoice.invoice_number}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">
                    {rec.invoice.vendor_name ?? "—"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {rec.invoice.vendor_tax_id ?? "—"}
                  </div>
                </td>
                <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                  {formatDate(rec.invoice.issue_date ?? rec.created_at)}
                </td>
                <td className="hidden px-4 py-3 font-semibold text-foreground md:table-cell">
                  <div>{formatUsd(rec.amount_usd)}</div>
                  {rec.invoice.currency !== "USD" && (
                    <div className="text-[10px] font-normal text-muted-foreground">
                      {formatOriginal(rec.invoice.total_amount, rec.invoice.currency)}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <VerdictBadge verdict={rec.verdict} size="sm" />
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{rec.estado}</div>
                </td>
                <td className="px-4 py-3 text-muted-foreground max-w-xs">
                  <div className="truncate text-[11px] font-mono">{rec.reason_code}</div>
                  <div className="truncate text-[11px]">{rec.explanation}</div>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectRecord(rec);
                    }}
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Eye className="size-3.5 mr-1" />
                    <span>Ver detalle</span>
                  </Button>
                  {rec.estado === "ESCALADA" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectRecord(rec);
                      }}
                      className="h-7 px-2 text-xs text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/30 ml-1"
                    >
                      Revisar
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
