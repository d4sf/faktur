import { FileText, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MoneyDisplay } from "@/components/ui/money-display";
import { FlowState, InvoiceData } from "@/types/invoice";

interface InvoiceDetailCardProps {
  /**
   * Datos de la factura actualmente seleccionada.
   */
  invoice: InvoiceData;
  /**
   * Estado actual del flujo de procesamiento.
   */
  flowState: FlowState;
  /**
   * Mensaje descriptivo de la etapa actual de procesamiento.
   */
  processingMessage: string;
  /**
   * Porcentaje numérico (0-100) del avance del análisis.
   */
  processingProgress: number;
  /**
   * Callback para reiniciar y cargar una nueva factura.
   */
  onReset: () => void;
}

/**
 * Componente que muestra la vista previa del archivo, el progreso en vivo y la ficha de datos extraídos.
 */
export function InvoiceDetailCard({
  invoice,
  flowState,
  processingMessage,
  processingProgress,
  onReset,
}: InvoiceDetailCardProps) {
  return (
    <div className="space-y-5 lg:col-span-7">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <h3 className="text-lg font-bold tracking-tight text-foreground">
            {flowState === "PROCESSING" ? "Verificando factura..." : "Ficha de la factura"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {invoice.fileName} · {invoice.fileSize}
          </p>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="size-3.5" />
          <span>Cambiar factura</span>
        </Button>
      </div>

      <Card className="rounded-xl border border-border/80 shadow-xs">
        <CardContent className="p-6 space-y-6">
          {/* Fila resumen del archivo cargado */}
          <div className="flex items-center gap-4 rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground shadow-xs">
              <FileText className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{invoice.fileName}</p>
              <p className="text-xs text-muted-foreground">
                {invoice.vendor_name} · {invoice.invoice_number}
              </p>
            </div>
            <div className="text-right">
              <span className="text-sm font-bold text-foreground">
                ${invoice.total_usd.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
              <span className="text-xs text-muted-foreground ml-1">USD</span>
            </div>
          </div>

          {/* Barra de progreso interactiva durante el procesamiento */}
          {flowState === "PROCESSING" && (
            <div className="space-y-3 rounded-xl border border-border/80 bg-muted/30 p-5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">{processingMessage}</span>
                <span className="font-mono text-muted-foreground">{processingProgress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-300 ease-out"
                  style={{ width: `${processingProgress}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Extracción tipada mediante IA multimodal y verificación contra reglas deterministas.
              </p>
            </div>
          )}

          {/* Ficha estructurada con los datos normalizados */}
          {flowState === "COMPLETED" && (
            <div className="space-y-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Datos extraídos de la factura
              </span>

              <div className="divide-y divide-border/60 rounded-xl border border-border/80 text-xs">
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-muted-foreground">Folio fiscal:</span>
                  <span className="font-mono font-medium text-foreground">
                    {invoice.invoice_number}
                  </span>
                </div>
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-muted-foreground">Proveedor:</span>
                  <span className="font-medium text-foreground">
                    {invoice.vendor_name} ({invoice.vendor_tax_id})
                  </span>
                </div>
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-muted-foreground">Fecha de emisión:</span>
                  <span className="text-foreground">{invoice.issue_date}</span>
                </div>
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-muted-foreground">Fecha de vencimiento:</span>
                  <span className="text-foreground">{invoice.due_date}</span>
                </div>
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-muted-foreground">Concepto:</span>
                  <span className="text-foreground">{invoice.concept}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-2.5 bg-muted/20 font-semibold">
                  <span>Total normalizado (USD):</span>
                  <MoneyDisplay
                    amount={invoice.total_usd}
                    currency="USD"
                    originalAmount={invoice.total_amount}
                    originalCurrency={invoice.currency}
                    size="sm"
                  />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
