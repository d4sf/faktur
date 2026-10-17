import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AuditTable } from "@/components/audit/AuditTable";
import type { AuditRecordView } from "@/types/audit";

/**
 * Construye un registro de auditoría con valores por defecto sensatos.
 */
function buildRecord(overrides: Partial<AuditRecordView> = {}): AuditRecordView {
  return {
    id: "decision-1",
    invoice_id: "invoice-1",
    invoice: {
      invoice_number: "INV-AWS-8821",
      vendor_name: "Amazon Web Services",
      vendor_tax_id: "AWS-CLOUD-01",
      issue_date: "2026-10-01",
      due_date: "2026-10-31",
      currency: "USD",
      total_amount: 450,
      total_usd: 450,
    },
    document_hash: "a".repeat(64),
    amount_usd: 450,
    verdict: "PAGAR",
    reason_code: "SUCCESS_TOUCHLESS_STP",
    explanation: "Cumple todas las políticas: pago directo al proveedor.",
    created_at: "2026-10-01T10:15:00.000Z",
    human_approved: null,
    estado: "PAGADA",
    ...overrides,
  };
}

test("la tabla muestra folio, proveedor, monto USD, veredicto con ícono y motivo", () => {
  const html = renderToStaticMarkup(
    <AuditTable records={[buildRecord()]} onSelectRecord={() => {}} />,
  );

  assert.match(html, /INV-AWS-8821/);
  assert.match(html, /Amazon Web Services/);
  assert.match(html, /ID: AWS-CLOUD-01/);
  assert.match(html, /\$450\.00/);
  assert.match(html, /PAGAR/);
  assert.match(html, /data-verdict="PAGAR"/);
  assert.match(html, /<svg/);
  assert.match(html, /Aprobación autónoma directa/);
  assert.match(html, /SUCCESS_TOUCHLESS_STP/);
  assert.match(html, /Cumple todas las políticas/);
  assert.match(html, /PAGADA/);
});

test("solo las facturas en aprobación ofrecen el botón Revisar", () => {
  const pagada = renderToStaticMarkup(
    <AuditTable records={[buildRecord()]} onSelectRecord={() => {}} />,
  );
  assert.doesNotMatch(pagada, />Revisar</);

  const escalada = renderToStaticMarkup(
    <AuditTable
      records={[buildRecord({ verdict: "ESCALAR", estado: "ESCALADA", amount_usd: 3500 })]}
      onSelectRecord={() => {}}
    />,
  );
  assert.match(escalada, />Revisar</);
});

test("muestra el monto original cuando la moneda no es USD", () => {
  const html = renderToStaticMarkup(
    <AuditTable
      records={[
        buildRecord({
          amount_usd: 58,
          invoice: {
            ...buildRecord().invoice,
            currency: "MXN",
            total_amount: 1000,
            total_usd: 58,
          },
        }),
      ]}
      onSelectRecord={() => {}}
    />,
  );

  assert.match(html, /MXN 1,000\.00/);
  assert.match(html, /\$58\.00/);
});

test("muestra controles de paginación y limita a 10 registros por defecto", () => {
  const records = Array.from({ length: 15 }, (_, i) =>
    buildRecord({
      id: `decision-${i + 1}`,
      invoice: {
        ...buildRecord().invoice,
        invoice_number: `INV-PAGE-${i + 1}`,
      },
    }),
  );

  const html = renderToStaticMarkup(<AuditTable records={records} onSelectRecord={() => {}} />);

  assert.match(html, /INV-PAGE-1</);
  assert.match(html, /INV-PAGE-10</);
  // El registro 11 no debe salir en la primera página
  assert.doesNotMatch(html, /INV-PAGE-11</);
  // Controles de paginación presentes
  assert.match(html, /Mostrar:/);
  assert.match(html, /Mostrando/);
  assert.match(html, /Página/);
  assert.match(html, /15/);
});
