import { UploadCloud } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { AuditFeed } from "@/components/audit/AuditFeed";

export default function Tablero() {
  return (
    <div className="space-y-8">
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
          </Link>
        </Button>
      </div>

      <AuditFeed />
    </div>
  );
}
