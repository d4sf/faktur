import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import { InvoiceUploadDropzone } from "@/components/subir/InvoiceUploadDropzone";
import { InvoiceFilePreview } from "@/components/subir/InvoiceFilePreview";
import { InvoiceDetailCard } from "@/components/subir/InvoiceDetailCard";
import { RuleEvaluationList } from "@/components/subir/RuleEvaluationList";
import { NextStepCard } from "@/components/subir/NextStepCard";
import { PayAgentChat } from "@/components/subir/PayAgentChat";
import { createInvoiceSubmitter, validateInvoiceFile, type SubmitStage } from "@/lib/invoiceSubmit";
import { FlowState, InvoiceData, SystemRule } from "@/types/invoice";

/**
 * Casos de demostración predefinidos para evaluar los tres posibles veredictos:
 * PAGAR (Pase directo), ESCALAR (Supera umbral) y FRENAR (Proveedor bloqueado).
 */
const DEMO_CASES: Record<string, InvoiceData> = {
  "TC-01": {
    id: "TC-01",
    fileName: "factura_aws_octubre.pdf",
    fileSize: "142 KB",
    invoice_number: "INV-AWS-8821",
    vendor_name: "Amazon Web Services",
    vendor_tax_id: "AWS-CLOUD-01",
    issue_date: "2026-10-01",
    due_date: "2026-10-31",
    currency: "USD",
    total_amount: 450,
    total_usd: 450,
    concept: "Cloud compute and hosting Q4",
    verdict: "PAGAR",
    reason_code: "SUCCESS_TOUCHLESS_STP",
    reason_description: "Cumple todas las políticas: pago directo al proveedor.",
  },
  "TC-04": {
    id: "TC-04",
    fileName: "factura_growth_agency.pdf",
    fileSize: "218 KB",
    invoice_number: "INV-GA-3500",
    vendor_name: "Growth Agency",
    vendor_tax_id: "GROWTH-AGENCY",
    issue_date: "2026-10-03",
    due_date: "2026-10-25",
    currency: "USD",
    total_amount: 3500,
    total_usd: 3500,
    concept: "Campaña de marketing digital Q4",
    verdict: "ESCALAR",
    failingRuleId: 7,
    reason_code: "ALERT_THRESHOLD_EXCEEDED",
    reason_description: "El importe de $3,500.00 USD supera el umbral autónomo de $1,000.00 USD.",
  },
  "TC-11": {
    id: "TC-11",
    fileName: "factura_blacklisted_vendor.pdf",
    fileSize: "185 KB",
    invoice_number: "INV-BLK-9912",
    vendor_name: "Blacklisted Services Ltd",
    vendor_tax_id: "BLK-CORP-99",
    issue_date: "2026-10-08",
    due_date: "2026-10-15",
    currency: "USD",
    total_amount: 1200,
    total_usd: 1200,
    concept: "Servicios de integración técnica",
    verdict: "FRENAR",
    failingRuleId: 3,
    reason_code: "ERR_BLACKLISTED_VENDOR",
    reason_description: "El beneficiario figura en la lista de entidades bloqueadas por auditoría.",
  },
};

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
 * Al soltar un archivo se envía automáticamente a la API, se extraen los datos con Gemini,
 * se evalúan las reglas deterministas y se muestra el veredicto sin recargar la página.
 */
