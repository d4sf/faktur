import { useEffect, useState } from "react";
import { ArrowRight, X } from "lucide-react";

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
import { formatReasonTitle, formatTimelineDetail } from "@/lib/invoiceSubmit";
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

function getVerdictTheme(verdict: string) {
  if (verdict === "PAGAR") {
    return {
      border: "border-emerald-500/30",
      bg: "bg-emerald-500/5",
      code: "text-emerald-700 dark:text-emerald-400",
      node: "bg-emerald-600",
    };
  }
  if (verdict === "ESCALAR") {
    return {
      border: "border-amber-500/30",
      bg: "bg-amber-500/5",
      code: "text-amber-700 dark:text-amber-400",
      node: "bg-amber-500",
    };
  }
  if (verdict === "FRENAR") {
    return {
      border: "border-rose-500/30",
      bg: "bg-rose-500/5",
      code: "text-rose-700 dark:text-rose-400",
      node: "bg-rose-600",
    };
  }
  return {
    border: "border-border/80",
    bg: "bg-muted/20",
    code: "text-foreground",
    node: "bg-primary",
  };
}

export function InvoiceInspector({ record, open, onOpenChange }: InvoiceInspectorProps) {
  const [detail, setDetail] = useState<AuditDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [aiCached, setAiCached] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);

  useEffect(() => {
    setAiExplanation(null);
    setAiCached(false);
    setExplainError(null);
    if (!record || !open) {
      setDetail(null);
      setError(null);
      return;
    }
    const targetId = record.invoice_id || record.id;
    if (!targetId) return;

    setLoading(true);
    setError(null);
    fetch(`/api/invoices/${targetId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: AuditDetail) => setDetail(data))
      .catch((err) => setError(err instanceof Error ? err.message : "Error al cargar detalle"))
      .finally(() => setLoading(false));
  }, [record, open]);

  const handleExplain = async (regenerate: boolean) => {
    if (!record) return;
    const targetId = record.invoice_id || record.id;
    if (!targetId) return;
    setExplaining(true);
    setExplainError(null);
    try {
      const res = await fetch(`/api/invoices/${targetId}/explain`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ regenerate }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { explanation: string; cached: boolean };
      setAiExplanation(data.explanation);
      setAiCached(data.cached);
    } catch (err) {
      setExplainError(err instanceof Error ? err.message : "Error al generar explicación");
    } finally {
      setExplaining(false);
    }
  };

  const showExplainButton =
    record !== null && (record.verdict === "FRENAR" || record.verdict === "ESCALAR");

  const verdictTheme = record ? getVerdictTheme(record.verdict) : getVerdictTheme("");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto p-6">
        {record && (
          <div className="space-y-4">
            <SheetHeader className="p-0 pr-8">
              <SheetTitle className="text-base font-bold flex items-center justify-between gap-3">
                <span>Factura {record.invoice.invoice_number}</span>
                <VerdictBadge verdict={record.verdict} size="md" />
              </SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground">
                {record.invoice.vendor_name ?? "Proveedor desconocido"} (
                {record.invoice.vendor_tax_id ?? "—"})
              </SheetDescription>
            </SheetHeader>

            {/* Datos de la factura */}
            <div className="divide-y divide-border/60 rounded-xl border border-border/80 bg-card shadow-2xs text-xs overflow-hidden">
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-muted-foreground">Folio:</span>
                <span className="font-mono font-medium text-foreground">
                  {record.invoice.invoice_number}
                </span>
              </div>
              {record.invoice.vendor_name && (
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-muted-foreground">Proveedor:</span>
                  <span className="font-medium text-foreground text-right">
                    {record.invoice.vendor_name}
                  </span>
                </div>
              )}
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
              <div className="flex justify-between items-center px-4 py-2.5 bg-muted/30 font-bold border-t border-border/80">
                <span className="text-foreground">Total normalizado (USD):</span>
                <span className="font-mono text-sm text-foreground">
                  {formatUsd(record.amount_usd)}
                </span>
              </div>
            </div>

            {/* Decisión y Motivo coherente con el veredicto */}
            <div
              className={`rounded-xl border ${verdictTheme.border} ${verdictTheme.bg} p-3.5 space-y-1.5 text-xs shadow-2xs`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div
                    className={`text-xs font-bold ${verdictTheme.code}`}
                    title={`Código: ${record.reason_code}`}
                  >
                    {formatReasonTitle(record.reason_code)}
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider shrink-0">
                  Regla de negocio
                </span>
              </div>
              <p className="text-foreground/90 leading-relaxed">{record.explanation}</p>
              <div className="flex items-center gap-4 pt-1.5 border-t border-border/50 text-[10px] text-muted-foreground">
                <span>
                  Política: <strong className="font-semibold text-foreground">v1</strong>
                </span>
                <span>
                  Evaluado por:{" "}
                  <strong className="font-semibold text-foreground">Agente Autónomo</strong>
                </span>
              </div>
            </div>

            {/* Explicación con IA */}
            {showExplainButton && (
              <div className="space-y-2">
                <Button
                  size="sm"
                  onClick={() => handleExplain(false)}
                  disabled={explaining}
                  className="text-xs"
                >
                  {explaining ? "Generando explicación…" : "Explicar con IA"}
                </Button>
                {explainError && (
                  <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
                    {explainError}
                  </div>
                )}
                {aiExplanation && (
                  <div className="rounded-lg border border-border/80 bg-muted/20 p-3.5 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">Explicación con IA</span>
                      {aiCached && (
                        <span className="text-[10px] text-muted-foreground">cacheada</span>
                      )}
                    </div>
                    <p className="text-muted-foreground whitespace-pre-wrap">{aiExplanation}</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleExplain(true)}
                      disabled={explaining}
                      className="h-7 px-2 text-[11px]"
                    >
                      Regenerar
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Aviso de acción pendiente si está escalada */}
            {record.estado === "ESCALADA" && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 flex items-center justify-between gap-3 text-xs shadow-2xs">
                <div>
                  <h4 className="font-semibold text-amber-800 dark:text-amber-400">
                    Pendiente de aprobación
                  </h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Requiere revisión y firma humana en la bandeja de entrada.
                  </p>
                </div>
                <Button
                  size="sm"
                  asChild
                  className="h-8 px-3 text-xs font-semibold shadow-xs shrink-0 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors cursor-pointer"
                >
                  <a
                    href={`/bandeja?invoice_id=${encodeURIComponent(record.invoice_id || record.id)}`}
                    onClick={() => onOpenChange(false)}
                    className="flex items-center gap-1.5"
                  >
                    <span>Ir a revisión</span>
                    <ArrowRight className="size-3.5" />
                  </a>
                </Button>
              </div>
            )}

            {/* Línea de tiempo */}
            {loading && (
              <div className="space-y-2 pt-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-40" />
              </div>
            )}
            {error && (
              <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
                Error al cargar detalle: {error}
              </div>
            )}
            {detail && detail.timeline.length > 0 && (
              <div className="space-y-2.5 pt-1">
                <h4 className="text-xs font-bold text-foreground">Línea de tiempo</h4>
                <div className="space-y-3.5 border-l-2 border-border/70 pl-4 ml-1.5">
                  {detail.timeline.map((event, i) => {
                    const isDecision = event.type.toUpperCase() === "DECISION";
                    const nodeColor = isDecision
                      ? verdictTheme.node
                      : "bg-slate-400 dark:bg-slate-500";
                    return (
                      <div key={i} className="relative">
                        <div
                          className={`absolute -left-[23px] top-0.5 size-3 rounded-full ${nodeColor} ring-4 ring-background shadow-xs`}
                        />
                        <div className="text-[10px] text-muted-foreground">
                          {formatDate(event.at)}
                        </div>
                        <div className="text-xs font-semibold text-foreground">{event.type}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {formatTimelineDetail(event.detail)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Resolución humana */}
            {detail?.resolution && (
              <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-1 text-xs">
                <h4 className="font-bold text-foreground">Resolución humana</h4>
                <div className="text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {detail.resolution.resolved_by}
                  </span>{" "}
                  — {detail.resolution.resolved_at}
                </div>
                {detail.resolution.comment && (
                  <p className="text-muted-foreground italic">"{detail.resolution.comment}"</p>
                )}
              </div>
            )}
            {!detail?.resolution && record.human_approved !== null && (
              <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5 text-xs text-muted-foreground">
                {record.human_approved ? "Aprobada" : "Rechazada"} por revisor humano.
              </div>
            )}

            {/* Footer con botón de cerrar a todo el ancho, gris sólido y la X a la derecha */}
            <SheetFooter className="p-0 pt-4 mt-2 border-t border-border/80">
              <Button
                type="button"
                onClick={() => onOpenChange(false)}
                className="w-full h-9.5 px-4 text-xs font-semibold rounded-lg border border-zinc-300/90 bg-zinc-200/90 hover:bg-zinc-300/90 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 transition-all cursor-pointer shadow-2xs flex items-center justify-center gap-2"
              >
                <span>Cerrar</span>
                <X className="size-3.5 text-zinc-600 dark:text-zinc-400" />
              </Button>
            </SheetFooter>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
