import { ExtractedInvoice } from "./extraction.js";
import { ReasonCode, Verdict } from "./decision.js";
import { PolicySpec } from "./policy.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EvaluableInvoice = ExtractedInvoice & {
  file_hash: string;
  vendor_id: string | null;
  total_usd: number;
  fx_rate_used: number;
  extraction_confidence: number | undefined;
};

export type VendorInfo = {
  status: "ALLOWLISTED" | "BLOCKLISTED";
  historical_avg_usd: number;
  category: string;
};

export type ExistingInvoice = {
  file_hash: string;
  vendor_id: string | null;
  invoice_number: string;
};

export type BudgetState = {
  monthlySpent: number;
  monthlyBudget: number;
  categorySpent: Record<string, number>;
};

export type EvaluationContext = {
  vendor: VendorInfo | null;
  existingInvoices: ExistingInvoice[];
  budgetState: BudgetState;
};

export type EvaluationResult = {
  verdict: Verdict;
  reason_code: ReasonCode;
  explanation: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  const str = rounded.toFixed(2);
  const [intPart, decPart] = str.split(".");
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  if (decPart === "00") return `$${formatted}`;
  return `$${formatted},${decPart}`;
}

function lowestConfidenceField(fc: NonNullable<EvaluableInvoice["field_confidence"]>): string {
  const entries = Object.entries(fc) as [string, number][];
  let min = entries[0];
  for (const e of entries) {
    if (e[1] < min[1]) min = e;
  }
  return min[0];
}

// ---------------------------------------------------------------------------
// evaluate
// ---------------------------------------------------------------------------

export function evaluate(
  invoice: EvaluableInvoice,
  policy: PolicySpec,
  context: EvaluationContext,
): EvaluationResult {
  // Regla 1a: datos críticos ilegibles o incompletos
  if (!invoice.vendor_tax_id || invoice.vendor_tax_id.trim() === "") {
    return {
      verdict: "FRENAR",
      reason_code: "ERR_INVALID_DATA",
      explanation: "Falta el identificador fiscal del beneficiario",
    };
  }

  if (!policy.allowed_currencies.includes(invoice.currency as never)) {
    return {
      verdict: "FRENAR",
      reason_code: "ERR_INVALID_DATA",
      explanation: `La moneda ${invoice.currency} no está permitida por la política`,
    };
  }

  // Regla 1b: datos completos, confianza bajo el umbral
  if (
    invoice.extraction_confidence !== undefined &&
    invoice.extraction_confidence < policy.min_extraction_confidence
  ) {
    const field = invoice.field_confidence
      ? lowestConfidenceField(invoice.field_confidence)
      : "desconocido";
    const value = invoice.field_confidence
      ? invoice.field_confidence[field as keyof typeof invoice.field_confidence]
      : invoice.extraction_confidence;
    return {
      verdict: "ESCALAR",
      reason_code: "ALERT_LOW_CONFIDENCE",
      explanation: `No se pudo leer ${field} con confianza (${value} < ${policy.min_extraction_confidence})`,
    };
  }

  // Regla 2: duplicado (hash o tupla)
  if (context.existingInvoices.some((e) => e.file_hash === invoice.file_hash)) {
    return {
      verdict: "FRENAR",
      reason_code: "ERR_DUPLICATE_INVOICE",
      explanation: `La factura ${invoice.invoice_number} de ${invoice.vendor_name ?? "desconocido"} ya fue registrada`,
    };
  }
  if (
    invoice.vendor_id !== null &&
    context.existingInvoices.some(
      (e) => e.vendor_id === invoice.vendor_id && e.invoice_number === invoice.invoice_number,
    )
  ) {
    return {
      verdict: "FRENAR",
      reason_code: "ERR_DUPLICATE_INVOICE",
      explanation: `La factura ${invoice.invoice_number} de ${invoice.vendor_name ?? "desconocido"} ya fue registrada`,
    };
  }

  // Regla 3: beneficiario bloqueado
  if (context.vendor?.status === "BLOCKLISTED") {
    return {
      verdict: "FRENAR",
      reason_code: "ERR_BLACKLISTED_VENDOR",
      explanation: `El beneficiario está en la lista bloqueada (policy ${policy.version})`,
    };
  }

  // Regla 4: beneficiario no listado
  if (context.vendor === null) {
    return {
      verdict: "ESCALAR",
      reason_code: "ALERT_NEW_VENDOR",
      explanation: `El proveedor no está en la lista permitida (policy ${policy.version})`,
    };
  }

  // Regla 5: drift (solo montos mayores, solo si hay histórico)
  if (context.vendor.status === "ALLOWLISTED" && context.vendor.historical_avg_usd > 0) {
    const threshold = context.vendor.historical_avg_usd * policy.vendor_drift_factor;
    if (invoice.total_usd > threshold) {
      const drift = Math.round(
        ((invoice.total_usd - context.vendor.historical_avg_usd) /
          context.vendor.historical_avg_usd) *
          100,
      );
      return {
        verdict: "ESCALAR",
        reason_code: "ALERT_VENDOR_DRIFT",
        explanation: `Acordado ${fmt(context.vendor.historical_avg_usd)}, facturado ${fmt(invoice.total_usd)} (+${drift}%, límite ${policy.vendor_drift_factor}x)`,
      };
    }
  }

  // Regla 6a: presupuesto del período
  if (context.budgetState.monthlySpent + invoice.total_usd > context.budgetState.monthlyBudget) {
    const remaining = context.budgetState.monthlyBudget - context.budgetState.monthlySpent;
    return {
      verdict: "ESCALAR",
      reason_code: "ALERT_BUDGET_OVERRUN",
      explanation: `Presupuesto del periodo insuficiente: saldo ${fmt(remaining)}, factura ${fmt(invoice.total_usd)}`,
    };
  }

  // Regla 6b: presupuesto de categoría
  const category = context.vendor.category;
  if (category in policy.category_budgets) {
    const categoryBudget =
      policy.category_budgets[category as keyof typeof policy.category_budgets];
    const categorySpent = context.budgetState.categorySpent[category] ?? 0;
    if (categorySpent + invoice.total_usd > categoryBudget) {
      const remaining = categoryBudget - categorySpent;
      return {
        verdict: "ESCALAR",
        reason_code: "ALERT_BUDGET_TIGHT",
        explanation: `Saldo de la categoría ${category}: ${fmt(remaining)}; factura: ${fmt(invoice.total_usd)}`,
      };
    }
  }

  // Regla 7: umbral de aprobación autónoma
  if (invoice.total_usd > policy.auto_approval_threshold_usd) {
    return {
      verdict: "ESCALAR",
      reason_code: "ALERT_THRESHOLD_EXCEEDED",
      explanation: `Supera el umbral de aprobación autónoma de ${fmt(policy.auto_approval_threshold_usd)}`,
    };
  }

  // Regla 8: pasa todo
  return {
    verdict: "PAGAR",
    reason_code: "SUCCESS_TOUCHLESS_STP",
    explanation: `Dentro de política: ${fmt(invoice.total_usd)} < umbral ${fmt(policy.auto_approval_threshold_usd)}`,
  };
}
