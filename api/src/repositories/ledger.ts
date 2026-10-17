import { randomUUID } from "node:crypto";

import type Database from "better-sqlite3";

import { getDb } from "../db/index.js";
import type { BudgetState } from "../domain/ruleEngine.js";

export type NewLedgerEntry = {
  invoice_id: string;
  decision_id: string;
  policy_version: string;
  amount_usd: number;
};

/**
 * Escribe el compromiso de pago. Es idempotente por `decision_id`: un doble clic devuelve
 * `null` y no duplica el asiento. Sólo PAGAR debe llamarlo (RI-5).
 *
 * Usa la conexión global para poder participar de la transacción que abre `decideInvoice` o
 * la aprobación: un `INSERT` fuera de esa transacción no se revertiría con el cierre.
 */
export function insertLedgerEntry(input: NewLedgerEntry): string | null {
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM ledger_entries WHERE decision_id = ?")
    .get(input.decision_id) as { id: string } | undefined;
  if (existing !== undefined) return null;

  const id = randomUUID();
  db.prepare(
    `INSERT INTO ledger_entries (id, invoice_id, decision_id, policy_version, amount_usd,
      entry_type, created_at)
     VALUES (?,?,?,?,?,?,?)`,
  ).run(
    id,
    input.invoice_id,
    input.decision_id,
    input.policy_version,
    input.amount_usd,
    "COMPROMISO_PAGAR",
    new Date().toISOString(),
  );
  return id;
}

export function countLedger(db: Database.Database): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM ledger_entries").get() as { n: number }).n;
}

/** `monthlySpent` y `categorySpent` salen del ledger, no de las decisiones pendientes. */
export function getBudgetState(db: Database.Database): BudgetState {
  const budget = db
    .prepare("SELECT monthly_budget_usd FROM policies WHERE is_active = 1")
    .get() as { monthly_budget_usd: number };
  const monthly = db
    .prepare("SELECT COALESCE(SUM(amount_usd), 0) AS spent FROM ledger_entries")
    .get() as { spent: number };
  const byCategory = db
    .prepare(
      `SELECT v.category AS category, SUM(l.amount_usd) AS spent
       FROM ledger_entries l
       JOIN invoices i ON i.id = l.invoice_id
       JOIN vendors v ON v.id = i.vendor_id
       GROUP BY v.category`,
    )
    .all() as Array<{ category: string; spent: number }>;

  return {
    monthlySpent: monthly.spent,
    monthlyBudget: budget.monthly_budget_usd,
    categorySpent: Object.fromEntries(byCategory.map((r) => [r.category, r.spent])),
  };
}

export function budgetRemaining(db: Database.Database): number {
  const state = getBudgetState(db);
  return Math.round((state.monthlyBudget - state.monthlySpent) * 100) / 100;
}
