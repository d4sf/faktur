import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import { InvoiceUploadDropzone } from "@/components/subir/InvoiceUploadDropzone";
import { InvoiceDetailCard } from "@/components/subir/InvoiceDetailCard";
import { RuleEvaluationList } from "@/components/subir/RuleEvaluationList";
import { NextStepCard } from "@/components/subir/NextStepCard";
import { PayAgentChat } from "@/components/subir/PayAgentChat";
import { FlowState, InvoiceData, PendingApproval, SystemRule } from "@/types/invoice";

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
 * Determina el ID de regla (1 a 8) asociado a un código de razón.
 */
function determineFailingRuleId(reasonCode: string): number | undefined {
  if (reasonCode === "ERR_INVALID_DATA" || reasonCode === "ALERT_LOW_CONFIDENCE") return 1;
  if (reasonCode === "ERR_DUPLICATE_INVOICE") return 2;
  if (reasonCode === "ERR_BLACKLISTED_VENDOR") return 3;
  if (reasonCode === "ALERT_NEW_VENDOR") return 4;
  if (reasonCode === "ALERT_VENDOR_DRIFT") return 5;
  if (reasonCode === "ALERT_BUDGET_OVERRUN" || reasonCode === "ALERT_BUDGET_TIGHT") return 6;
  if (reasonCode === "ALERT_THRESHOLD_EXCEEDED") return 7;
  return undefined;
}

/**
 * Página principal de Carga y Evaluación de Facturas.
 * Orquesta la extracción de datos con Gemini en el backend, la verificación determinista y la resolución interactiva.
 */
