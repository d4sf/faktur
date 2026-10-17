import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

const NOW = "2026-10-17T00:00:00Z";

const CATEGORIES = [
  "Infraestructura",
  "Diseno",
  "Marketing",
  "Legal",
  "Software",
  "Retail",
] as const;

const VENDORS: Array<{
  tax_id: string;
  display_name: string;
  category: string;
  status: "ALLOWLISTED" | "BLOCKLISTED";
  historical_avg_usd: number;
}> = [
  {
    tax_id: "CLOUD-SERVERS-INC",
    display_name: "CloudServers Inc",
    category: "Infraestructura",
    status: "ALLOWLISTED",
    historical_avg_usd: 420,
  },
  {
    tax_id: "DEVSTUDIO-LATAM",
    display_name: "DevStudio Latam",
    category: "Diseno",
    status: "ALLOWLISTED",
    historical_avg_usd: 850,
  },
  {
    tax_id: "GROWTH-AGENCY",
    display_name: "Growth Agency",
    category: "Marketing",
    status: "ALLOWLISTED",
    historical_avg_usd: 3000,
  },
  {
    tax_id: "LEGAL-GLOBAL",
    display_name: "Legal Global",
    category: "Legal",
    status: "ALLOWLISTED",
    historical_avg_usd: 4000,
  },
  {
    tax_id: "FREELANCE-DESIGN",
    display_name: "Freelance Design",
    category: "Diseno",
    status: "ALLOWLISTED",
    historical_avg_usd: 480,
  },
  {
    tax_id: "SAAS-TOOLS-LTD",
    display_name: "SaaS Tools Ltd",
    category: "Software",
    status: "ALLOWLISTED",
    historical_avg_usd: 120,
  },
  {
    tax_id: "AWS-AMAZON",
    display_name: "AWS Amazon",
    category: "Infraestructura",
    status: "ALLOWLISTED",
    historical_avg_usd: 350,
  },
  {
    tax_id: "VENTA-POS-DUO",
    display_name: "Venta Pos Duo",
    category: "Retail",
    status: "BLOCKLISTED",
    historical_avg_usd: 0,
  },
];

const BUDGETS: Array<{ category: string; budget_usd: number }> = [
  { category: "Infraestructura", budget_usd: 1500 },
  { category: "Diseno", budget_usd: 1000 },
  { category: "Marketing", budget_usd: 4000 },
  { category: "Legal", budget_usd: 3000 },
  { category: "Software", budget_usd: 500 },
  { category: "Retail", budget_usd: 0 },
];

const FX_RATES: Array<{ currency: string; rate_to_usd: number }> = [
  { currency: "USD", rate_to_usd: 1.0 },
  { currency: "MXN", rate_to_usd: 0.055 },
  { currency: "COP", rate_to_usd: 0.00024 },
  { currency: "EUR", rate_to_usd: 1.08 },
];

/**
 * Siembra la base con los datos iniciales del MVP.
 *
 * Idempotente: usa `INSERT OR IGNORE` para que re-ejecutar no duplique.
 * Verifica los conteos al final y lanza si no coinciden, para que un seed
 * parcial no pase desapercibido.
 */
export function seed(db: Database.Database): void {
  // Si v1 ya existe, la base ya fue sembrada (posiblemente con datos demo encima).
  // No re-sembrar para no duplicar ni fallar en los conteos.
  const existing = db.prepare("SELECT version FROM policies WHERE version = 'v1'").get();
  if (existing) return;

  const insertCategory = db.prepare("INSERT OR IGNORE INTO categories (name) VALUES (?)");
  for (const cat of CATEGORIES) {
    insertCategory.run(cat);
  }

  const insertVendor = db.prepare(
    "INSERT OR IGNORE INTO vendors (id, tax_id, display_name, category, status, historical_avg_usd, first_seen_at, last_seen_at) VALUES (?,?,?,?,?,?,?,?)",
  );
  for (const v of VENDORS) {
    insertVendor.run(
      randomUUID(),
      v.tax_id,
      v.display_name,
      v.category,
      v.status,
      v.historical_avg_usd,
      NOW,
      NOW,
    );
  }

  db.prepare(
    "INSERT OR IGNORE INTO policies (version, auto_approval_threshold_usd, monthly_budget_usd, vendor_drift_factor, min_extraction_confidence, allowed_currencies, is_active, created_at, created_by, comment) VALUES (?,?,?,?,?,?,?,?,?,?)",
  ).run(
    "v1",
    1000.0,
    5000.0,
    1.4,
    0.7,
    JSON.stringify(["USD", "MXN", "COP", "EUR"]),
    1,
    NOW,
    "KAY/O",
    "Version 1 congelada del MVP.",
  );

  const insertBudget = db.prepare(
    "INSERT OR IGNORE INTO policy_category_budgets (policy_version, category, budget_usd) VALUES (?,?,?)",
  );
  for (const b of BUDGETS) {
    insertBudget.run("v1", b.category, b.budget_usd);
  }

  const insertFx = db.prepare(
    "INSERT OR IGNORE INTO fx_rates (currency, rate_to_usd, as_of) VALUES (?,?,?)",
  );
  for (const fx of FX_RATES) {
    insertFx.run(fx.currency, fx.rate_to_usd, "2026-10-17");
  }

  // Verificación estricta de conteos.
  const checks: Array<{ table: string; expected: number }> = [
    { table: "categories", expected: 6 },
    { table: "vendors", expected: 8 },
    { table: "policies", expected: 1 },
    { table: "policy_category_budgets", expected: 6 },
    { table: "fx_rates", expected: 4 },
  ];
  for (const { table, expected } of checks) {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
    if (row.n !== expected) {
      throw new Error(`seed: ${table} tiene ${row.n} filas, esperaba ${expected}`);
    }
  }

  // Verificación de IDs específicos.
  const vendorTaxIds = db
    .prepare("SELECT tax_id FROM vendors ORDER BY tax_id")
    .all()
    .map((r) => (r as { tax_id: string }).tax_id);
  const expectedTaxIds = VENDORS.map((v) => v.tax_id).sort();
  if (JSON.stringify(vendorTaxIds) !== JSON.stringify(expectedTaxIds)) {
    throw new Error(`seed: vendors tax_ids no coinciden. Got: ${vendorTaxIds.join(", ")}`);
  }

  const policyVersion = (db.prepare("SELECT version FROM policies").get() as { version: string })
    .version;
  if (policyVersion !== "v1") {
    throw new Error(`seed: policy version es ${policyVersion}, esperaba v1`);
  }

  const marketingBudget = (
    db
      .prepare("SELECT budget_usd FROM policy_category_budgets WHERE category = 'Marketing'")
      .get() as { budget_usd: number }
  ).budget_usd;
  if (marketingBudget !== 4000) {
    throw new Error(`seed: Marketing budget es ${marketingBudget}, esperaba 4000`);
  }
}
