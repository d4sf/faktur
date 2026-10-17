import { useRef } from "react";
import { UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VerdictBadge } from "@/components/ui/VerdictBadge";

interface InvoiceUploadDropzoneProps {
  /**
   * Callback invocado al seleccionar un archivo del sistema local.
   */
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /**
   * Callback invocado al seleccionar uno de los casos demo precargados.
   */
  onSelectDemo: (caseKey: string) => void;
}

/**
 * Componente que renderiza el área de carga (drag & drop) y los atajos a casos de ejemplo.
 */
export function InvoiceUploadDropzone({ onFileUpload, onSelectDemo }: InvoiceUploadDropzoneProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
          onChange={onFileUpload}
          accept=".pdf,.png,.jpg,.jpeg,.json"
          className="hidden"
        />

        {/* Zona de arrastrar y soltar */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className="group flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-border/80 bg-muted/20 p-10 text-center transition-all hover:border-primary/50 hover:bg-muted/40"
        >
          <div className="text-muted-foreground group-hover:text-foreground transition-colors">
            <UploadCloud className="size-10 stroke-[1.5]" />
          </div>
          <div className="space-y-1">
            <Button size="lg" className="h-11 px-6 text-sm font-semibold shadow-xs">
              Seleccionar factura
            </Button>
            <p className="pt-2 text-xs text-muted-foreground">
              o arrastra y suelta tu archivo aquí (PDF, JPG, PNG, JSON)
            </p>
          </div>
        </div>

        {/* Opciones de demostración con etiquetas sólidas */}
        <div className="pt-6 border-t border-border/60 space-y-2.5">
          <span className="text-xs text-muted-foreground">
            ¿No tienes una factura a mano? Selecciona un caso de ejemplo para procesarlo
            automáticamente:
          </span>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => onSelectDemo("TC-01")}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50 hover:border-foreground/20 transition-all shadow-xs"
            >
              <VerdictBadge verdict="PAGAR" size="sm" />
              <span>INV-01 (Amazon AWS)</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectDemo("TC-04")}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50 hover:border-foreground/20 transition-all shadow-xs"
            >
              <VerdictBadge verdict="ESCALAR" size="sm" />
              <span>INV-04 (Growth Agency)</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectDemo("TC-11")}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50 hover:border-foreground/20 transition-all shadow-xs"
            >
              <VerdictBadge verdict="FRENAR" size="sm" />
              <span>INV-11 (Blacklisted Ltd)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
