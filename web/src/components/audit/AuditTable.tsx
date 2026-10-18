import { useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import { formatReasonTitle } from "@/lib/invoiceSubmit";
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
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const totalRecords = records.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const validPage = Math.min(currentPage, totalPages);
  const startIndex = (validPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalRecords);
  const currentRecords = records.slice(startIndex, endIndex);
  if (loading) {
    return (
      <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-xs">
        <div className="overflow-x-auto pb-1 [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-muted/30 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/50 [&::-webkit-scrollbar-thumb]:rounded-full">
          <table className="w-full text-left text-xs min-w-[780px]">
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
        <a href="/subir" className="mt-2 text-xs text-primary hover:underline">
          Subir factura
        </a>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-xs">
      <div className="overflow-x-auto pb-1 [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-muted/30 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/50 [&::-webkit-scrollbar-thumb]:rounded-full">
        <table className="w-full text-left text-xs min-w-[780px]">
          <thead className="border-b border-border bg-muted/30 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px] whitespace-nowrap">
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
              <th className="px-4 py-3 text-right font-semibold uppercase tracking-wider text-[10px] whitespace-nowrap">
                Acción
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {currentRecords.map((rec) => (
              <tr
                key={rec.id}
                className="hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => onSelectRecord(rec)}
              >
                <td className="px-4 py-3 font-mono font-medium text-foreground whitespace-nowrap">
                  {rec.invoice.invoice_number}
                </td>
                <td className="px-4 py-3 max-w-[200px]">
                  <div
                    className="font-medium text-foreground truncate"
                    title={rec.invoice.vendor_name ?? "—"}
                  >
                    {rec.invoice.vendor_name ?? "—"}
                  </div>
                  {rec.invoice.vendor_tax_id && (
                    <div
                      className="text-[10px] text-muted-foreground font-mono truncate"
                      title={rec.invoice.vendor_tax_id}
                    >
                      ID: {rec.invoice.vendor_tax_id}
                    </div>
                  )}
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
                  <div
                    className="truncate text-xs font-semibold text-foreground"
                    title={`Código: ${rec.reason_code}`}
                  >
                    {formatReasonTitle(rec.reason_code)}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground mt-0.5">
                    {rec.explanation}
                  </div>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
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
                      size="sm"
                      asChild
                      className="h-7 px-3 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white ml-1.5 rounded-lg shadow-xs cursor-pointer transition-colors"
                    >
                      <a
                        href={`/bandeja?invoice_id=${encodeURIComponent(rec.invoice_id || rec.id)}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        Revisar
                      </a>
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Barra de paginación */}
      {totalRecords > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border/80 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          {/* Selector de filas por página y rango actual */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium">Mostrar:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="h-7 rounded-lg border border-border bg-background px-2 text-xs font-semibold text-foreground shadow-xs focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <span className="hidden sm:inline-block text-border">|</span>

            <span>
              Mostrando <strong className="font-semibold text-foreground">{startIndex + 1}</strong>{" "}
              a <strong className="font-semibold text-foreground">{endIndex}</strong> de{" "}
              <strong className="font-semibold text-foreground">{totalRecords}</strong> facturas
            </span>
          </div>

          {/* Navegación de páginas */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium mr-1">
              Página <strong className="text-foreground">{validPage}</strong> de{" "}
              <strong className="text-foreground">{totalPages}</strong>
            </span>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(1)}
                disabled={validPage === 1}
                className="size-7 rounded-lg shadow-xs disabled:opacity-40"
                title="Primera página"
              >
                <ChevronsLeft className="size-3.5" />
                <span className="sr-only">Primera página</span>
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={validPage === 1}
                className="size-7 rounded-lg shadow-xs disabled:opacity-40"
                title="Página anterior"
              >
                <ChevronLeft className="size-3.5" />
                <span className="sr-only">Página anterior</span>
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={validPage === totalPages}
                className="size-7 rounded-lg shadow-xs disabled:opacity-40"
                title="Página siguiente"
              >
                <ChevronRight className="size-3.5" />
                <span className="sr-only">Página siguiente</span>
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(totalPages)}
                disabled={validPage === totalPages}
                className="size-7 rounded-lg shadow-xs disabled:opacity-40"
                title="Última página"
              >
                <ChevronsRight className="size-3.5" />
                <span className="sr-only">Última página</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