export default function Subir() {
  const [flowState, setFlowState] = useState<FlowState>("IDLE");
  const [currentInvoice, setCurrentInvoice] = useState<InvoiceData | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [processingMessage, setProcessingMessage] = useState<string>("Iniciando verificación...");
  const [evaluatedRuleIndex, setEvaluatedRuleIndex] = useState<number>(-1);
  const [error, setError] = useState<string | null>(null);

  /**
   * Identifica el envío vigente: al reiniciar, las respuestas viejas se descartan.
   */
  const runIdRef = useRef(0);
  /**
   * Etapa reportada por el submitter para el envío vigente.
   */
  const onStageRef = useRef<(stage: SubmitStage) => void>(() => {});
  /**
   * Submitter con bloqueo de doble envío (una sola instancia por montaje).
   */
  const submitterRef = useRef<ReturnType<typeof createInvoiceSubmitter> | null>(null);
  if (submitterRef.current === null) {
    submitterRef.current = createInvoiceSubmitter({
      onStage: (stage) => onStageRef.current(stage),
    });
  }
  const submitter = submitterRef.current;

  /**
   * Genera y revoca la URL de objeto para previsualizar imágenes.
   */
  useEffect(() => {
    if (pendingFile === null || !pendingFile.type.startsWith("image/")) {
      setPreviewUrl(null);
      return;
    }
    if (typeof URL.createObjectURL !== "function") {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  /**
   * Dispara la simulación local para los casos de ejemplo (sin consumir Gemini ni API).
   * Implementa cortocircuito determinista (short-circuit): se detiene inmediatamente en la regla que falla.
   */
  const startDemoProcessing = (invoice: InvoiceData) => {
    if (submitter.isSubmitting()) return;
    const runId = ++runIdRef.current;

    setPendingFile(null);
    setError(null);
    setCurrentInvoice(invoice);
    setFlowState("PROCESSING");
    setProcessingProgress(15);
    setProcessingMessage("Extrayendo datos estructurados (Modo demostración)...");
    setEvaluatedRuleIndex(-1);

    // Si la factura infringe alguna regla, determinamos el índice donde debe detenerse (0 a 7)
    const failingIdx =
      invoice.verdict !== "PAGAR" && invoice.failingRuleId ? invoice.failingRuleId - 1 : -1;

    const allRuleStages = [
      { progress: 25, msg: "Verificando estructura y legibilidad (Regla 1)...", ruleIdx: 0 },
      { progress: 38, msg: "Consultando historial de duplicados (Regla 2)...", ruleIdx: 1 },
      {
        progress: 52,
        msg: "Verificando listas de beneficiarios bloqueados (Regla 3)...",
        ruleIdx: 2,
      },
      { progress: 66, msg: "Validando directorio de proveedores (Regla 4)...", ruleIdx: 3 },
      { progress: 78, msg: "Analizando desvíos sobre importe acordado (Regla 5)...", ruleIdx: 4 },
      {
        progress: 88,
        msg: "Comprobando presupuesto disponible en categoría (Regla 6)...",
        ruleIdx: 5,
      },
      { progress: 95, msg: "Evaluando límite de aprobación autónoma (Regla 7)...", ruleIdx: 6 },
      { progress: 100, msg: "Verificando criterio de pase directo STP (Regla 8)...", ruleIdx: 7 },
    ];

    // Cortocircuito: la evaluación solo avanza hasta la regla que detiene o escala el caso
    const stages = failingIdx !== -1 ? allRuleStages.slice(0, failingIdx + 1) : allRuleStages;

    let currentStage = 0;
    const interval = setInterval(() => {
      if (runIdRef.current !== runId) {
        clearInterval(interval);
        return;
      }
      if (currentStage < stages.length) {
        const stage = stages[currentStage];
        setProcessingProgress(stage.progress);
        setProcessingMessage(stage.msg);
        setEvaluatedRuleIndex(stage.ruleIdx);
        currentStage++;
      } else {
        clearInterval(interval);
        setProcessingProgress(100);
        setProcessingMessage(
          invoice.verdict === "FRENAR"
            ? "Evaluación detenida: Factura bloqueada por política."
            : invoice.verdict === "ESCALAR"
              ? "Evaluación detenida: Factura escalada para revisión humana."
              : "Verificación completada: Factura aprobada para dispersión autónoma (STP).",
        );
        setFlowState("COMPLETED");
      }
    }, 450);
  };

  /**
   * Manejador de selección de caso demo (modo de prueba rápido y offline).
   */
  const handleSelectDemo = (caseKey: string) => {
    const data = DEMO_CASES[caseKey];
    if (!data) return;
    startDemoProcessing(data);
  };

  /**
   * Envía el archivo a `POST /api/invoices` y refleja el veredicto en pantalla.
   * Un segundo envío mientras hay uno en vuelo se ignora (lo garantiza el submitter).
   */
  const startUpload = async (file: File) => {
    const runId = ++runIdRef.current;

    onStageRef.current = (stage) => {
      if (runIdRef.current !== runId) return;
      setProcessingProgress(stage.progress);
      setProcessingMessage(stage.message);
      setEvaluatedRuleIndex(stage.progress <= 20 ? 0 : 6);
    };

    setPendingFile(file);
    setCurrentInvoice(null);
    setError(null);
    setFlowState("PROCESSING");
    setProcessingProgress(10);
    setProcessingMessage("Analizando documento…");
    setEvaluatedRuleIndex(0);

    const outcome = await submitter.submit(file);
    if (runIdRef.current !== runId) return;

    if (outcome.status === "skipped") return;

    if (outcome.status === "error") {
      setFlowState("IDLE");
      setPendingFile(null);
      setCurrentInvoice(null);
      setProcessingProgress(0);
      setEvaluatedRuleIndex(-1);
      setError(outcome.message);
      return;
    }

    setProcessingProgress(100);
    setEvaluatedRuleIndex(7);
    setCurrentInvoice(outcome.invoice);
    setFlowState("COMPLETED");
  };

  /**
   * Valida el archivo en cliente y arranca el análisis automáticamente.
   */
  const handleFileSelected = (file: File) => {
    if (flowState === "PROCESSING" || submitter.isSubmitting()) return;

    const validationError = validateInvoiceFile(file);
    if (validationError !== null) {
      setError(validationError);
      return;
    }
    void startUpload(file);
  };

  /**
   * Registra la resolución humana (aprobado o rechazado) y su justificación.
   */
  const handleResolveHuman = async (approved: boolean, justification: string) => {
    if (!currentInvoice) return;

    const finalReason =
      justification.trim() ||
      (approved ? "Aprobado excepcionalmente por el revisor" : "Rechazado por el revisor");

    if (currentInvoice.approvalId) {
      try {
        await fetch(`/api/approvals/${currentInvoice.approvalId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            approve: approved,
            resolved_by: "Revisor (Web UI)",
            comment: finalReason,
          }),
        });
      } catch (err) {
        console.error("Error al persistir aprobación en API:", err);
      }
    }

    setCurrentInvoice({
      ...currentInvoice,
      resolved_status: approved ? "APROBADO_HUMANO" : "RECHAZADO_HUMANO",
      resolved_reason: finalReason,
      resolved_at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    });
  };

  /**
   * Reinicia el estado para evaluar una nueva factura.
   */
  const handleReset = () => {
    runIdRef.current += 1;
    setFlowState("IDLE");
    setCurrentInvoice(null);
    setPendingFile(null);
    setPreviewUrl(null);
    setEvaluatedRuleIndex(-1);
    setProcessingProgress(0);
    setProcessingMessage("Iniciando verificación...");
    setError(null);
  };

  const showFlow = flowState !== "IDLE" && (pendingFile !== null || currentInvoice !== null);
  const isProcessing = flowState === "PROCESSING";

  return (
    <div className="space-y-8">
      {/* Estado Inicial: Área de carga limpia */}
      {flowState === "IDLE" && (
        <InvoiceUploadDropzone
          onFileSelected={handleFileSelected}
          onSelectDemo={handleSelectDemo}
          disabled={submitter.isSubmitting()}
          error={error}
        />
      )}

      {/* Estados Activos: Procesando o Análisis Completado */}
      {showFlow && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
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

          {/* Columna Derecha: Reglas, Veredicto, Próximo paso y Chat de revisión */}
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

                {/* Sección final: Veredicto, Próximo paso y Chat interactivo */}
                <div className="border-t border-border/60 pt-4">
                  {isProcessing && (
                    <div className="text-center py-2 text-xs text-muted-foreground font-medium animate-pulse">
                      Ejecutando motor determinista...
                    </div>
                  )}

                  {flowState === "COMPLETED" && currentInvoice && (
                    <div className="space-y-4">
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

                      {/* Chat interactivo con protección contra clics involuntarios */}
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
