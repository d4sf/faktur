/**
 * @file Bandeja.tsx
 * @description Bandeja de aprobación humana (Human-in-the-loop / HITL).
 * Orquestador principal que gestiona la lista de facturas pendientes con sincronización en tiempo real
 * y la navegación hacia la vista de revisión detallada.
 */

import { Check, RefreshCw, Search, X } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ApprovalCard } from "@/components/bandeja/ApprovalCard";
import { ApprovalReviewView } from "@/components/bandeja/ApprovalReviewView";
import { useApprovalQueue } from "@/hooks/useApprovalQueue";
import type { SystemRule } from "@/types/invoice";

const SYSTEM_RULES: SystemRule[] = [
  { id: 1, label: "Regla 1", name: "Datos válidos y confianza" },
  { id: 2, label: "Regla 2", name: "Duplicados" },
  { id: 3, label: "Regla 3", name: "Lista de exclusión" },
  { id: 4, label: "Regla 4", name: "Proveedor conocido" },
  { id: 5, label: "Regla 5", name: "Deriva de importe" },
  { id: 6, label: "Regla 6", name: "Presupuesto disponible" },
  { id: 7, label: "Regla 7", name: "Umbral de aprobación" },
  { id: 8, label: "Regla 8", name: "Pase directo (STP)" },
];

export default function Bandeja() {
  const {
    approvals,
    filteredApprovals,
    loading,
    searchTerm,
    setSearchTerm,
    selectedApproval,
    setSelectedApproval,
    selectedInvoice,
    justUpdated,
    notification,
    setNotification,
    handleManualRefresh,
    handleOpenReview,
    handleResolveHuman,
  } = useApprovalQueue();

  return (
    <div className="space-y-6">
      {selectedInvoice && selectedApproval ? (
        <ApprovalReviewView
          invoice={selectedInvoice}
          rules={SYSTEM_RULES}
          notification={notification}
          onCloseNotification={() => setNotification(null)}
          onBack={() => {
            setSelectedApproval(null);
            window.history.replaceState({}, "", "/bandeja");
          }}
          onResolve={handleResolveHuman}
        />
      ) : (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Encabezado */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-border pb-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  Bandeja de revisión
                </h2>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 dark:bg-amber-600 text-white px-2.5 py-0.5 text-xs font-bold shadow-xs select-none whitespace-nowrap shrink-0">
                  <span className="size-1.5 rounded-full bg-white animate-pulse shrink-0" />
                  <span>{approvals.length}</span>
                  <span>pendientes</span>
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Facturas escaladas por el motor determinista que requieren intervención y firma
                humana.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span>Sincronización en tiempo real</span>
              </div>

              <Button
                variant={justUpdated ? "default" : "outline"}
                size="sm"
                onClick={handleManualRefresh}
                disabled={loading}
                className={`h-9 gap-1.5 text-xs rounded-xl shrink-0 transition-all ${
                  justUpdated
                    ? "border-transparent bg-[#185338] text-white hover:bg-[#185338] shadow-xs"
                    : ""
                }`}
              >
                {justUpdated ? (
                  <>
                    <Check className="size-3.5 text-white stroke-[2.5] animate-in zoom-in-75 duration-200" />
                    <span className="font-semibold text-white">Actualizado</span>
                  </>
                ) : loading ? (
                  <>
                    <RefreshCw className="size-3.5 animate-spin text-[#185338]" />
                    <span>Comprobando...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="size-3.5" />
                    <span>Actualizar</span>
                  </>
                )}
              </Button>
              <Button
                asChild
                size="sm"
                className="h-9 text-xs font-semibold gap-1.5 shadow-xs bg-[#185338] hover:bg-[#185338]/90 text-white rounded-xl shrink-0 cursor-pointer"
              >
                <Link to="/subir">Subir factura</Link>
              </Button>
            </div>
          </div>

          {/* Notificación temporal */}
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
                className="text-muted-foreground hover:text-foreground cursor-pointer"
                aria-label="Cerrar notificación"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}

          {/* Búsqueda */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por proveedor o folio..."
                className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
                aria-label="Buscar facturas por proveedor o folio"
              />
            </div>
            <span className="text-xs text-muted-foreground">
              Mostrando {filteredApprovals.length} de {approvals.length} facturas
            </span>
          </div>

          {/* Listado */}
          {filteredApprovals.length === 0 ? (
            <Card className="rounded-xl border border-dashed border-border/80 bg-muted/10 p-12 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 mb-3">
                <Check className="size-6" />
              </div>
              <h4 className="text-sm font-bold text-foreground">Bandeja al día</h4>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                No hay facturas pendientes de revisión humana en este momento. Todas las decisiones
                han sido resueltas o procesadas de forma autónoma.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {filteredApprovals.map((item) => (
                <ApprovalCard key={item.id} item={item} onReview={handleOpenReview} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
