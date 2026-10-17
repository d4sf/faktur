/**
 * @file Bandeja.tsx
 * @description Bandeja de aprobación humana (Human-in-the-loop / HITL).
 * Permite a los revisores financieros examinar facturas con veredicto ESCALAR,
 * inspeccionar las causas de desvío y autorizar o rechazar pagos con justificación auditada.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Clock, RefreshCw, Search, ShieldAlert, X } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import { PendingApproval } from "@/types/invoice";

/**
 * Casos iniciales de demostración en caso de que la base de datos esté vacía o recién inicializada.
 */
const FALLBACK_PENDING: PendingApproval[] = [
  {
    id: "app-tc-04",
    invoice_id: "inv-tc-04",
    vendor_name: "Growth Agency",
    amount_usd: 3500,
    reason_code: "ALERT_THRESHOLD_EXCEEDED",
    explanation:
      "El importe de $3,500.00 USD supera el umbral de aprobación autónoma de $1,000.00 USD (Regla 7).",
    requested_at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  },
  {
    id: "app-tc-09",
    invoice_id: "inv-tc-09",
    vendor_name: "Estudio Creativo Alpha",
    amount_usd: 1450,
    reason_code: "ALERT_BUDGET_TIGHT",
    explanation:
      "El monto acumulado excede el presupuesto asignado a la categoría Diseño (Regla 6).",
    requested_at: "Hace 15 min",
  },
];

