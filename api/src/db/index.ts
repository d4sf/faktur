import Database from "better-sqlite3";

import { applySchema } from "./schema.js";
import { seed } from "./seed.js";

let db: Database.Database | null = null;
let dbPath: string | null = null;

const NOT_LOADED = "DB no inicializada: llamar loadDb(path) primero";

/**
 * Abre (o crea) la base en `path`, aplica el schema y siembra los datos iniciales.
 * Idempotente: si ya hay una base cargada, la devuelve sin re-abrirla.
 *
 * `path` puede ser `":memory:"` para tests (cada llamada a `closeDb()` + `loadDb()` crea una base fresca).
 */
export function loadDb(path: string): Database.Database {
  if (db) return db;
  const instance = new Database(path);
  instance.pragma("foreign_keys = ON");
  applySchema(instance);
  seed(instance);
  db = instance;
  dbPath = path;
  return db;
}

/**
 * Devuelve la base cargada. Lanza si no se ha llamado `loadDb` antes.
 */
export function getDb(): Database.Database {
  if (!db) throw new Error(NOT_LOADED);
  return db;
}

/**
 * Devuelve la ruta con la que se abrió la base actual. Lanza si no hay base cargada.
 */
export function getDbPath(): string {
  if (!db || dbPath === null) throw new Error(NOT_LOADED);
  return dbPath;
}

/**
 * Cierra la base y libera la instancia. Necesario entre tests para no compartir estado.
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
    dbPath = null;
  }
}
