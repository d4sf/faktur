/**
 * @file ApprovalCard.tsx
 * @description Tarjeta individual de factura pendiente de revisión humana.
 */

import { AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import { PendingApproval } from "@/types/invoice";

interface ApprovalCardProps {
  item: PendingApproval;
  onReview: (item: PendingApproval) => void;
}

export function ApprovalCard({ item, onReview }: ApprovalCardProps) {
  return (
    <Card className="rounded-xl border border-border/80 bg-card shadow-xs hover:border-foreground/20 transition-all flex flex-col justify-between">
      <CardContent className="p-5 space-y-4">
        {/* Cabecera de la tarjeta */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              {item.invoice_id}
            </span>
            <h4 className="font-bold text-foreground truncate text-sm">
              {item.vendor_name || "Proveedor sin nombre"}
            </h4>
          </div>
          <VerdictBadge verdict="ESCALAR" size="sm" />
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
      </CardContent>

      {/* Pie de tarjeta con botón para abrir revisión */}
      <div className="border-t border-border/60 bg-muted/10 p-3 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Clock className="size-3" />
          <span>{item.requested_at}</span>
        </span>
        <Button
          size="sm"
          onClick={() => onReview(item)}
          className="h-8 px-3.5 text-xs font-semibold shadow-xs gap-1.5"
        >
          <span>Revisar caso</span>
        </Button>
      </div>
    </Card>
  );
}
