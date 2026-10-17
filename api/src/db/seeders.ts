import type Database from "better-sqlite3";

import { seedDemoSet } from "./demoSeed.js";
import { seed } from "./seed.js";

export type SeedProfile = "reference" | "demo";

export const SEED_PROFILES: readonly SeedProfile[] = ["reference", "demo"];

/** Las 12 tablas del modelo, en orden de FK (padres antes que hijos). */
export const TABLES: readonly string[] = [
  "categories",
  "vendors",
  "policies",
  "policy_category_budgets",
  "fx_rates",
  "invoices",
  "ingest_attempts",
  "line_items",
  "decisions",
  "approvals",
  "ledger_entries",
  "notifications",
];

export type TableCounts = Record<string, number>;

export interface SeedResult {
  profile: SeedProfile;
  counts: TableCounts;
  verdicts: Record<string, string>;
  approvals_pending: number;
}

/**
 * Cuenta filas de todas las tablas del modelo. Los nombres salen de `TABLES`, nunca de
 * input externo.
 */
export function tableCounts(db: Database.Database): TableCounts {
  const counts: TableCounts = {};
  for (const table of TABLES) {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
    counts[table] = row.n;
  }
  return counts;
}

function approvalsPending(db: Database.Database): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM approvals WHERE status = 'PENDIENTE'")
    .get() as { n: number };
  return row.n;
}

/**
 * Aplica un perfil de seed sobre una base con schema ya aplicado.
 *
 * - `reference`: datos base (categorías, vendors, policy v1, budgets, fx). Idempotente.
 * - `demo`: datos base + los 12 TC sembrados por el pipeline real, con sus aprobaciones.
 */
export function runSeedProfile(db: Database.Database, profile: SeedProfile): SeedResult {
  switch (profile) {
    case "reference": {
      seed(db);
      return {
        profile,
        counts: tableCounts(db),
        verdicts: {},
        approvals_pending: approvalsPending(db),
      };
    }
    case "demo": {
      const { verdicts } = seedDemoSet(db);
      return {
        profile,
        counts: tableCounts(db),
        verdicts,
        approvals_pending: approvalsPending(db),
      };
    }
    default:
      throw new Error(`seed_profile_invalido: ${profile}`);
  }
}
