/**
 * @file InvoiceFilePreview.tsx
 * @description Vista previa del archivo recién soltado en el dropzone, con el estado
 * "Analizando documento…" y la barra de progreso mientras el agente lo procesa.
 */

import { Clock, FileJson, FileText, ImageIcon, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { FlowState } from "@/types/invoice";

interface InvoiceFilePreviewProps {
  /**
   * Archivo seleccionado por el usuario.
   */
  file: File;
  /**
   * URL de objeto para previsualizar imágenes (null si no aplica).
   */
  previewUrl?: string | null;
  /**
   * Estado actual del flujo: solo se usa PROCESSING en esta tarjeta.
   */
  flowState: FlowState;
  /**
   * Mensaje de la etapa actual del análisis.
   */
  processingMessage: string;
  /**
   * Porcentaje (0-100) del avance del análisis.
   */
  processingProgress: number;
  /**
   * Segundos transcurridos desde que inició la subida.
   */
  elapsedSeconds?: number;
  /**
   * Indica si el análisis está demorando más de lo previsto.
   */
  isDelayed?: boolean;
  /**
   * Acción opcional para cancelar el análisis en curso.
   */
  onCancel?: () => void;
}

/**
 * Determina el ícono y la etiqueta legible según el tipo de archivo.
 */
function describeFile(file: File): { label: string; Icon: typeof FileText } {
  if (file.type === "application/json" || file.name.toLowerCase().endsWith(".json")) {
    return { label: "JSON", Icon: FileJson };
  }
  if (file.type.startsWith("image/")) return { label: "Imagen", Icon: ImageIcon };
  return { label: "PDF", Icon: FileText };
}

/**
 * Formatea el tamaño del archivo en KB o MB.
 */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Tarjeta de preview del documento con su estado de análisis.
 */
export function InvoiceFilePreview({
  file,
  previewUrl,
  flowState,
  processingMessage,
  processingProgress,
  elapsedSeconds = 0,
  isDelayed = false,
  onCancel,
}: InvoiceFilePreviewProps) {
  const { label, Icon } = describeFile(file);
  const isImage = file.type.startsWith("image/");
  const showDelayedWarning = flowState === "PROCESSING" && (isDelayed || elapsedSeconds >= 10);

  return (
    <div className="space-y-5 lg:col-span-7">
      <div className="border-b border-border pb-3">
        <h3 className="text-lg font-bold tracking-tight text-foreground">
          {flowState === "PROCESSING" ? "Analizando documento…" : "Documento analizado"}
        </h3>
        <p className="text-xs text-muted-foreground">
          {file.name} · {formatFileSize(file.size)}
        </p>
      </div>

      <Card className="rounded-xl border border-border/80 shadow-xs">
        <CardContent className="space-y-6 p-6">
          <div className="flex items-center gap-4 rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background text-foreground shadow-xs">
              {previewUrl && isImage ? (
                <img
                  src={previewUrl}
                  alt={`Vista previa de ${file.name}`}
                  className="size-full object-cover"
                />
              ) : (
                <Icon className="size-6" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {label} · {formatFileSize(file.size)}
              </p>
            </div>
            {flowState === "PROCESSING" ? (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 border border-primary/20 px-2.5 py-1 text-[11px] font-semibold tracking-wider text-primary">
                <Loader2 className="size-3 animate-spin shrink-0" />
                <span>
                  En análisis
                  {elapsedSeconds > 0 ? ` (${elapsedSeconds}s)` : ""}
                </span>
              </span>
            ) : (
              <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Listo
              </span>
            )}
          </div>

          {flowState === "PROCESSING" && (
            <div className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-5 transition-all">
              <div className="flex items-center justify-between text-xs">
                <span
                  className="font-semibold text-foreground flex items-center gap-2"
                  role="status"
                >
                  <span className="relative flex size-2.5 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500"></span>
                  </span>
                  <span className="transition-all duration-300">{processingMessage}</span>
                </span>
                <span className="font-mono text-xs font-bold text-primary">
                  {processingProgress}%
                </span>
              </div>

              <div
                className="h-2.5 w-full overflow-hidden rounded-full bg-muted/80 relative"
                role="progressbar"
                aria-valuenow={processingProgress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Progreso del análisis"
              >
                <div
                  className="h-full bg-primary transition-all duration-500 ease-out relative overflow-hidden"
                  style={{ width: `${processingProgress}%` }}
                >
                  <div className="absolute inset-0 bg-white/25 animate-pulse" />
                </div>
              </div>

              {/* Hitos visuales del proceso */}
              <div className="grid grid-cols-4 gap-2 pt-1 border-t border-border/40 text-[10px]">
                <div
                  className={cn(
                    "flex items-center gap-1.5 transition-colors",
                    processingProgress >= 20
                      ? "text-primary font-semibold"
                      : "text-muted-foreground",
                  )}
                >
                  <div
                    className={cn(
                      "size-1.5 rounded-full",
                      processingProgress >= 20 ? "bg-primary" : "bg-muted-foreground/40",
                    )}
                  />
                  <span>1. Ingesta</span>
                </div>
                <div
                  className={cn(
                    "flex items-center gap-1.5 transition-colors",
                    processingProgress >= 45
                      ? "text-primary font-semibold"
                      : "text-muted-foreground",
                  )}
                >
                  <div
                    className={cn(
                      "size-1.5 rounded-full",
                      processingProgress >= 45
                        ? "bg-primary animate-pulse"
                        : "bg-muted-foreground/40",
                    )}
                  />
                  <span>2. Parseo IA</span>
                </div>
                <div
                  className={cn(
                    "flex items-center gap-1.5 transition-colors",
                    processingProgress >= 70
                      ? "text-primary font-semibold"
                      : "text-muted-foreground",
                  )}
                >
                  <div
                    className={cn(
                      "size-1.5 rounded-full",
                      processingProgress >= 70 ? "bg-primary" : "bg-muted-foreground/40",
                    )}
                  />
                  <span>3. 8 Reglas</span>
                </div>
                <div
                  className={cn(
                    "flex items-center gap-1.5 transition-colors",
                    processingProgress >= 95
                      ? "text-primary font-semibold"
                      : "text-muted-foreground",
                  )}
                >
                  <div
                    className={cn(
                      "size-1.5 rounded-full",
                      processingProgress >= 95 ? "bg-primary" : "bg-muted-foreground/40",
                    )}
                  />
                  <span>4. Veredicto</span>
                </div>
              </div>

              {/* Alerta inteligente de demora prolongada */}
              {showDelayedWarning && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-2 text-amber-950 dark:text-amber-200 animate-in fade-in duration-300">
                  <div className="flex items-start gap-2.5">
                    <Clock className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-xs font-semibold">
                        El análisis está demorando más de lo habitual ({elapsedSeconds}s)
                      </p>
                      <p className="text-[11px] text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
                        El modelo multimodal está realizando una extracción exhaustiva de tablas y
                        campos.
                        <strong> Por favor mantén la ventana abierta:</strong> el servidor sigue
                        procesando tu solicitud. Si reintentas subir el mismo archivo ahora, el
                        motor lo detectará como reenvío duplicado (veredicto <strong>FRENAR</strong>
                        ).
                      </p>
                    </div>
                  </div>
                  {onCancel && (
                    <div className="pt-1 flex justify-end">
                      <button
                        type="button"
                        onClick={onCancel}
                        className="text-[11px] font-semibold text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200 underline underline-offset-2"
                      >
                        Cancelar y cambiar archivo
                      </button>
                    </div>
                  )}
                </div>
              )}

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Extracción tipada con IA multimodal y verificación contra las 8 reglas
                deterministas. El documento no se puede reenviar mientras se está analizando.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
