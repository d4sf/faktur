import type Database from "better-sqlite3";

import type { AuditRecordView } from "../repositories/invoices.js";
import { listAuditRecords } from "../repositories/invoices.js";
import { budgetRemaining } from "../repositories/ledger.js";

export type AuditMetrics = {
  budget_remaining: number;
  threshold_limit: number;
  total_processed: number;
  touchless_rate: number;
};

export type AuditTrail = {
  metrics: AuditMetrics;
  records: AuditRecordView[];
};

/**
 * `total_processed` cuenta facturas con decisión, no decisiones: una re-evaluación no infla
 * el denominador. `touchless_rate` es PAGAR / total a un decimal y vale 0 en base vacía, sin
 * división por cero.
 */
export function getMetrics(db: Database.Database): AuditMetrics {
  const counts = db
    .prepare(
      `SELECT COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN verdict = 'PAGAR' THEN 1 ELSE 0 END), 0) AS pagar
       FROM (
         SELECT (
           SELECT d.verdict FROM decisions d WHERE d.invoice_id = i.id
           ORDER BY d.decided_at DESC, d.id DESC LIMIT 1
         ) AS verdict
         FROM invoices i
       )
       WHERE verdict IS NOT NULL`,
    )
    .get() as { total: number; pagar: number };

  const policy = db
    .prepare("SELECT auto_approval_threshold_usd FROM policies WHERE is_active = 1")
    .get() as { auto_approval_threshold_usd: number };

  return {
    budget_remaining: budgetRemaining(db),
    threshold_limit: policy.auto_approval_threshold_usd,
    total_processed: counts.total,
    touchless_rate: counts.total === 0 ? 0 : Math.round((counts.pagar / counts.total) * 1000) / 10,
  };
}

export function getAuditTrail(db: Database.Database): AuditTrail {
  const { items } = listAuditRecords(db, { limit: 200, offset: 0 });
  return { metrics: getMetrics(db), records: items };
}
