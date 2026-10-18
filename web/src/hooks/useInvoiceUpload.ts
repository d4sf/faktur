import { useEffect, useRef, useState } from "react";
import { createInvoiceSubmitter, validateInvoiceFile, type SubmitStage } from "@/lib/invoiceSubmit";
import type { FlowState, InvoiceData } from "@/types/invoice";

/**
 * Casos de demostración predefinidos para evaluar los tres posibles veredictos:
 * PAGAR (Pase directo), ESCALAR (Supera umbral) y FRENAR (Proveedor bloqueado).
 */
export const DEMO_CASES: Record<string, InvoiceData> = {
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

export function useInvoiceUpload() {
  const [flowState, setFlowState] = useState<FlowState>("IDLE");
  const [currentInvoice, setCurrentInvoice] = useState<InvoiceData | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [processingMessage, setProcessingMessage] = useState<string>("Iniciando verificación...");
  const [processingElapsed, setProcessingElapsed] = useState<number>(0);
  const [isDelayed, setIsDelayed] = useState<boolean>(false);
  const [evaluatedRuleIndex, setEvaluatedRuleIndex] = useState<number>(-1);
  const [error, setError] = useState<string | null>(null);

  const runIdRef = useRef(0);
  const onStageRef = useRef<(stage: SubmitStage) => void>(() => {});
  const submitterRef = useRef<ReturnType<typeof createInvoiceSubmitter> | null>(null);

  if (submitterRef.current === null) {
    submitterRef.current = createInvoiceSubmitter({
      onStage: (stage) => onStageRef.current(stage),
    });
  }
  const submitter = submitterRef.current;

  // Genera y revoca URL para previsualizar imágenes
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

  // Simulación local de casos demo
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
              : "Verificación completada: Factura aprobada para dispersión autónoma.",
        );
        setFlowState("COMPLETED");
      }
    }, 450);
  };

  const handleSelectDemo = (caseKey: string) => {
    const data = DEMO_CASES[caseKey];
    if (!data) return;
    startDemoProcessing(data);
  };

  // Subida real a la API
  const startUpload = async (file: File) => {
    const runId = ++runIdRef.current;

    onStageRef.current = (stage) => {
      if (runIdRef.current !== runId) return;
      setProcessingProgress(stage.progress);
      setProcessingMessage(stage.message);
      setProcessingElapsed(stage.elapsedSeconds ?? 0);
      setIsDelayed(stage.isDelayed ?? false);
      setEvaluatedRuleIndex(stage.progress <= 20 ? 0 : 6);
    };

    setPendingFile(file);
    setCurrentInvoice(null);
    setError(null);
    setFlowState("PROCESSING");
    setProcessingProgress(10);
    setProcessingElapsed(0);
    setIsDelayed(false);
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
      setProcessingElapsed(0);
      setIsDelayed(false);
      setEvaluatedRuleIndex(-1);
      setError(outcome.message);
      return;
    }

    setProcessingProgress(100);
    setEvaluatedRuleIndex(7);
    setCurrentInvoice(outcome.invoice);
    setFlowState("COMPLETED");
  };

  const handleFileSelected = (file: File) => {
    if (flowState === "PROCESSING" || submitter.isSubmitting()) return;

    const validationError = validateInvoiceFile(file);
    if (validationError !== null) {
      setError(validationError);
      return;
    }
    void startUpload(file);
  };

  const handleCancelUpload = () => {
    submitter.abort();
    runIdRef.current += 1;
    setFlowState("IDLE");
    setPendingFile(null);
    setCurrentInvoice(null);
    setPreviewUrl(null);
    setProcessingProgress(0);
    setProcessingElapsed(0);
    setIsDelayed(false);
    setEvaluatedRuleIndex(-1);
    setError(
      "Análisis cancelado por el usuario. Si deseas probar nuevamente, te recomendamos subir otro archivo para evitar que el intento previo sea detectado como duplicado por hash.",
    );
  };

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

  const handleReset = () => {
    submitter.abort();
    runIdRef.current += 1;
    setFlowState("IDLE");
    setCurrentInvoice(null);
    setPendingFile(null);
    setPreviewUrl(null);
    setEvaluatedRuleIndex(-1);
    setProcessingProgress(0);
    setProcessingElapsed(0);
    setIsDelayed(false);
    setProcessingMessage("Iniciando verificación...");
    setError(null);
  };

  return {
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
  };
}
