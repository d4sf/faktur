import type Database from "better-sqlite3";

export function getSetting(key: string, db: Database.Database): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string, db: Database.Database): void {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?,?,?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, value, new Date().toISOString());
}

export function deleteSetting(key: string, db: Database.Database): void {
  db.prepare("DELETE FROM settings WHERE key = ?").run(key);
}
