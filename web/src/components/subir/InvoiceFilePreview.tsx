/**
 * @file InvoiceFilePreview.tsx
 * @description Vista previa del archivo recién soltado en el dropzone, con el estado
 * "Analizando documento…" y la barra de progreso mientras el agente lo procesa.
 */

import { FileJson, FileText, ImageIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
}: InvoiceFilePreviewProps) {
  const { label, Icon } = describeFile(file);
  const isImage = file.type.startsWith("image/");

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
            <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {flowState === "PROCESSING" ? "En análisis" : "Listo"}
            </span>
          </div>

          {flowState === "PROCESSING" && (
            <div className="space-y-3 rounded-xl border border-border/80 bg-muted/30 p-5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground" role="status">
                  {processingMessage}
                </span>
                <span className="font-mono text-muted-foreground">{processingProgress}%</span>
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={processingProgress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Progreso del análisis"
              >
                <div
                  className="h-full bg-primary transition-all duration-300 ease-out"
                  style={{ width: `${processingProgress}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
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
