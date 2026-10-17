/**
 * @file InvoiceUploadDropzone.tsx
 * @description Zona de arrastrar y soltar (drag & drop real) para PDF, imagen y JSON mock,
 * con validación en cliente y bloqueo mientras el agente está procesando.
 */

import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import { pickDroppedFile } from "@/lib/invoiceSubmit";

interface InvoiceUploadDropzoneProps {
  /**
   * Callback invocado con el archivo soltado o elegido. El análisis arranca automáticamente.
   */
  onFileSelected: (file: File) => void;
  /**
   * Callback invocado al seleccionar uno de los casos demo precargados.
   */
  onSelectDemo: (caseKey: string) => void;
  /**
   * Deshabilita la zona y los atajos mientras hay un envío en vuelo.
   */
  disabled?: boolean;
  /**
   * Error de validación o de la API a mostrar junto a la zona.
   */
  error?: string | null;
}

/**
 * Componente que renderiza el área de carga (drag & drop) y los atajos a casos de ejemplo.
 */
export function InvoiceUploadDropzone({
  onFileSelected,
  onSelectDemo,
  disabled = false,
  error = null,
}: InvoiceUploadDropzoneProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepth = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  /**
   * Abre el selector de archivos del sistema.
   */
  const openFilePicker = () => {
    if (disabled) return;
    fileInputRef.current?.click();
  };

  /**
   * Toma el primer archivo de un `FileList` o `DataTransfer` y lo entrega al padre.
   */
  const deliverFiles = (files: FileList | null) => {
    if (disabled) return;
    const file = pickDroppedFile(files);
    if (file !== null) onFileSelected(file);
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) return;
    dragDepth.current += 1;
    setIsDragging(true);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) return;
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragging(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    deliverFiles(event.dataTransfer?.files ?? null);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    deliverFiles(event.target.files);
    // Permite volver a elegir el mismo archivo (necesario para probar el reenvío duplicado).
    event.target.value = "";
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openFilePicker();
    }
  };

  return (
    <div className="flex min-h-[65vh] flex-col items-center justify-center text-center">
      <div className="w-full max-w-xl space-y-6">
        <div className="space-y-2">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Subir factura
          </h2>
          <p className="text-sm text-muted-foreground">
            Carga tu factura para que el agente determinista evalúe las 8 reglas de política.
          </p>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleInputChange}
          accept=".pdf,.png,.jpg,.jpeg,.json,application/pdf,image/png,image/jpeg,application/json"
          disabled={disabled}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        />

        {/* Zona de arrastrar y soltar */}
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label="Subir factura: hacé clic o arrastrá un archivo PDF, imagen o JSON"
          aria-disabled={disabled}
          onClick={openFilePicker}
          onKeyDown={handleKeyDown}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={[
            "group flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-10 text-center transition-all",
            disabled
              ? "cursor-not-allowed border-border/60 bg-muted/10 opacity-60"
              : isDragging
                ? "border-primary bg-primary/5"
                : "border-border/80 bg-muted/20 hover:border-primary/50 hover:bg-muted/40",
          ].join(" ")}
        >
          <div className="text-muted-foreground group-hover:text-foreground transition-colors">
            <UploadCloud className="size-10 stroke-[1.5]" />
          </div>
          <div className="space-y-1">
            <Button
              size="lg"
              type="button"
              tabIndex={-1}
              disabled={disabled}
              className="h-11 px-6 text-sm font-semibold shadow-xs"
            >
              Seleccionar factura
            </Button>
            <p className="pt-2 text-xs text-muted-foreground">
              {isDragging
                ? "Soltá el archivo para analizarlo"
                : "o arrastra y suelta tu archivo aquí (PDF, JPG, PNG, JSON)"}
            </p>
          </div>
        </div>

        {error !== null && (
          <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}

        {/* Opciones de demostración con etiquetas sólidas */}
        <div className="pt-6 border-t border-border/60 space-y-2.5">
          <span className="text-xs text-muted-foreground">
            ¿No tienes una factura a mano? Selecciona un caso de ejemplo para procesarlo
            automáticamente:
          </span>
          <div className="flex flex-wrap justify-center gap-2">
            {[
              { key: "TC-01", verdict: "PAGAR", label: "INV-01 (Amazon AWS)" },
              { key: "TC-04", verdict: "ESCALAR", label: "INV-04 (Growth Agency)" },
              { key: "TC-11", verdict: "FRENAR", label: "INV-11 (Blacklisted Ltd)" },
            ].map((demo) => (
              <button
                key={demo.key}
                type="button"
                disabled={disabled}
                onClick={() => onSelectDemo(demo.key)}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50 hover:border-foreground/20 transition-all shadow-xs disabled:cursor-not-allowed disabled:opacity-60"
              >
                <VerdictBadge verdict={demo.verdict} size="sm" />
                <span>{demo.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