export default function Subir() {
  const [flowState, setFlowState] = useState<FlowState>("IDLE");
  const [currentInvoice, setCurrentInvoice] = useState<InvoiceData | null>(null);
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [processingMessage, setProcessingMessage] = useState<string>("Iniciando verificación...");
  const [evaluatedRuleIndex, setEvaluatedRuleIndex] = useState<number>(-1);

  /**
   * Dispara la simulación local para los casos de ejemplo (sin consumir Gemini ni API).
   */
  const startDemoProcessing = (invoice: InvoiceData) => {
    setCurrentInvoice(invoice);
    setFlowState("PROCESSING");
    setProcessingProgress(15);
    setProcessingMessage("Extrayendo datos estructurados (Modo demostración)...");
    setEvaluatedRuleIndex(-1);

    const stages = [
      { progress: 25, msg: "Verificando estructura y folio...", ruleIdx: 0 },
      { progress: 40, msg: "Consultando historial de duplicados...", ruleIdx: 1 },
      { progress: 55, msg: "Verificando listas de control...", ruleIdx: 2 },
      { progress: 70, msg: "Validando directorio de proveedores...", ruleIdx: 3 },
      { progress: 85, msg: "Calculando presupuestos y desvíos...", ruleIdx: 5 },
      { progress: 100, msg: "Evaluando umbrales de política...", ruleIdx: 7 },
    ];

    let currentStage = 0;
    const interval = setInterval(() => {
      if (currentStage < stages.length) {
        const stage = stages[currentStage];
        setProcessingProgress(stage.progress);
        setProcessingMessage(stage.msg);
        setEvaluatedRuleIndex(stage.ruleIdx);
        currentStage++;
      } else {
        clearInterval(interval);
        setFlowState("COMPLETED");
      }
    }, 380);
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
   * Manejador de carga de archivo real: se conecta a la API real de Fastify (POST /api/invoices)
   * ejecutando la extracción con Gemini en vivo y la evaluación del motor en SQLite.
   */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFlowState("PROCESSING");
    setProcessingProgress(20);
    setProcessingMessage("Enviando archivo y extrayendo datos con Gemini...");
    setEvaluatedRuleIndex(0);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // Progreso visual intermedio
      setTimeout(() => {
        setProcessingProgress(50);
        setProcessingMessage("Extrayendo campos fiscales estructurados...");
        setEvaluatedRuleIndex(2);
      }, 700);

      const response = await fetch("/api/invoices", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      setProcessingProgress(85);
      setProcessingMessage("Evaluando reglas deterministas de política...");
      setEvaluatedRuleIndex(6);

      let invoiceNumber = "INV-" + Math.floor(1000 + Math.random() * 9000);
      let vendorName = "Proveedor identificado";
      let vendorTaxId = "N/A";
      let issueDate = new Date().toISOString().split("T")[0];
      let dueDate = "-";
      let currency = "USD";
      let totalAmount = 0;
      let totalUsd = 0;
      const concept = "Servicios procesados vía IA";

      // Si el backend devolvió invoice_id, consultamos el detalle extraído
      if (result.invoice_id) {
        try {
          const detailRes = await fetch(`/api/invoices/${result.invoice_id}`);
          if (detailRes.ok) {
            const detail = await detailRes.json();
            const rec = detail.audit_record;
            if (rec) {
              invoiceNumber = rec.invoice_number || invoiceNumber;
              vendorName = detail.vendor?.display_name || rec.vendor_name || vendorName;
              vendorTaxId = detail.vendor?.tax_id || rec.vendor_id || vendorTaxId;
              issueDate = rec.issue_date || issueDate;
              dueDate = rec.due_date || dueDate;
              currency = rec.currency || currency;
              totalAmount = rec.total_amount || totalAmount;
              totalUsd = rec.total_usd || totalUsd;
            }
          }
        } catch {
          // Fallback a los datos del resultado
        }
      }

      // Si es ESCALAR, vinculamos el approvalId de la bandeja
      let approvalId: string | undefined;
      if (result.verdict === "ESCALAR") {
        try {
          const appRes = await fetch("/api/approvals?status=pendiente");
          if (appRes.ok) {
            const approvals: PendingApproval[] = await appRes.json();
            const found = approvals.find((a) => a.invoice_id === result.invoice_id);
            if (found) approvalId = found.id;
          }
        } catch {
          // Ignorar si no se puede obtener
        }
      }

      const realInvoice: InvoiceData = {
        id: result.invoice_id || result.attempt_id || `inv-${Date.now()}`,
        fileName: file.name,
        fileSize: `${Math.max(1, Math.round(file.size / 1024))} KB`,
        invoice_number: invoiceNumber,
        vendor_name: vendorName,
        vendor_tax_id: vendorTaxId,
        issue_date: issueDate,
        due_date: dueDate,
        currency,
        total_amount: totalAmount || (result.amount_usd_evaluated ?? 0),
        total_usd: totalUsd || (result.amount_usd_evaluated ?? 0),
        concept,
        verdict: result.verdict || "ESCALAR",
        reason_code: result.reason_code || "EVALUADA",
        reason_description: result.explanation || "Evaluación determinista completada con éxito.",
        failingRuleId: determineFailingRuleId(result.reason_code),
        approvalId,
      };

      setProcessingProgress(100);
      setEvaluatedRuleIndex(7);
      setCurrentInvoice(realInvoice);
      setFlowState("COMPLETED");
    } catch (err: unknown) {
      console.error("Error al procesar archivo en el backend:", err);
      const errMsg = err instanceof Error ? err.message : "Error de conexión";
      alert("Error al procesar la factura con el agente: " + errMsg);
      setFlowState("IDLE");
    }
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
    setFlowState("IDLE");
    setCurrentInvoice(null);
    setEvaluatedRuleIndex(-1);
    setProcessingProgress(0);
  };

  return (
    <div className="space-y-8">
      {/* Estado Inicial: Área de carga limpia */}
      {flowState === "IDLE" && (
        <InvoiceUploadDropzone onFileUpload={handleFileUpload} onSelectDemo={handleSelectDemo} />
      )}

      {/* Estados Activos: Procesando o Análisis Completado */}
      {flowState !== "IDLE" && currentInvoice && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
          {/* Columna Izquierda: Ficha y datos extraídos */}
          <InvoiceDetailCard
            invoice={currentInvoice}
            flowState={flowState}
            processingMessage={processingMessage}
            processingProgress={processingProgress}
            onReset={handleReset}
          />

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
                  {flowState === "PROCESSING" && (
                    <div className="text-center py-2 text-xs text-muted-foreground font-medium animate-pulse">
                      Ejecutando motor determinista...
                    </div>
                  )}

                  {flowState === "COMPLETED" && (
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
