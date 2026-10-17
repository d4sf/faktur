/**
 * @file Tablero.tsx
 * @description Tablero de control financiero principal (Dashboard ejecutivo).
 * Muestra las métricas clave de dispersión (KPIs de monto pagado, frenado, tasa autónoma STP),
 * acceso rápido para cargar nuevas facturas y la tabla histórica de auditoría con modal de inspección.
 */

import { useState } from "react";
import { ArrowRight, Eye, FileText, Sparkles, UploadCloud } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VerdictBadge } from "@/components/ui/VerdictBadge";

/**
 * Estructura de datos de una factura en el historial del tablero.
 */
interface InvoiceData {
  id: string;
  invoice_number: string;
  vendor_name: string;
  vendor_tax_id: string;
  issue_date: string;
  due_date: string;
  currency: string;
  total_amount: number;
  total_usd: number;
  concept: string;
  verdict: "PAGAR" | "FRENAR" | "ESCALAR";
  reason_code: string;
  reason_description: string;
}

const RECENT_INVOICES: InvoiceData[] = [
  {
    id: "TC-01",
    invoice_number: "INV-AWS-8821",
    vendor_name: "Amazon Web Services",
    vendor_tax_id: "AWS-CLOUD-01",
    issue_date: "2026-10-01",
    due_date: "2026-10-31",
    currency: "USD",
    total_amount: 450,
    total_usd: 450,
    concept: "Cloud compute and hosting Q4",
    verdict: "PAGAR",
    reason_code: "SUCCESS_TOUCHLESS_STP",
    reason_description: "Cumple todas las políticas: pago directo al proveedor.",
  },
  {
    id: "TC-04",
    invoice_number: "INV-GA-3500",
    vendor_name: "Growth Agency",
    vendor_tax_id: "GROWTH-AGENCY",
    issue_date: "2026-10-03",
    due_date: "2026-10-25",
    currency: "USD",
    total_amount: 3500,
    total_usd: 3500,
    concept: "Marketing campaign Q4",
    verdict: "ESCALAR",
    reason_code: "ALERT_THRESHOLD_EXCEEDED",
    reason_description: "Supera el umbral autónomo de $1,000 USD: requiere firma humana.",
  },
  {
    id: "TC-05",
    invoice_number: "INV-NEW-9102",
    vendor_name: "Vertex Analytics",
    vendor_tax_id: "VERTEX-NEW-09",
    issue_date: "2026-10-05",
    due_date: "2026-10-20",
    currency: "USD",
    total_amount: 820,
    total_usd: 820,
    concept: "Data consulting services",
    verdict: "ESCALAR",
    reason_code: "ALERT_NEW_VENDOR",
    reason_description: "Proveedor no listado en directorio: requiere validación.",
  },
  {
    id: "TC-11",
    invoice_number: "INV-BLK-9912",
    vendor_name: "Blacklisted Services Ltd",
    vendor_tax_id: "BLK-CORP-99",
    issue_date: "2026-10-08",
    due_date: "2026-10-15",
    currency: "USD",
    total_amount: 1200,
    total_usd: 1200,
    concept: "Third party vendor integration",
    verdict: "FRENAR",
    reason_code: "ERR_BLACKLISTED_VENDOR",
    reason_description: "Beneficiario en lista bloqueada por auditoría.",
  },
];

export default function Tablero() {
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceData | null>(null);

  return (
    <div className="space-y-8">
      {/* 1. Encabezado y botón atajo a Subir factura */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Tablero de control
          </h2>
          <p className="text-sm text-muted-foreground">
            Monitoreo en tiempo real de facturas, presupuestos y decisiones de pago.
          </p>
        </div>

        <Button asChild className="gap-2 shadow-xs shrink-0">
          <Link to="/subir">
            <UploadCloud className="size-4" />
            <span>Subir factura</span>
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>

      {/* 2. Las 4 tarjetas de KPIs bancarias */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 md:gap-5">
        <Card className="rounded-xl border border-border/70 shadow-xs hover:shadow-md transition-all">
          <CardHeader className="pb-1.5">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Tasa de aprobación automática
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              <span>75</span>
              <span className="text-base font-normal text-muted-foreground/80 sm:text-lg">.0%</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Facturas aprobadas sin intervención manual
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-border/70 shadow-xs hover:shadow-md transition-all">
          <CardHeader className="pb-1.5">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Presupuesto restante
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              <span>$4,550</span>
              <span className="text-base font-normal text-muted-foreground/80 sm:text-lg">.00</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Balance mensual disponible en USD</p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-border/70 shadow-xs hover:shadow-md transition-all">
          <CardHeader className="pb-1.5">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Total procesadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {RECENT_INVOICES.length}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Facturas evaluadas en el ciclo actual
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-border/70 shadow-xs hover:shadow-md transition-all">
          <CardHeader className="pb-1.5">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Pendientes en bandeja
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                2
              </span>
              <span className="inline-flex size-2 rounded-full bg-amber-500 animate-pulse" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Facturas escaladas a revisión humana
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 4. Tabla de facturas recientes */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold tracking-tight text-foreground">
            Facturas procesadas recientemente
          </h3>
          <span className="text-xs text-muted-foreground">
            {RECENT_INVOICES.length} registradas
          </span>
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
                {RECENT_INVOICES.map((inv) => (
                  <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-foreground">
                      {inv.invoice_number}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{inv.vendor_name}</div>
                      <div className="text-[10px] text-muted-foreground">{inv.vendor_tax_id}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{inv.issue_date}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">
                      ${inv.total_usd.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      <VerdictBadge verdict={inv.verdict} size="sm" />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">
                      <div className="truncate text-[11px]">{inv.reason_description}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedInvoice(inv)}
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Eye className="size-3.5 mr-1" />
                        <span>Detalle</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal de Detalle */}
      <Dialog open={!!selectedInvoice} onOpenChange={(open) => !open && setSelectedInvoice(null)}>
        <DialogContent className="sm:max-w-xl rounded-xl border border-border p-6 shadow-xl">
          {selectedInvoice && (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle className="text-base font-bold flex items-center justify-between pr-8">
                  <span>Factura {selectedInvoice.invoice_number}</span>
                  <VerdictBadge verdict={selectedInvoice.verdict} size="md" />
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  {selectedInvoice.vendor_name} ({selectedInvoice.vendor_tax_id})
                </DialogDescription>
              </DialogHeader>

              <div className="divide-y divide-border/60 rounded-lg border border-border text-xs">
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-muted-foreground">Concepto:</span>
                  <span className="font-medium text-foreground">{selectedInvoice.concept}</span>
                </div>
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-muted-foreground">Fecha de emisión:</span>
                  <span className="text-foreground">{selectedInvoice.issue_date}</span>
                </div>
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-muted-foreground">Fecha de vencimiento:</span>
                  <span className="text-foreground">{selectedInvoice.due_date}</span>
                </div>
                <div className="flex justify-between px-4 py-2.5 bg-muted/20 font-bold">
                  <span>Total normalizado (USD):</span>
                  <span className="font-mono text-sm text-foreground">
                    $
                    {selectedInvoice.total_usd.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-border/80 bg-muted/20 p-3.5 space-y-1 text-xs">
                <span className="font-mono font-semibold text-primary">
                  {selectedInvoice.reason_code}
                </span>
                <p className="text-muted-foreground">{selectedInvoice.reason_description}</p>
              </div>

              <DialogFooter className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedInvoice(null)}
                  className="text-xs"
                >
                  Cerrar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
