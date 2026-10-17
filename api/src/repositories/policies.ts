import type Database from "better-sqlite3";

import { PolicySpec } from "../domain/policy.js";

export type PolicyRow = {
  version: string;
  auto_approval_threshold_usd: number;
  monthly_budget_usd: number;
  vendor_drift_factor: number;
  min_extraction_confidence: number;
  allowed_currencies: string;
  is_active: number;
  created_at: string;
  created_by: string;
  comment: string;
};

/** La política activa en la base: es la fuente de la `policy_version` que se congela. */
export function getActivePolicyRow(db: Database.Database): PolicyRow | null {
  const row = db.prepare("SELECT * FROM policies WHERE is_active = 1").get();
  return (row as PolicyRow | undefined) ?? null;
}

export function getCategoryBudgets(db: Database.Database, version: string): Record<string, number> {
  const rows = db
    .prepare("SELECT category, budget_usd FROM policy_category_budgets WHERE policy_version = ?")
    .all(version) as Array<{ category: string; budget_usd: number }>;
  return Object.fromEntries(rows.map((r) => [r.category, r.budget_usd]));
}

/** Arma el `PolicySpec` del dominio a partir de una fila de `policies`. */
function specFromRow(db: Database.Database, row: PolicyRow): PolicySpec {
  return PolicySpec.parse({
    version: row.version,
    created_at: row.created_at.slice(0, 10),
    created_by: row.created_by,
    comment: row.comment,
    auto_approval_threshold_usd: row.auto_approval_threshold_usd,
    monthly_budget_usd: row.monthly_budget_usd,
    vendor_drift_factor: row.vendor_drift_factor,
    min_extraction_confidence: row.min_extraction_confidence,
    allowed_currencies: JSON.parse(row.allowed_currencies),
    category_budgets: getCategoryBudgets(db, row.version),
  });
}

export function getPolicyRowByVersion(db: Database.Database, version: string): PolicyRow | null {
  const row = db.prepare("SELECT * FROM policies WHERE version = ?").get(version);
  return (row as PolicyRow | undefined) ?? null;
}

/** Arma el `PolicySpec` del dominio a partir de la fila activa. */
export function getActivePolicySpec(db: Database.Database): PolicySpec {
  const row = getActivePolicyRow(db);
  if (row === null) throw new Error("no_active_policy");
  return specFromRow(db, row);
}

/** La versión congelada de una decisión: la regla de excepción re-chequea con esta, no con la activa. */
export function getPolicySpecByVersion(db: Database.Database, version: string): PolicySpec {
  const row = getPolicyRowByVersion(db, version);
  if (row === null) throw new Error("policy_not_found");
  return specFromRow(db, row);
}

export type CandidatePolicy = Omit<PolicySpec, "version">;

/**
 * Crea la versión N+1 inmutable y desactiva la anterior en la misma transacción. La versión
 * anterior no se edita: las decisiones ya tomadas siguen apuntando a ella (S16).
 */
export function createPolicyVersion(
  db: Database.Database,
  candidate: CandidatePolicy,
): { version: string } {
  return db.transaction(() => {
    const max = db
      .prepare("SELECT COALESCE(MAX(CAST(SUBSTR(version, 2) AS INTEGER)), 0) AS n FROM policies")
      .get() as { n: number };
    const version = `v${max.n + 1}`;

    db.prepare("UPDATE policies SET is_active = 0 WHERE is_active = 1").run();
    db.prepare(
      `INSERT INTO policies (version, auto_approval_threshold_usd, monthly_budget_usd,
        vendor_drift_factor, min_extraction_confidence, allowed_currencies, is_active,
        created_at, created_by, comment)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      version,
      candidate.auto_approval_threshold_usd,
      candidate.monthly_budget_usd,
      candidate.vendor_drift_factor,
      candidate.min_extraction_confidence,
      JSON.stringify(candidate.allowed_currencies),
      1,
      candidate.created_at,
      candidate.created_by,
      candidate.comment,
    );

    const insertBudget = db.prepare(
      `INSERT INTO policy_category_budgets (policy_version, category, budget_usd)
       VALUES (?,?,?)`,
    );
    for (const [category, budget] of Object.entries(candidate.category_budgets)) {
      insertBudget.run(version, category, budget);
    }

    return { version };
  })();
}
