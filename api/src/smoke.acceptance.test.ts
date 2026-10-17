/**
 * @file smoke.acceptance.test.ts
 * @description T23 — Smoke end-to-end y verificación fail-closed para el MVP Faktur / Blinka PayAgent.
 * Valida de forma exhaustiva los 6 criterios del checklist de aceptación del MVP §12 contra una base
 * de datos y DATA_DIR temporales independientes:
 *
 * 1. Autonomía (STP / Touchless): Subir factura válida y llegar a PAGAR sin intervención humana.
 * 2. Reglas configurables: Mover el umbral y simular con preview que PAGAR se convierte en ESCALAR.
 * 3. Seguridad: Factura duplicada queda FRENADA con código ERR_DUPLICATE_INVOICE y motivo legible.
 * 4. Human-in-the-loop: Factura escalada aparece en bandeja, se aprueba y se registra quién y cuándo.
 * 5. Cero pagos indebidos (Fail-closed): Factura con datos críticos faltantes nunca se paga (FRENAR).
 * 6. Explicabilidad: Reporte CSV con las 14 columnas canónicas y motivo en lenguaje natural.
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import type { FastifyInstance } from "fastify";

import { buildApp } from "./app.js";
import { closeDb, loadDb } from "./db/index.js";
import { REPORT_COLUMNS } from "./services/report.js";

const TC01_PAYLOAD = readFileSync(new URL("../../fixtures/TC-01.json", import.meta.url));
const TC04_PAYLOAD = readFileSync(new URL("../../fixtures/TC-04.json", import.meta.url));
const TC08_PAYLOAD = readFileSync(new URL("../../fixtures/TC-08.json", import.meta.url));

function buildMultipart(content: Buffer, filename: string): { body: Buffer; contentType: string } {
  const boundary = `----faktur-smoke-${Math.random().toString(16).slice(2)}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: application/json\r\n\r\n`,
    ),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

describe("T23 · Checklist de Aceptación End-to-End (MVP §12)", () => {
  let app: FastifyInstance;
  let tempDir: string;
  let prevDataDir: string | undefined;

  before(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "faktur-smoke-e2e-"));
    prevDataDir = process.env.DATA_DIR;
    process.env.DATA_DIR = tempDir;
    loadDb(":memory:");
    app = await buildApp({ logLevel: "silent" });
  });

  after(async () => {
    await app.close();
    closeDb();
    if (prevDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = prevDataDir;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("1. Autonomía: factura válida se aprueba directamente (PAGAR / Touchless STP)", async () => {
    const file = buildMultipart(TC01_PAYLOAD, "factura-autonoma.json");
    const res = await app.inject({
      method: "POST",
      url: "/api/invoices",
      headers: { "content-type": file.contentType },
      payload: file.body,
    });

    assert.equal(res.statusCode, 201, "La factura nueva debe responder 201 Created");
    const body = JSON.parse(res.body);
    assert.equal(body.verdict, "PAGAR");
    assert.equal(body.reason_code, "SUCCESS_TOUCHLESS_STP");
    assert.ok(body.invoice_id, "Debe generar y retornar un invoice_id");

    // Verificar en el audit trail que no requirió intervención humana
    const auditRes = await app.inject({ method: "GET", url: "/api/audit-trail" });
    assert.equal(auditRes.statusCode, 200);
    const audit = JSON.parse(auditRes.body);
    const record = audit.records.find(
      (r: { invoice_id: string }) => r.invoice_id === body.invoice_id,
    );
    assert.ok(record, "La factura debe figurar en el audit trail");
    assert.equal(record.verdict, "PAGAR");
    assert.equal(record.estado, "PAGADA");
    assert.equal(record.human_approved, null);
  });

  it("2. Reglas configurables: simulación preview cambia PAGAR a ESCALAR sin mutar la base", async () => {
    // Obtenemos la política base actual y le quitamos el campo version para armar el candidato
    const currentPolicyRes = await app.inject({ method: "GET", url: "/api/policy" });
    assert.equal(currentPolicyRes.statusCode, 200);
    const candidatePolicy = JSON.parse(currentPolicyRes.body);
    delete candidatePolicy.version;

    // Si simulamos bajando el umbral a $300 USD, TC-01 ($420 USD) debe pasar a ESCALAR
    const previewRes = await app.inject({
      method: "POST",
      url: "/api/policy/preview",
      headers: { "content-type": "application/json" },
      payload: { ...candidatePolicy, auto_approval_threshold_usd: 300 },
    });

    assert.equal(previewRes.statusCode, 200);
    const preview = JSON.parse(previewRes.body);
    assert.ok(Array.isArray(preview.affected), "El preview debe retornar un array affected");
    assert.equal(preview.affected.length, 1, "Exactamente una factura debe verse afectada");
    assert.equal(preview.affected[0].before, "PAGAR");
    assert.equal(preview.affected[0].after, "ESCALAR");
    assert.equal(preview.affected[0].reason_code, "ALERT_THRESHOLD_EXCEEDED");

    // La base NO debe haber sido modificada por la simulación
    const checkRes = await app.inject({ method: "GET", url: "/api/audit-trail" });
    const audit = JSON.parse(checkRes.body);
    const record = audit.records.find(
      (r: { invoice: { invoice_number: string } }) => r.invoice.invoice_number === "INV-9022",
    );
    assert.equal(record.verdict, "PAGAR", "La decisión en base no debe haber mutado");
  });

  it("3. Seguridad: factura duplicada queda FRENADA con motivo legible", async () => {
    // Enviamos el mismo contenido de TC-01 por segunda vez (reintento o ataque de reenvío)
    const duplicateFile = buildMultipart(TC01_PAYLOAD, "factura-duplicada-reintento.json");
    const dupRes = await app.inject({
      method: "POST",
      url: "/api/invoices",
      headers: { "content-type": duplicateFile.contentType },
      payload: duplicateFile.body,
    });

    assert.equal(dupRes.statusCode, 200, "Un duplicado responde 200 con decisión FRENAR");
    const body = JSON.parse(dupRes.body);
    assert.equal(body.verdict, "FRENAR");
    assert.equal(body.reason_code, "ERR_DUPLICATE_INVOICE");
    assert.match(
      body.explanation,
      /duplicad/i,
      "La explicación debe explicitar que la factura está duplicada",
    );
  });

  it("4. Human-in-the-loop: factura escalada se aprueba en bandeja y registra firma", async () => {
    // TC-04 supera el umbral autónomo ($3,500 USD > $1,000 USD)
    const file = buildMultipart(TC04_PAYLOAD, "factura-growth-agency.json");
    const uploadRes = await app.inject({
      method: "POST",
      url: "/api/invoices",
      headers: { "content-type": file.contentType },
      payload: file.body,
    });

    assert.equal(uploadRes.statusCode, 201);
    const uploadBody = JSON.parse(uploadRes.body);
    assert.equal(uploadBody.verdict, "ESCALAR");
    assert.equal(uploadBody.reason_code, "ALERT_THRESHOLD_EXCEEDED");

    // Debe aparecer en la bandeja de aprobaciones pendientes
    const inboxRes = await app.inject({
      method: "GET",
      url: "/api/approvals?status=pendiente",
    });
    assert.equal(inboxRes.statusCode, 200);
    const pendingList = JSON.parse(inboxRes.body);
    const pending = pendingList.find(
      (p: { invoice_id: string }) => p.invoice_id === uploadBody.invoice_id,
    );
    assert.ok(pending, "La factura escalada debe estar en la bandeja de pendientes");

    // Resolución humana: autorizar pago con firma y comentario
    const resolveRes = await app.inject({
      method: "POST",
      url: `/api/approvals/${pending.id}`,
      headers: { "content-type": "application/json" },
      payload: {
        approve: true,
        resolved_by: "Auditor Demo HITL",
        comment: "Aprobación verificada para reto Blinka",
      },
    });
    assert.equal(resolveRes.statusCode, 200);
    const resolvedBody = JSON.parse(resolveRes.body);
    assert.equal(resolvedBody.status, "APROBADA");
    assert.ok(resolvedBody.ledger, "Debe registrarse el asiento en ledger al autorizar el pago");

    // Verificar en el detalle que la línea de tiempo refleja la resolución humana
    const detailRes = await app.inject({
      method: "GET",
      url: `/api/invoices/${uploadBody.invoice_id}`,
    });
    assert.equal(detailRes.statusCode, 200);
    const detail = JSON.parse(detailRes.body);
    assert.equal(detail.record.estado, "PAGADA");
    assert.equal(detail.record.human_approved, true);
    assert.ok(detail.resolution, "Debe tener bloque de resolución persistido");
    assert.equal(detail.resolution.resolved_by, "Auditor Demo HITL");
    assert.equal(detail.resolution.comment, "Aprobación verificada para reto Blinka");
  });

  it("5. Fail-closed: factura con datos críticos faltantes no se paga (FRENAR)", async () => {
    // TC-08 carece de datos críticos válidos
    const file = buildMultipart(TC08_PAYLOAD, "factura-invalida-corrupta.json");
    const uploadRes = await app.inject({
      method: "POST",
      url: "/api/invoices",
      headers: { "content-type": file.contentType },
      payload: file.body,
    });

    assert.equal(uploadRes.statusCode, 201);
    const body = JSON.parse(uploadRes.body);
    assert.equal(body.verdict, "FRENAR", "Por fail-closed nunca debe resultar en PAGAR");
    assert.equal(body.reason_code, "ERR_INVALID_DATA");

    // Una carga con JSON corrupto rechaza con 422
    const brokenPayload = Buffer.from(JSON.stringify({ not_even_an_invoice: true }));
    const brokenFile = buildMultipart(brokenPayload, "factura-rota.json");
    const brokenRes = await app.inject({
      method: "POST",
      url: "/api/invoices",
      headers: { "content-type": brokenFile.contentType },
      payload: brokenFile.body,
    });
    assert.equal(brokenRes.statusCode, 422);
  });

  it("6. Explicabilidad: reporte CSV con 14 columnas canónicas y motivo en lenguaje natural", async () => {
    const csvRes = await app.inject({
      method: "GET",
      url: "/api/report.csv",
    });

    assert.equal(csvRes.statusCode, 200);
    assert.match(csvRes.headers["content-type"] as string, /text\/csv/);
    assert.match(
      csvRes.headers["content-disposition"] as string,
      /attachment; filename="faktur-report-/,
    );

    const csvText = csvRes.body;
    const lines = csvText.trim().split(/\r?\n/);
    assert.ok(lines.length >= 4, "Debe tener encabezado y al menos 3 decisiones registradas");

    // Validar las 14 columnas canónicas exactas
    const headerColumns = lines[0].split(",").map((c) => c.trim());
    assert.deepEqual(headerColumns, [...REPORT_COLUMNS]);

    // Verificar que todas las filas tengan motivo legible no vacío
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      assert.ok(line.length > 0, `La fila ${i} no debe estar vacía`);
      assert.ok(line.includes('"'), `La fila ${i} debe contener el motivo legible entrecomillado`);
    }
  });
});
