import { join } from "node:path";

import { ensureDataDir } from "../config/dataDir.js";
import { loadEnv } from "../config/env.js";
import { closeDb, loadDb } from "./index.js";
import { seedDemoSet } from "./demoSeed.js";

const env = loadEnv();
ensureDataDir(env.DATA_DIR);

const db = loadDb(join(env.DATA_DIR, "faktur.db"));
try {
  const { seeded, verdicts } = seedDemoSet(db);
  const values = Object.values(verdicts);
  const pendientes = (
    db.prepare("SELECT COUNT(*) AS n FROM approvals WHERE status = 'PENDIENTE'").get() as {
      n: number;
    }
  ).n;

  console.log(
    JSON.stringify(
      {
        total: seeded,
        pagar: values.filter((v) => v === "PAGAR").length,
        frenar: values.filter((v) => v === "FRENAR").length,
        escalar: values.filter((v) => v === "ESCALAR").length,
        pendientes,
      },
      null,
      2,
    ),
  );
} finally {
  closeDb();
}
