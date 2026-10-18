import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { PayAgentChat } from "@/components/subir/PayAgentChat";
import type { InvoiceData } from "@/types/invoice";

const INVOICE = {
  id: "inv-1",
  invoice_number: "INV-9022",
  reason_code: "ALERT_THRESHOLD_EXCEEDED",
  reason_description: "Supera el umbral de aprobación automática.",
  verdict: "ESCALAR",
} as unknown as InvoiceData;

test("un rol sin approval:resolve no ve los botones de aprobar ni rechazar", () => {
  const html = renderToStaticMarkup(
    <PayAgentChat invoice={INVOICE} onResolve={() => {}} readOnly />,
  );

  assert.doesNotMatch(html, /Aprobar pago/);
  assert.doesNotMatch(html, /Rechazar factura/);
  assert.match(html, /no puede aprobar ni rechazar/);
});

test("un rol con approval:resolve ve las acciones de resolución", () => {
  const html = renderToStaticMarkup(<PayAgentChat invoice={INVOICE} onResolve={() => {}} />);

  assert.match(html, /Aprobar pago/);
  assert.match(html, /Rechazar factura/);
});
