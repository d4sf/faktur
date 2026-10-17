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
 * Solo lanza si la moneda no tiene tasa: sin número no hay factura que persistir. Una moneda
 * con tasa pero fuera de `allowed_currencies` se persiste igual y el motor la frena con
 * `ERR_INVALID_DATA` (RI-7), dejando la decisión auditable.
 */
export function toUsd(
  amount: number,
  currency: string,
  db: Database.Database,
): { total_usd: number; fx_rate_used: number } {
  const row = db.prepare("SELECT rate_to_usd FROM fx_rates WHERE currency = ?").get(currency) as
    { rate_to_usd: number } | undefined;
  if (row === undefined) throw new CurrencyNotAllowedError(currency);

  return { total_usd: round2(amount * row.rate_to_usd), fx_rate_used: row.rate_to_usd };
}
