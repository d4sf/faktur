import { useCallback, useEffect, useState } from "react";

import type { AuditRecordView, AuditTrail } from "@/types/audit";
import type { PolicySpec } from "@/types/policy";

export function usePolicy() {
  const [policy, setPolicy] = useState<PolicySpec | null>(null);
  const [records, setRecords] = useState<AuditRecordView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [policyRes, auditRes] = await Promise.all([
        fetch("/api/policy"),
        fetch("/api/audit-trail"),
      ]);
      if (!policyRes.ok) throw new Error(`Policy: HTTP ${policyRes.status}`);
      if (!auditRes.ok) throw new Error(`Audit: HTTP ${auditRes.status}`);
      const policyData: PolicySpec = await policyRes.json();
      const auditData: AuditTrail = await auditRes.json();
      setPolicy(policyData);
      setRecords(auditData.records);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { policy, records, loading, error, refresh };
}
