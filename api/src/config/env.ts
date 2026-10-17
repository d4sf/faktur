import { resolve } from "node:path";

import { z } from "zod";

/**
 * Variables donde una cadena vacía significa "no configurado". Es la forma en
 * que `.env` y `${VAR:-}` de compose representan "apagado", así que tiene que
 * volverse `undefined` ANTES de validar: si no, `min(1)` rechaza la llave
 * vacía y `.url()` revienta el arranque por una variable que el usuario cree
 * apagada.
 */
const BLANK_IS_UNDEFINED = ["GEMINI_API_KEY", "NOTIFIER_WEBHOOK_URL"] as const;

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.string().min(1).default("info"),
  WEB_DIST: z.string().min(1).default(resolve(process.cwd(), "web/dist")),
  DATA_DIR: z.string().min(1).default(resolve(process.cwd(), "data")),
  GEMINI_MODEL: z.string().min(1).default("gemini-3.8-flash"),
  GEMINI_API_KEY: z.string().min(1).optional(),
  NOTIFIER_WEBHOOK_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof schema>;

/** Quita las claves opcionales que llegaron en blanco. */
function normalize(source: NodeJS.ProcessEnv): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    const isBlank = value.trim() === "";
    if (isBlank && (BLANK_IS_UNDEFINED as readonly string[]).includes(key)) continue;
    normalized[key] = value;
  }

  return normalized;
}

/**
 * Lee y valida el entorno. Falla al arrancar nombrando todas las variables
 * malas de una sola vez: quien lo arregla lo hace en un intento, no de a uno.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = schema.safeParse(normalize(source));

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(`Configuración de entorno inválida:\n${details}`);
  }

  return result.data;
}

/**
 * La llave solo hace falta para extraer (T10). El motor de reglas, el CSV y la
 * bandeja funcionan sin ella, así que el arranque no la exige y este helper sí.
 */
export function requireGeminiKey(env: Env): string {
  if (!env.GEMINI_API_KEY) {
    throw new Error(
      "Falta GEMINI_API_KEY. La extracción de facturas la necesita.\n" +
        "Definila en .env o como variable del entorno. El resto del sistema\n" +
        "(motor de reglas, CSV, bandeja) funciona sin ella.",
    );
  }

  return env.GEMINI_API_KEY;
}
