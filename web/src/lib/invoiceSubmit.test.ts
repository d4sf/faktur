import assert from "node:assert/strict";
import test from "node:test";

import {
  createInvoiceSubmitter,
  describeError,
  determineFailingRuleId,
  MAX_UPLOAD_BYTES,
  pickDroppedFile,
  validateInvoiceFile,
} from "@/lib/invoiceSubmit";

/**
 * Crea un `Response` JSON para los fetch falsos.
 */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function invoiceFile(name = "factura.pdf", type = "application/pdf"): File {
  return new File([new Uint8Array(4)], name, { type });
}

test("validateInvoiceFile acepta PDF, imagen y JSON dentro del límite", () => {
  assert.equal(
    validateInvoiceFile({ name: "factura.pdf", size: 1024, type: "application/pdf" }),
    null,
  );
  assert.equal(validateInvoiceFile({ name: "scan.png", size: 1024, type: "image/png" }), null);
  assert.equal(validateInvoiceFile({ name: "foto.jpg", size: 1024, type: "image/jpeg" }), null);
  assert.equal(
    validateInvoiceFile({ name: "mock.json", size: 1024, type: "application/json" }),
    null,
  );
});

test("validateInvoiceFile rechaza formatos no soportados y archivos vacíos", () => {
  assert.equal(
    validateInvoiceFile({ name: "virus.exe", size: 1024, type: "application/x-msdownload" }),
    "Formato no soportado. Usá PDF, PNG, JPG o JSON.",
  );
  assert.equal(
    validateInvoiceFile({ name: "vacia.pdf", size: 0, type: "application/pdf" }),
    "El archivo está vacío.",
  );
});

test("validateInvoiceFile rechaza archivos mayores a 5 MB", () => {
  assert.equal(
    validateInvoiceFile({
      name: "enorme.pdf",
      size: MAX_UPLOAD_BYTES + 1,
      type: "application/pdf",
    }),
    "El archivo supera el límite de 5 MB.",
  );
});

test("pickDroppedFile toma el primer archivo y tolera listas vacías", () => {
  const first = invoiceFile("uno.pdf");
  const second = invoiceFile("dos.pdf");
  assert.equal(pickDroppedFile([first, second]), first);
  assert.equal(pickDroppedFile([]), null);
  assert.equal(pickDroppedFile(null), null);
  assert.equal(pickDroppedFile(undefined), null);
});

test("determineFailingRuleId asocia los códigos con su regla", () => {
  assert.equal(determineFailingRuleId("ERR_DUPLICATE_INVOICE"), 2);
  assert.equal(determineFailingRuleId("ERR_BLACKLISTED_VENDOR"), 3);
  assert.equal(determineFailingRuleId("ALERT_THRESHOLD_EXCEEDED"), 7);
  assert.equal(determineFailingRuleId("SUCCESS_TOUCHLESS_STP"), undefined);
});

test("describeError traduce códigos conocidos y cae en el código HTTP", () => {
  assert.equal(
    describeError(413, { error: "file_too_large" }),
    "El archivo supera el límite de 5 MB.",
  );
  assert.equal(
    describeError(503, { error: "extraction_not_configured" }),
    "Falta configurar GEMINI_API_KEY en .env: sin la clave no se pueden leer PDFs ni imágenes. Mientras tanto podés subir un JSON de fixtures/ o usar un caso de ejemplo.",
  );
  assert.equal(
    describeError(503, { error: "extraction_unavailable" }),
    "El servicio de extracción no está disponible. Reintentá en un momento.",
  );
  assert.equal(describeError(500, { error: "boom" }), "No se pudo procesar la factura (HTTP 500).");
  assert.equal(describeError(500, null), "No se pudo procesar la factura (HTTP 500).");
});

