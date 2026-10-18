import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InvoiceData } from "@/types/invoice";

interface NextStepCardProps {
  /**
   * Factura evaluada con su veredicto y estado de resolución.
   */
  invoice: InvoiceData;
  /**
   * Callback para reiniciar la carga de otra factura.
   */
  onReset: () => void;
}

/**
 * Componente que orienta al usuario con claridad sobre qué sucede a continuación,
 * usando terminología clara y sin tecnicismos bancarios complejos.
 */
export function NextStepCard({ invoice, onReset }: NextStepCardProps) {
  const isPagar = invoice.verdict === "PAGAR";
  const isFrenar = invoice.verdict === "FRENAR";
  const isEscalar = invoice.verdict === "ESCALAR";
  const isResolved = Boolean(invoice.resolved_status);

  return (
    <div className="rounded-lg border border-border/70 bg-muted/30 p-4 space-y-2.5">
      <div className="flex items-center gap-2">
        {isPagar && (
          <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
        )}
        {isFrenar && <XCircle className="size-4 text-rose-600 dark:text-rose-400 shrink-0" />}
        {isEscalar && (
          <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
        )}
        <span className="text-xs font-bold text-foreground">
          {isPagar && "Próximo paso: Factura autorizada para pago automático"}
          {isFrenar && "Próximo paso: Factura bloqueada por políticas"}
          {isEscalar &&
            (isResolved
              ? "Próximo paso: Caso cerrado por el revisor"
              : "Próximo paso: Revisión y decisión humana")}
        </span>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        {isPagar &&
          "La factura superó con éxito todas las políticas de control y fue programada para transferencia bancaria automática al proveedor, sin requerir autorización manual."}
        {isFrenar &&
          "El pago ha sido cancelado automáticamente por violar una regla crítica de auditoría. Se recomienda notificar al proveedor para rectificar el documento o regularizar su situación."}
        {isEscalar &&
          !isResolved &&
          "Se requiere autorización humana debido a una excepción en las políticas. Revisa el análisis y la explicación con IA a continuación para aprobar o rechazar."}
        {isEscalar &&
          isResolved &&
          `Resolución manual completada (${
            invoice.resolved_status === "APROBADO_HUMANO" ? "Aprobada" : "Rechazada"
          }). El veredicto final ha quedado asentado en la pista de auditoría inmutable.`}
      </p>

      {/* Botones de acción posterior al flujo */}
      {(isPagar || isFrenar || isResolved) && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" onClick={onReset} className="h-7 text-xs font-medium">
            Subir otra factura
          </Button>
          <Button asChild variant="outline" size="sm" className="h-7 text-xs font-medium">
            <Link to="/">Ir al tablero</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
