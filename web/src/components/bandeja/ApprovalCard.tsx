/**
 * @file ApprovalCard.tsx
 * @description Tarjeta individual de factura pendiente de revisión humana.
 * Diseñada con espaciado simétrico exacto y etiqueta de estado de tipo píldora informativa.
 */

import { AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import { PendingApproval } from "@/types/invoice";

interface ApprovalCardProps {
  item: PendingApproval;
  onReview: (item: PendingApproval) => void;
}

export function ApprovalCard({ item, onReview }: ApprovalCardProps) {
  return (
    <div className="rounded-xl border border-border/80 bg-card shadow-xs hover:border-foreground/20 transition-all flex flex-col justify-between overflow-hidden">
      {/* Cuerpo principal de la tarjeta */}
      <div className="p-5 space-y-4 flex-1">
        {/* Cabecera con folio, proveedor y etiqueta de estado (no botón) */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              {item.invoice_id}
            </span>
            <h4 className="font-bold text-foreground truncate text-sm">
              {item.vendor_name || "Proveedor sin nombre"}
            </h4>
          </div>
          <VerdictBadge verdict="ESCALAR" size="sm" variant="pill" />
        </div>

        {/* Importe a autorizar */}
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3 flex items-center justify-between text-xs">
          <span className="text-muted-foreground font-medium">Importe a autorizar:</span>
          <span className="font-mono text-sm font-bold text-foreground">
            ${item.amount_usd.toLocaleString("en-US", { minimumFractionDigits: 2 })} USD
          </span>
        </div>

        {/* Razón de escalación */}
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-semibold text-[11px]">
            <AlertTriangle className="size-3.5 shrink-0" />
            <span>{item.reason_code}</span>
          </div>
          <p className="text-muted-foreground text-[11px] leading-relaxed line-clamp-2">
            {item.explanation}
          </p>
        </div>
      </div>

      {/* Pie de tarjeta: misma distancia arriba y abajo (py-3 simétrico) */}
      <div className="border-t border-border/60 bg-muted/10 px-5 py-3 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground flex items-center gap-1.5">
          <Clock className="size-3" />
          <span>{item.requested_at}</span>
        </span>
        <Button
          size="sm"
          onClick={() => onReview(item)}
          className="h-8 px-4 text-xs font-semibold shadow-xs"
        >
          <span>Revisar caso</span>
        </Button>
      </div>
    </div>
  );
}
