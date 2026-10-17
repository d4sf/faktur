import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

import { closeDb, getDb, loadDb } from "./index.js";
import { runSeedProfile } from "./seeders.js";
import type { SeedProfile, SeedResult } from "./seeders.js";

export interface ResetOptions {
  dbPath: string;
  profile: SeedProfile;
}

export interface ResetResult extends SeedResult {
  deleted_files: string[];
  cleared_uploads: number;
  duration_ms: number;
}

/**
 * Borra el archivo SQLite y sus sidecars WAL/SHM. Devuelve solo las rutas que existían.
 */
export function removeDbFiles(dbPath: string): string[] {
  const existing = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`].filter((path) => existsSync(path));
  for (const path of existing) rmSync(path, { force: true });
  return existing;
}

/**
 * Vacía el directorio de uploads (sin borrar el directorio) y devuelve cuántas entradas
 * se borraron. Lo crea si no existe para dejar el estado consistente.
 */
export function clearUploads(dir: string): number {
  mkdirSync(dir, { recursive: true });
  const entries = readdirSync(dir);
  for (const entry of entries) rmSync(join(dir, entry), { recursive: true, force: true });
  return entries.length;
}

/**
 * Reset total de la base: cierra, borra archivo + sidecars, vacía uploads, reabre
 * (schema + seed base) y aplica el perfil pedido. Es totalmente síncrono: better-sqlite3
 * lo es y no se puede ceder el event loop entre cerrar y reabrir.
 */
export function resetDatabase(options: ResetOptions): ResetResult {
  const { dbPath, profile } = options;
  if (dbPath === ":memory:") throw new Error("reset_no_soportado_en_memoria");

  const startedAt = Date.now();
  closeDb();
  const deleted_files = removeDbFiles(dbPath);
  const cleared_uploads = clearUploads(join(dirname(dbPath), "uploads"));
  loadDb(dbPath);
  const seeded = runSeedProfile(getDb(), profile);

  return {
    ...seeded,
    deleted_files,
    cleared_uploads,
    duration_ms: Date.now() - startedAt,
  };
}
