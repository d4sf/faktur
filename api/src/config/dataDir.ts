import { accessSync, constants, mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Prepara el directorio de datos al arrancar y se asegura de que sea
 * **escribible**, no solo de que exista.
 *
 * El chequeo importa: `mkdirSync(..., { recursive: true })` sobre un directorio
 * que ya existe es un no-op que no necesita permiso de escritura. Sin el
 * `accessSync`, un `DATA_DIR` existente pero de solo lectura pasa el arranque en
 * silencio y el EACCES aflora en el primer INSERT de T3, tres requests más
 * tarde y sin relación aparente con la causa.
 *
 * Se valida también `uploads/` porque el entrypoint le hace `chown` a los dos:
 * un bind mount donde el host dejó archivos de una corrida anterior puede dejar
 * `uploads/` con otro dueño aunque `DATA_DIR` esté bien.
 */
export function ensureDataDir(dataDir: string): void {
  const uploads = join(dataDir, "uploads");

  try {
    mkdirSync(dataDir, { recursive: true });
    mkdirSync(uploads, { recursive: true });
    accessSync(dataDir, constants.W_OK);
    accessSync(uploads, constants.W_OK);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const reasons = [code, "ENOTDIR", "EEXIST"].includes(code ?? "")
      ? `código ${code}.`
      : (error as Error).message;

    throw new Error(
      `No se pudo preparar DATA_DIR (${dataDir}): ${reasons}\n` +
        `El proceso corre como uid ${process.getuid?.()}. Revisá el owner del ` +
        `directorio en el host o el entrypoint que lo prepara.`,
    );
  }
}
