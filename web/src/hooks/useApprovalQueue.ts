import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useSession } from "@/components/session/SessionProvider";
import { formatReasonTitle } from "@/lib/invoiceSubmit";
import type { InvoiceData, PendingApproval } from "@/types/invoice";

function determineFailingRuleId(reasonCode?: string): number | undefined {
  if (!reasonCode) return undefined;
  if (reasonCode === "ERR_INVALID_DATA" || reasonCode === "ALERT_LOW_CONFIDENCE") return 1;
  if (reasonCode === "ERR_DUPLICATE_INVOICE") return 2;
  if (reasonCode === "ERR_BLACKLISTED_VENDOR") return 3;
  if (reasonCode === "ALERT_NEW_VENDOR") return 4;
  if (reasonCode === "ALERT_VENDOR_DRIFT") return 5;
  if (reasonCode === "ALERT_BUDGET_OVERRUN" || reasonCode === "ALERT_BUDGET_TIGHT") return 6;
  if (reasonCode === "ALERT_THRESHOLD_EXCEEDED") return 7;
  if (reasonCode === "SUCCESS_TOUCHLESS_STP") return 8;
  return undefined;
}

interface AuditRecordResponse {
  record?: {
    invoice_number?: string | null;
    vendor_id?: string | null;
    issue_date?: string | null;
    due_date?: string | null;
    currency?: string | null;
    total_amount?: number | null;
    total_usd?: number | null;
    line_items?: Array<{ concept?: string }>;
    invoice?: {
      invoice_number?: string;
      vendor_name?: string;
      vendor_tax_id?: string;
      issue_date?: string;
      due_date?: string;
      currency?: string;
      total_amount?: number;
      total_usd?: number;
    };
    amount_usd?: number;
    reason_code?: string;
    explanation?: string;
  };
}

