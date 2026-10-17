import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ensureDataDir } from "./dataDir.js";

const MODULE_URL = new URL("./dataDir.ts", import.meta.url).href;

function scratch(): string {
  return join(tmpdir(), `faktur-datadir-${process.pid}-${Math.random().toString(36).slice(2)}`);
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * El contenedor de dev corre como root y root ignora los permisos, así que un
 * test que se apoye en el chmod del proceso padre daría verde en falso. El caso
 * se corre en un hijo que baja a `nobody`, que sí lo respeta.
 */
function runAsNobody(dataDir: string): { status: number | null; output: string } {
  const script = `import(${JSON.stringify(MODULE_URL)}).then((m) => m.ensureDataDir(${JSON.stringify(dataDir)}))`;

  const result = spawnSync(process.execPath, ["--import", "tsx", "--eval", script], {
    uid: 65534,
    gid: 65534,
    encoding: "utf8",
  });

  return { status: result.status, output: `${result.stderr ?? ""}${result.stdout ?? ""}` };
}

test("crea DATA_DIR y uploads cuando no existen", () => {
  const root = scratch();
  const dataDir = join(root, "data");

  try {
    ensureDataDir(dataDir);

    assert.ok(isDirectory(dataDir));
    assert.ok(isDirectory(join(dataDir, "uploads")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const isRoot = typeof process.getuid === "function" && process.getuid() === 0;

test(
  "un directorio existente sin permiso de escritura lanza nombrando la ruta",
  { skip: !isRoot },
  () => {
    const root = scratch();
    const dataDir = join(root, "data");

    try {
      mkdirSync(join(dataDir, "uploads"), { recursive: true });
      // 0o500 = lectura y recorrido, sin escritura. `mkdirSync` con `recursive`
      // sobre un directorio existente es un no-op que no pide permiso, así que sin
      // el chequeo de escritura explícito este caso pasa y el EACCES aflora en el
      // primer INSERT de T3.
      chmodSync(dataDir, 0o500);

      const { status, output } = runAsNobody(dataDir);

      assert.notEqual(status, 0, `el hijo debería haber fallado; salida: ${output}`);
      assert.match(output, /DATA_DIR/);
      assert.ok(output.includes(dataDir), `el mensaje debería nombrar la ruta: ${output}`);
    } finally {
      chmodSync(dataDir, 0o700);
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  "un directorio escribible no falla aunque el proceso no sea el owner",
  { skip: !isRoot },
  () => {
    const root = scratch();
    const dataDir = join(root, "data");

    try {
      mkdirSync(dataDir, { recursive: true });
      chmodSync(dataDir, 0o777);

      const { status } = runAsNobody(dataDir);

      assert.equal(status, 0, "un 0777 debería ser escribible para cualquiera");
    } finally {
      chmodSync(dataDir, 0o700);
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test("un archivo donde va el directorio lanza en vez de propagar errno crudo", () => {
  const root = scratch();
  const dataDir = join(root, "data");

  try {
    mkdirSync(root, { recursive: true });
    writeFileSync(dataDir, "soy un archivo");

    assert.throws(() => ensureDataDir(dataDir), /DATA_DIR/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