export default function Bandeja() {
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedApproval, setSelectedApproval] = useState<PendingApproval | null>(null);

  // Estado para la resolución en modal
  const [justification, setJustification] = useState<string>("");
  const [pendingAction, setPendingAction] = useState<"APROBAR" | "RECHAZAR" | null>(null);
  const [resolving, setResolving] = useState<boolean>(false);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  /**
   * Carga la lista de facturas pendientes desde la API real.
   */
  const fetchApprovals = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/approvals?status=pendiente");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setApprovals(data);
        } else {
          // Si el backend no tiene pendientes aún, usamos los casos de ejemplo
          setApprovals(FALLBACK_PENDING);
        }
      } else {
        setApprovals(FALLBACK_PENDING);
      }
    } catch {
      setApprovals(FALLBACK_PENDING);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovals();
  }, []);

  /**
   * Confirma la resolución y la envía al backend.
   */
  const handleConfirmResolution = async () => {
    if (!selectedApproval || !pendingAction) return;

    setResolving(true);
    const isApproved = pendingAction === "APROBAR";
    const comment =
      justification.trim() ||
      (isApproved ? "Aprobado por el revisor financiero" : "Rechazado por el revisor");

    try {
      // Si el id es real del backend, llamamos a la API
      if (!selectedApproval.id.startsWith("app-tc-")) {
        await fetch(`/api/approvals/${selectedApproval.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            approve: isApproved,
            resolved_by: "Revisor (Bandeja Web)",
            comment,
          }),
        });
      }

      // Actualizamos la lista local
      setApprovals((prev) => prev.filter((item) => item.id !== selectedApproval.id));
      setNotification({
        type: "success",
        text: `Factura de ${selectedApproval.vendor_name || "Proveedor"} ${
          isApproved ? "autorizada para pago" : "rechazada formalmente"
        }.`,
      });

      setSelectedApproval(null);
      setPendingAction(null);
      setJustification("");
    } catch (err) {
      console.error("Error al resolver aprobación:", err);
      setNotification({
        type: "error",
        text: "Hubo un error al comunicar la decisión con el servidor.",
      });
    } finally {
      setResolving(false);
      setTimeout(() => setNotification(null), 4000);
    }
  };

  // Filtrado por buscador
  const filteredApprovals = approvals.filter((item) => {
    const q = searchTerm.toLowerCase();
    return (
      (item.vendor_name?.toLowerCase().includes(q) ?? false) ||
      item.invoice_id.toLowerCase().includes(q) ||
      item.reason_code.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Encabezado de la Bandeja */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Bandeja de revisión
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
              <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span>{approvals.length} pendientes</span>
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Facturas escaladas por el motor determinista que requieren intervención y firma humana.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchApprovals}
            disabled={loading}
            className="h-9 gap-1.5 text-xs"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Actualizar</span>
          </Button>
          <Button asChild size="sm" className="h-9 text-xs font-semibold gap-1.5 shadow-xs">
            <Link to="/subir">Subir nueva factura</Link>
          </Button>
        </div>
      </div>

      {/* Banner de notificación temporal */}
      {notification && (
        <div
          className={`rounded-lg border p-3.5 text-xs font-medium flex items-center justify-between transition-all ${
            notification.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
              : "border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-300"
          }`}
        >
          <span>{notification.text}</span>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Barra de búsqueda y filtros */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por proveedor o folio..."
            className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
          />
        </div>
        <span className="text-xs text-muted-foreground hidden sm:inline">
          Mostrando {filteredApprovals.length} de {approvals.length} facturas
        </span>
      </div>

      {/* Listado de Facturas Pendientes */}
      {filteredApprovals.length === 0 ? (
        <Card className="rounded-xl border border-dashed border-border/80 bg-muted/10 p-12 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 mb-3">
            <Check className="size-6" />
          </div>
          <h4 className="text-sm font-bold text-foreground">Bandeja al día</h4>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
            No hay facturas pendientes de revisión humana en este momento. Todas las decisiones han
            sido resueltas o procesadas de forma autónoma.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filteredApprovals.map((item) => (
            <Card
              key={item.id}
              className="rounded-xl border border-border/80 bg-card shadow-xs hover:border-foreground/20 transition-all flex flex-col justify-between"
            >
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

                {/* Importe evaluado */}
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

              {/* Pie de tarjeta con botón de acción */}
              <div className="border-t border-border/60 bg-muted/10 p-3 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="size-3" />
                  <span>{item.requested_at}</span>
                </span>
                <Button
                  size="sm"
                  onClick={() => {
                    setSelectedApproval(item);
                    setJustification("");
                    setPendingAction(null);
                  }}
                  className="h-7 px-3 text-xs font-semibold shadow-xs"
                >
                  <span>Revisar caso</span>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal de Revisión y Decisión con Doble Confirmación */}
      <Dialog
        open={Boolean(selectedApproval)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedApproval(null);
            setPendingAction(null);
            setJustification("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md rounded-xl border border-border p-6 shadow-xl">
          {selectedApproval && (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle className="text-base font-bold flex items-center justify-between pr-8">
                  <span>Revisión de Factura</span>
                  <VerdictBadge verdict="ESCALAR" size="md" />
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  {selectedApproval.vendor_name} ({selectedApproval.invoice_id})
                </DialogDescription>
              </DialogHeader>

              {/* Ficha rápida del caso */}
              <div className="rounded-lg border border-border/70 bg-muted/20 p-3.5 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Monto evaluado:</span>
                  <span className="font-mono font-bold text-foreground">
                    $
                    {selectedApproval.amount_usd.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}{" "}
                    USD
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Código de alerta:</span>
                  <span className="font-mono text-amber-600 dark:text-amber-400 font-semibold">
                    {selectedApproval.reason_code}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground pt-1 border-t border-border/40 leading-relaxed">
                  {selectedApproval.explanation}
                </p>
              </div>

              {/* Caja de Justificación */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">
                  Justificación de auditoría (opcional):
                </label>
                <input
                  type="text"
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Motivo de la resolución (ej. Autorización extraordinaria)..."
                  className="w-full rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Diálogo preventivo de Doble Confirmación */}
              {pendingAction ? (
                <div className="rounded-md border border-border bg-muted/60 p-3 space-y-2 animate-in fade-in">
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <ShieldAlert
                      className={`size-4 ${
                        pendingAction === "APROBAR" ? "text-amber-500" : "text-rose-500"
                      }`}
                    />
                    <span>
                      {pendingAction === "APROBAR"
                        ? `¿Confirmas autorizar el desembolso de $${selectedApproval.amount_usd.toLocaleString("en-US", { minimumFractionDigits: 2 })} USD?`
                        : `¿Confirmas rechazar formalmente esta factura?`}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Esta decisión quedará asentada con tu firma en el registro inmutable de
                    auditoría.
                  </p>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setPendingAction(null)}
                      className="h-7 text-xs"
                      disabled={resolving}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleConfirmResolution}
                      disabled={resolving}
                      className={`h-7 text-xs text-white ${
                        pendingAction === "APROBAR"
                          ? "bg-emerald-600 hover:bg-emerald-700"
                          : "bg-rose-600 hover:bg-rose-700"
                      }`}
                    >
                      {resolving
                        ? "Guardando..."
                        : pendingAction === "APROBAR"
                          ? "Sí, autorizar pago"
                          : "Sí, rechazar"}
                    </Button>
                  </div>
                </div>
              ) : (
                /* Botones de acción principal */
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setPendingAction("APROBAR")}
                    className="flex-1 h-8 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-xs"
                  >
                    <Check className="size-3.5" />
                    <span>Aprobar pago</span>
                  </Button>

                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => setPendingAction("RECHAZAR")}
                    className="flex-1 h-8 text-xs font-semibold gap-1.5 shadow-xs"
                  >
                    <X className="size-3.5" />
                    <span>Rechazar factura</span>
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
