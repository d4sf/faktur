import { randomUUID } from "node:crypto";

import type Database from "better-sqlite3";

import { getDb } from "../db/index.js";
import { loadEnv } from "../config/env.js";

export type NotificationChannel = "CONSOLE" | "WEBHOOK";

export type NotificationInput = {
  invoice_id: string;
  decision_id: string;
  channel: NotificationChannel;
  reason_code: string;
  explanation: string;
  amount_usd: number;
  vendor_name?: string;
};

export interface Notifier {
  notify(input: NotificationInput): Promise<void>;
}

export class ConsoleNotifier implements Notifier {
  async notify(input: NotificationInput): Promise<void> {
    console.log(
      `[notifier] ${input.reason_code} · ${input.vendor_name ?? "proveedor"} · ` +
        `$${input.amount_usd.toFixed(2)} — ${input.explanation}`,
    );
  }
}

export class WebhookNotifier implements Notifier {
  constructor(private readonly url: string) {}

  async notify(input: NotificationInput): Promise<void> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error(`webhook_failed: ${response.status}`);
  }
}

export function defaultNotifier(): { notifier: Notifier; channel: NotificationChannel } {
  const url = loadEnv().NOTIFIER_WEBHOOK_URL;
  if (url === undefined) return { notifier: new ConsoleNotifier(), channel: "CONSOLE" };
  return { notifier: new WebhookNotifier(url), channel: "WEBHOOK" };
}

/** Outbox: la fila nace `PENDIENTE` en la misma transacción que la decisión ESCALAR. */
export function queueNotification(input: NotificationInput): string {
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO notifications (id, invoice_id, decision_id, channel, payload_json, status, created_at)
       VALUES (?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      input.invoice_id,
      input.decision_id,
      input.channel,
      JSON.stringify(input),
      "PENDIENTE",
      new Date().toISOString(),
    );
  return id;
}

/**
 * Envía el aviso y sella el outbox. **Nunca lanza**: un webhook caído deja `FALLIDA` y la
 * decisión ya commiteada no se revierte (T17).
 */
export async function dispatchNotification(
  id: string,
  notifier: Notifier,
  db: Database.Database,
): Promise<void> {
  try {
    const row = db
      .prepare("SELECT payload_json, status FROM notifications WHERE id = ?")
      .get(id) as { payload_json: string; status: string } | undefined;
    if (row === undefined || row.status !== "PENDIENTE") return;

    try {
      await notifier.notify(JSON.parse(row.payload_json) as NotificationInput);
      db.prepare("UPDATE notifications SET status = 'ENVIADA' WHERE id = ?").run(id);
    } catch {
      try {
        db.prepare("UPDATE notifications SET status = 'FALLIDA' WHERE id = ?").run(id);
      } catch {
        // La base ya se cerró (fin de test/proceso): el outbox queda PENDIENTE.
      }
    }
  } catch {
    // Nunca debe rechazar: la decisión ya está commiteada.
  }
}

export function notificationStatus(id: string, db: Database.Database): string | null {
  const row = db.prepare("SELECT status FROM notifications WHERE id = ?").get(id) as
    { status: string } | undefined;
  return row?.status ?? null;
}
