import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import type { AuditDetail, AuditRecordView } from "@/types/audit";

interface InvoiceInspectorProps {
  record: AuditRecordView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

function formatDate(s: string): string {
  try {
    return new Date(s).toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

export function InvoiceInspector({ record, open, onOpenChange }: InvoiceInspectorProps) {
  const [detail, setDetail] = useState<AuditDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!record || !open) {
      setDetail(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/invoices/${record.invoice_id}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: AuditDetail) => setDetail(data))
      .catch((err) => setError(err instanceof Error ? err.message : "Error al cargar detalle"))
      .finally(() => setLoading(false));
  }, [record, open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto p-6">
        {record && (
          <div className="space-y-4">
            <SheetHeader className="p-0">
              <SheetTitle className="text-base font-bold flex items-center justify-between pr-8">
                <span>Factura {record.invoice.invoice_number}</span>
                <VerdictBadge verdict={record.verdict} size="md" />
              </SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground">
                {record.invoice.vendor_name ?? "Proveedor desconocido"} (
                {record.invoice.vendor_tax_id ?? "—"})
              </SheetDescription>
            </SheetHeader>

            {/* Datos de la factura */}
            <div className="divide-y divide-border/60 rounded-lg border border-border text-xs">
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-muted-foreground">Concepto:</span>
                <span className="font-medium text-foreground">{record.invoice.invoice_number}</span>
              </div>
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-muted-foreground">Fecha de emisión:</span>
                <span className="text-foreground">{record.invoice.issue_date ?? "—"}</span>
              </div>
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-muted-foreground">Fecha de vencimiento:</span>
                <span className="text-foreground">{record.invoice.due_date ?? "—"}</span>
              </div>
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-muted-foreground">Moneda:</span>
                <span className="text-foreground">{record.invoice.currency}</span>
              </div>
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-muted-foreground">Monto original:</span>
                <span className="text-foreground">
                  {record.invoice.total_amount.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  })}{" "}
                  {record.invoice.currency}
                </span>
              </div>
              <div className="flex justify-between px-4 py-2.5 bg-muted/20 font-bold">
                <span>Total normalizado (USD):</span>
                <span className="font-mono text-sm text-foreground">
                  {formatUsd(record.amount_usd)}
                </span>
              </div>
            </div>

            {/* Decisión */}
            <div className="rounded-lg border border-border/80 bg-muted/20 p-3.5 space-y-1 text-xs">
              <span className="font-mono font-semibold text-primary">{record.reason_code}</span>
              <p className="text-muted-foreground">{record.explanation}</p>
              <div className="flex items-center gap-4 pt-1 text-[10px] text-muted-foreground">
                <span>Política: {record.id ? "v1" : "—"}</span>
                <span>Por: {record.id ? "AGENTE" : "—"}</span>
              </div>
            </div>

            {/* Línea de tiempo */}
            {loading && (
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-40" />
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
                Error al cargar detalle: {error}
              </div>
            )}
            {detail && detail.timeline.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-foreground">Línea de tiempo</h4>
                <div className="space-y-3 border-l-2 border-border/60 pl-4">
                  {detail.timeline.map((event, i) => (
                    <div key={i} className="relative">
                      <div className="absolute -left-[21px] top-0.5 size-3 rounded-full bg-primary" />
                      <div className="text-[10px] text-muted-foreground">
                        {formatDate(event.at)}
                      </div>
                      <div className="text-xs font-medium text-foreground">{event.type}</div>
                      <div className="text-[11px] text-muted-foreground">{event.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Resolución humana */}
            {detail?.resolution && (
              <div className="rounded-lg border border-border/80 bg-muted/20 p-3.5 space-y-1 text-xs">
                <h4 className="font-bold text-foreground">Resolución humana</h4>
                <div className="text-muted-foreground">
                  <span className="font-medium">{detail.resolution.resolved_by}</span> —{" "}
                  {detail.resolution.resolved_at}
                </div>
                {detail.resolution.comment && (
                  <p className="text-muted-foreground italic">"{detail.resolution.comment}"</p>
                )}
              </div>
            )}
            {!detail?.resolution && record.human_approved !== null && (
              <div className="rounded-lg border border-border/80 bg-muted/20 p-3.5 text-xs text-muted-foreground">
                {record.human_approved ? "Aprobada" : "Rechazada"} por revisor humano.
              </div>
            )}

            <SheetFooter className="p-0 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="text-xs"
              >
                Cerrar
              </Button>
            </SheetFooter>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
