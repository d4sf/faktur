import type Database from "better-sqlite3";

export class CurrencyNotAllowedError extends Error {
  constructor(currency: string) {
    super(`currency_not_allowed: ${currency}`);
    this.name = "CurrencyNotAllowedError";
  }
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Convierte a USD con la tasa vigente en `fx_rates` y la devuelve para congelarla en la fila.
 *
 * Si la moneda no está en la tabla o en `allowed_currencies` de la política activa, lanza
 * `currency_not_allowed`: la capa de decisión lo convierte en FRENAR, nunca en un 500.
 */
export function toUsd(
  amount: number,
  currency: string,
  db: Database.Database,
): { total_usd: number; fx_rate_used: number } {
  const policy = db.prepare("SELECT allowed_currencies FROM policies WHERE is_active = 1").get() as
    { allowed_currencies: string } | undefined;
  const allowed: string[] = policy === undefined ? [] : JSON.parse(policy.allowed_currencies);
  if (!allowed.includes(currency)) throw new CurrencyNotAllowedError(currency);

  const row = db.prepare("SELECT rate_to_usd FROM fx_rates WHERE currency = ?").get(currency) as
    { rate_to_usd: number } | undefined;
  if (row === undefined) throw new CurrencyNotAllowedError(currency);

  return { total_usd: round2(amount * row.rate_to_usd), fx_rate_used: row.rate_to_usd };
}
