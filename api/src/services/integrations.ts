import { z } from "zod";

import type Database from "better-sqlite3";

import { loadEnv } from "../config/env.js";
import { deleteSetting, getSetting, setSetting } from "../repositories/settings.js";

export const SLACK_WEBHOOK_KEY = "slack_webhook_url";

const UrlSchema = z.string().url().refine((u) => u.startsWith("https://"), {
  message: "la URL debe usar https://",
});

export class InvalidIntegrationUrlError extends Error {
  constructor(detail: string) {
    super(`invalid_integration_url: ${detail}`);
    this.name = "InvalidIntegrationUrlError";
  }
}

export function getSlackWebhookUrl(db: Database.Database): string | null {
  const fromDb = getSetting(SLACK_WEBHOOK_KEY, db);
  if (fromDb !== null && fromDb.trim() !== "") return fromDb.trim();
  const fromEnv = loadEnv().NOTIFIER_WEBHOOK_URL;
  return fromEnv ?? null;
}

export function setSlackWebhookUrl(url: string, db: Database.Database): void {
  const parsed = UrlSchema.safeParse(url.trim());
  if (!parsed.success) {
    throw new InvalidIntegrationUrlError(parsed.error.issues.map((i) => i.message).join("; "));
  }
  setSetting(SLACK_WEBHOOK_KEY, parsed.data, db);
}

export function deleteSlackWebhookUrl(db: Database.Database): void {
  deleteSetting(SLACK_WEBHOOK_KEY, db);
}

export async function testSlackWebhook(
  url: string,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const parsed = UrlSchema.safeParse(url.trim());
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  try {
    const response = await fetch(parsed.data, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Ping de prueba — Blinka PayAgent" }),
    });
    if (!response.ok) {
      return { ok: false, status: response.status, error: `webhook_failed: ${response.status}` };
    }
    return { ok: true, status: response.status };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}