test("un envío válido publica el archivo y mapea los datos extraídos", async () => {
  const calls: string[] = [];
  const stages: string[] = [];

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);

    if (url === "/api/invoices") {
      assert.equal(init?.method, "POST");
      assert.ok(init?.body instanceof FormData);
      return jsonResponse(
        {
          attempt_id: "attempt-1",
          invoice_id: "inv-1",
          status: "RECIBIDA",
          verdict: "PAGAR",
          reason_code: "SUCCESS_TOUCHLESS_STP",
          explanation: "Pago directo habilitado.",
        },
        201,
      );
    }

    if (url === "/api/invoices/inv-1") {
      return jsonResponse({
        vendor: { display_name: "Amazon Web Services", tax_id: "AWS-CLOUD-01" },
        audit_record: {
          invoice_number: "INV-AWS-8821",
          issue_date: "2026-10-01",
          due_date: "2026-10-31",
          currency: "USD",
          total_amount: 450,
          total_usd: 450,
        },
      });
    }

    throw new Error(`fetch inesperado: ${url}`);
  }) as unknown as typeof fetch;

  const submitter = createInvoiceSubmitter({
    fetchImpl,
    onStage: (stage) => stages.push(stage.message),
  });
  const outcome = await submitter.submit(invoiceFile());

  assert.equal(outcome.status, "completed");
  if (outcome.status !== "completed") return;

  assert.equal(outcome.invoice.verdict, "PAGAR");
  assert.equal(outcome.invoice.invoice_number, "INV-AWS-8821");
  assert.equal(outcome.invoice.vendor_name, "Amazon Web Services");
  assert.equal(outcome.invoice.total_usd, 450);
  assert.equal(outcome.invoice.duplicate, false);
  assert.equal(calls[0], "/api/invoices");
  assert.ok(stages.includes("Analizando documento…"));
});

test("un reenvío duplicado se resuelve como FRENAR, no como error", async () => {
  const calls: string[] = [];

  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);

    if (url === "/api/invoices") {
      return jsonResponse({
        attempt_id: "attempt-2",
        invoice_id: "inv-original",
        status: "DUPLICADA",
        verdict: "FRENAR",
        reason_code: "ERR_DUPLICATE_INVOICE",
        explanation: "Ya existe una factura con el mismo hash.",
      });
    }

    if (url === "/api/invoices/inv-original") {
      return jsonResponse({
        vendor: { display_name: "Amazon Web Services", tax_id: "AWS-CLOUD-01" },
        audit_record: {
          invoice_number: "INV-AWS-8821",
          issue_date: "2026-10-01",
          due_date: "2026-10-31",
          currency: "USD",
          total_amount: 450,
          total_usd: 450,
        },
      });
    }

    throw new Error(`fetch inesperado: ${url}`);
  }) as unknown as typeof fetch;

  const submitter = createInvoiceSubmitter({ fetchImpl });
  const outcome = await submitter.submit(invoiceFile());

  assert.equal(outcome.status, "completed");
  if (outcome.status !== "completed") return;

  assert.equal(outcome.invoice.verdict, "FRENAR");
  assert.equal(outcome.invoice.duplicate, true);
  assert.equal(outcome.invoice.reason_code, "ERR_DUPLICATE_INVOICE");
  assert.equal(outcome.invoice.reason_description, "Ya existe una factura con el mismo hash.");
  assert.equal(outcome.invoice.failingRuleId, 2);
  assert.deepEqual(calls, ["/api/invoices", "/api/invoices/inv-original"]);
});

test("un segundo envío durante el procesamiento se ignora", async () => {
  let postCalls = 0;
  let releaseFirst: (response: Response) => void = () => {};
  const firstResponse = new Promise<Response>((resolve) => {
    releaseFirst = resolve;
  });

  const fetchImpl = (async () => {
    postCalls += 1;
    return firstResponse;
  }) as unknown as typeof fetch;

  const submitter = createInvoiceSubmitter({ fetchImpl });
  const file = invoiceFile();

  const first = submitter.submit(file);
  const second = await submitter.submit(file);

  assert.deepEqual(second, { status: "skipped" });
  assert.equal(postCalls, 1);
  assert.equal(submitter.isSubmitting(), true);

  releaseFirst(
    jsonResponse(
      {
        attempt_id: "attempt-3",
        verdict: "PAGAR",
        reason_code: "SUCCESS_TOUCHLESS_STP",
      },
      201,
    ),
  );

  const firstOutcome = await first;
  assert.equal(firstOutcome.status, "completed");
  assert.equal(submitter.isSubmitting(), false);
});

test("un error de la API vuelve con un mensaje legible y libera el bloqueo", async () => {
  const fetchImpl = (async () =>
    jsonResponse({ error: "file_too_large" }, 413)) as unknown as typeof fetch;
  const submitter = createInvoiceSubmitter({ fetchImpl });

  const outcome = await submitter.submit(invoiceFile());

  assert.deepEqual(outcome, {
    status: "error",
    message: "El archivo supera el límite de 5 MB.",
  });
  assert.equal(submitter.isSubmitting(), false);
});

test("una caída de red se reporta como error de conexión", async () => {
  const fetchImpl = (async () => {
    throw new TypeError("fetch failed");
  }) as unknown as typeof fetch;

  const outcome = await createInvoiceSubmitter({ fetchImpl }).submit(invoiceFile());

  assert.deepEqual(outcome, {
    status: "error",
    message: "No se pudo conectar con el agente. Revisá la conexión y reintentá.",
  });
});
