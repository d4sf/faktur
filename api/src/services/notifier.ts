import { randomUUID } from "node:crypto";

import type Database from "better-sqlite3";

import { getDb } from "../db/index.js";
import { loadEnv } from "../config/env.js";
import { getLatestAiExplanationByDecision } from "../repositories/aiExplanations.js";
import { getSlackWebhookUrl } from "./integrations.js";

export type NotificationChannel = "CONSOLE" | "WEBHOOK";

export type NotificationInput = {
  invoice_id: string;
  decision_id: string;
  channel: NotificationChannel;
  reason_code: string;
  explanation: string;
  amount_usd: number;
  vendor_name?: string;
  ai_explanation?: string;
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

export class SlackNotifier implements Notifier {
  constructor(private readonly url: string) {}
  async notify(input: NotificationInput): Promise<void> {
    const lines: string[] = [];
    lines.push(`*Factura ${input.invoice_id} — ${input.reason_code}*`);
    if (input.vendor_name) lines.push(`Proveedor: ${input.vendor_name}`);
    lines.push(`Monto: $${input.amount_usd.toFixed(2)} USD`);
    lines.push(`Motivo: ${input.explanation}`);
    if (input.ai_explanation) {
      lines.push(`Explicación IA: ${input.ai_explanation}`);
    }
    const text = lines.join("\n");
    const response = await fetch(this.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) throw new Error(`slack_webhook_failed: ${response.status}`);
  }
}

export function defaultNotifier(db: Database.Database): {
  notifier: Notifier;
  channel: NotificationChannel;
} {
  const slackUrl = getSlackWebhookUrl(db);
  if (slackUrl !== null) {
    return { notifier: new SlackNotifier(slackUrl), channel: "WEBHOOK" };
  }
  const envUrl = loadEnv().NOTIFIER_WEBHOOK_URL;
  if (envUrl !== undefined) {
    return { notifier: new WebhookNotifier(envUrl), channel: "WEBHOOK" };
  }
  return { notifier: new ConsoleNotifier(), channel: "CONSOLE" };
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

/** Helper: devuelve la explicación con IA cacheada para una decisión, si existe. */
export function getCachedAiExplanation(
  decisionId: string,
  db: Database.Database,
): string | undefined {
  const row = getLatestAiExplanationByDecision(decisionId, db);
  return row?.explanation;
}
