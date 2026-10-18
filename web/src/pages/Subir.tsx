import { Card, CardContent } from "@/components/ui/card";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import { InvoiceUploadDropzone } from "@/components/subir/InvoiceUploadDropzone";
import { InvoiceFilePreview } from "@/components/subir/InvoiceFilePreview";
import { InvoiceDetailCard } from "@/components/subir/InvoiceDetailCard";
import { RuleEvaluationList } from "@/components/subir/RuleEvaluationList";
import { NextStepCard } from "@/components/subir/NextStepCard";
import { PayAgentChat } from "@/components/subir/PayAgentChat";
import { useInvoiceUpload } from "@/hooks/useInvoiceUpload";
import type { SystemRule } from "@/types/invoice";

/**
 * Catálogo canónico de las 8 reglas del motor de políticas determinista.
 */
const SYSTEM_RULES: SystemRule[] = [
  { id: 1, label: "Regla 1", name: "Extracción y legibilidad de datos críticos" },
  { id: 2, label: "Regla 2", name: "Verificación de duplicados (hash y folio)" },
  { id: 3, label: "Regla 3", name: "Lista de beneficiarios bloqueados o sancionados" },
  { id: 4, label: "Regla 4", name: "Proveedor registrado y activo en directorio" },
  { id: 5, label: "Regla 5", name: "Desvío sobre importe acordado o histórico" },
  { id: 6, label: "Regla 6", name: "Presupuesto disponible en período y categoría" },
  { id: 7, label: "Regla 7", name: "Límite de aprobación autónoma ($1,000 USD)" },
  { id: 8, label: "Regla 8", name: "Criterio de pase directo y dispersión STP" },
];

/**
 * Página principal de Carga y Evaluación de Facturas.
 * Al soltar un archivo se envía automáticamente a la API, se extraen los datos estructurados,
 * se evalúan las reglas deterministas y se muestra el veredicto en tiempo real.
 */
export default function Subir() {
  const {
    flowState,
    currentInvoice,
    pendingFile,
    previewUrl,
    processingProgress,
    processingMessage,
    processingElapsed,
    isDelayed,
    evaluatedRuleIndex,
    error,
    handleFileSelected,
    handleSelectDemo,
    handleCancelUpload,
    handleResolveHuman,
    handleReset,
  } = useInvoiceUpload();

  const showFlow = flowState !== "IDLE" && (pendingFile !== null || currentInvoice !== null);
  const isProcessing = flowState === "PROCESSING";

  return (
    <div className="space-y-8">
      {/* Estado Inicial: Área de carga limpia */}
      {flowState === "IDLE" && (
        <InvoiceUploadDropzone
          onFileSelected={handleFileSelected}
          onSelectDemo={handleSelectDemo}
          disabled={isProcessing}
          error={error}
        />
      )}

      {/* Estados Activos: Procesando o Análisis Completado */}
      {showFlow && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start animate-in fade-in duration-300">
          {/* Columna Izquierda: preview del archivo y datos extraídos */}
          {flowState === "COMPLETED" && currentInvoice && (
            <InvoiceDetailCard
              invoice={currentInvoice}
              flowState={flowState}
              processingMessage={processingMessage}
              processingProgress={processingProgress}
              onReset={handleReset}
            />
          )}

          {isProcessing && pendingFile !== null && (
            <InvoiceFilePreview
              file={pendingFile}
              previewUrl={previewUrl}
              flowState={flowState}
              processingMessage={processingMessage}
              processingProgress={processingProgress}
              elapsedSeconds={processingElapsed}
              isDelayed={isDelayed}
              onCancel={handleCancelUpload}
            />
          )}

          {isProcessing && pendingFile === null && currentInvoice && (
            <InvoiceDetailCard
              invoice={currentInvoice}
              flowState={flowState}
              processingMessage={processingMessage}
              processingProgress={processingProgress}
              onReset={handleReset}
            />
          )}

          {/* Columna Derecha: Reglas, Veredicto, Próximo paso y Panel de resolución humana */}
          <div className="space-y-5 lg:col-span-5">
            <Card className="rounded-xl border border-border/80 shadow-xs">
              <CardContent className="p-6 space-y-6">
                <div>
                  <h4 className="text-sm font-bold text-foreground">Verificación de políticas</h4>
                  <p className="text-xs text-muted-foreground">
                    Evaluación determinista sobre las 8 reglas del negocio.
                  </p>
                </div>

                {/* Lista interactiva de las 8 reglas */}
                <RuleEvaluationList
                  rules={SYSTEM_RULES}
                  evaluatedRuleIndex={evaluatedRuleIndex}
                  flowState={flowState}
                  invoice={currentInvoice}
                />

                {/* Sección final: Veredicto, Próximo paso y Panel de decisión humana */}
                <div className="border-t border-border/60 pt-4">
                  {isProcessing && (
                    <div
                      className="text-center py-2 text-xs text-muted-foreground font-medium animate-pulse"
                      role="status"
                    >
                      Ejecutando motor determinista...
                    </div>
                  )}

                  {flowState === "COMPLETED" && currentInvoice && (
                    <div className="space-y-4 animate-in fade-in duration-200">
                      {/* Veredicto del sistema: sólido, elegante y sin emojis */}
                      <div className="rounded-lg border border-border/80 bg-card p-4 space-y-2 shadow-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-foreground">
                            Veredicto del sistema:
                          </span>
                          <VerdictBadge verdict={currentInvoice.verdict} size="lg" />
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {currentInvoice.reason_description}
                        </p>
                        {currentInvoice.duplicate === true && (
                          <p className="text-[11px] text-muted-foreground">
                            Reenvío duplicado: el documento ya había sido recibido, por eso se frena
                            en lugar de pagarse.
                          </p>
                        )}
                      </div>

                      {/* Orientación clara sobre el próximo paso sin tecnicismos bancarios */}
                      <NextStepCard invoice={currentInvoice} onReset={handleReset} />

                      {/* Panel de decisión humana y Explicar con IA */}
                      {currentInvoice.verdict === "ESCALAR" && (
                        <PayAgentChat invoice={currentInvoice} onResolve={handleResolveHuman} />
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