export function useApprovalQueue() {
  const [searchParams] = useSearchParams();
  const { user } = useSession();
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedApproval, setSelectedApproval] = useState<PendingApproval | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceData | null>(null);
  const [justUpdated, setJustUpdated] = useState<boolean>(false);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const fetchApprovals = async (silent: boolean = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/approvals?status=pendiente");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setApprovals(data);
        }
      } else {
        setApprovals((prev) => (prev.length > 0 ? prev : []));
      }
    } catch {
      setApprovals((prev) => (prev.length > 0 ? prev : []));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleManualRefresh = async () => {
    setLoading(true);
    setJustUpdated(false);
    const minDelay = new Promise((resolve) => setTimeout(resolve, 500));
    await Promise.all([fetchApprovals(true), minDelay]);
    setLoading(false);
    setJustUpdated(true);
    setTimeout(() => {
      setJustUpdated(false);
    }, 2000);
  };

  // Conexión push SSE en tiempo real
  useEffect(() => {
    fetchApprovals(false);

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource("/api/approvals/stream");
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "NEW_APPROVAL" || data.type === "APPROVAL_RESOLVED") {
            fetchApprovals(true);
          }
        } catch {
          // Ignorar pings
        }
      };
    } catch {
      // Fallback
    }

    const handleFocus = () => fetchApprovals(true);
    window.addEventListener("focus", handleFocus);

    return () => {
      eventSource?.close();
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  const handleOpenReview = async (item: PendingApproval) => {
    setSelectedApproval(item);
    let auditData: AuditRecordResponse | null = null;
    try {
      const res = await fetch(`/api/invoices/${item.invoice_id}`);
      if (res.ok) auditData = (await res.json()) as AuditRecordResponse;
    } catch {
      // Usar datos locales
    }

    const rec = auditData?.record;
    const inv = rec?.invoice;
    setSelectedInvoice({
      id: item.invoice_id,
      fileName: `${item.invoice_id}.pdf`,
      fileSize: "215 KB",
      invoice_number: inv?.invoice_number || rec?.invoice_number || item.invoice_id.toUpperCase(),
      vendor_name: item.vendor_name || inv?.vendor_name || rec?.vendor_id || "Proveedor registrado",
      vendor_tax_id: inv?.vendor_tax_id || rec?.vendor_id || "TAX-ID-PROV",
      issue_date: inv?.issue_date || rec?.issue_date || new Date().toISOString().split("T")[0],
      due_date: inv?.due_date || rec?.due_date || "-",
      currency: inv?.currency || rec?.currency || "USD",
      total_amount: inv?.total_amount || rec?.total_amount || item.amount_usd,
      total_usd: inv?.total_usd || rec?.total_usd || item.amount_usd,
      concept: rec?.line_items?.[0]?.concept || item.explanation,
      verdict: "ESCALAR",
      reason_code: item.reason_code,
      reason_description: item.explanation,
      failingRuleId: determineFailingRuleId(item.reason_code),
      approvalId: item.id,
    });
  };

  // Deep linking automático con ?invoice_id= o ?id=
  useEffect(() => {
    const targetInvoiceId = searchParams.get("invoice_id") || searchParams.get("id");
    if (!targetInvoiceId || selectedApproval) return;

    const match = approvals.find(
      (a) =>
        a.invoice_id.toLowerCase() === targetInvoiceId.toLowerCase() ||
        a.id.toLowerCase() === targetInvoiceId.toLowerCase(),
    );

    if (match) {
      handleOpenReview(match);
      return;
    }

    if (!loading) {
      fetch(`/api/invoices/${encodeURIComponent(targetInvoiceId)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((auditData) => {
          if (auditData?.record) {
            const rec = auditData.record;
            const inv = rec.invoice;
            const pending: PendingApproval = {
              id: rec.id || `app-${targetInvoiceId}`,
              invoice_id: rec.invoice_id || targetInvoiceId,
              vendor_name: inv?.vendor_name || inv?.vendor_tax_id || "Proveedor",
              amount_usd: rec.amount_usd || inv?.total_usd || 0,
              reason_code: rec.reason_code || "ALERT_THRESHOLD_EXCEEDED",
              explanation: rec.explanation || "Requiere revisión y firma humana",
              requested_at: "Pendiente",
            };
            handleOpenReview(pending);
          }
        })
        .catch(() => {});
    }
  }, [searchParams, approvals, loading, selectedApproval]);

  const handleResolveHuman = async (approved: boolean, justification: string) => {
    if (!selectedApproval || !selectedInvoice) return;
    const isApproved = approved;
    const comment =
      justification.trim() ||
      (isApproved ? "Aprobado por el revisor financiero" : "Rechazado por el revisor");

    try {
      if (!selectedApproval.id.startsWith("app-tc-")) {
        await fetch(`/api/approvals/${selectedApproval.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            approve: isApproved,
            resolved_by: user.name,
            comment,
          }),
        });
      }

      setSelectedInvoice({
        ...selectedInvoice,
        resolved_status: isApproved ? "APROBADO_HUMANO" : "RECHAZADO_HUMANO",
        resolved_reason: comment,
        resolved_at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });

      setApprovals((prev) => prev.filter((item) => item.id !== selectedApproval.id));
      setNotification({
        type: "success",
        text: `Factura de ${selectedApproval.vendor_name || "Proveedor"} ${
          isApproved ? "autorizada para pago" : "rechazada formalmente"
        }.`,
      });
    } catch (err) {
      console.error("Error al resolver aprobación:", err);
      setNotification({
        type: "error",
        text: "Hubo un error al comunicar la decisión con el servidor.",
      });
    }
  };

  const filteredApprovals = approvals.filter((item) => {
    const q = searchTerm.toLowerCase();
    return (
      (item.vendor_name?.toLowerCase().includes(q) ?? false) ||
      item.invoice_id.toLowerCase().includes(q) ||
      item.reason_code.toLowerCase().includes(q) ||
      formatReasonTitle(item.reason_code).toLowerCase().includes(q)
    );
  });

  return {
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
  };
}
