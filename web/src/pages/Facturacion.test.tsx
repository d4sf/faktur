import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { FacturacionView } from "@/pages/Facturacion";
import type { BillingState } from "@/types/billing";

const STATE: BillingState = {
  plan: "growth",
  plan_name: "Growth",
  price_usd: 299,
  invoice_limit: 500,
  extra_invoice_usd: 0.35,
  users_included: 10,
  invoices_this_month: 87,
  overage_invoices: 0,
  overage_usd: 0,
  month_start: "2026-10-01T00:00:00.000Z",
  plans: [
    {
      id: "starter",
      name: "Starter",
      price_usd: 99,
      invoice_limit: 100,
      extra_invoice_usd: 0.5,
      users_included: 3,
    },
    {
      id: "growth",
      name: "Growth",
      price_usd: 299,
      invoice_limit: 500,
      extra_invoice_usd: 0.35,
      users_included: 10,
    },
    {
      id: "scale",
      name: "Scale",
      price_usd: 799,
      invoice_limit: 2000,
      extra_invoice_usd: 0.25,
      users_included: 25,
    },
  ],
};

test("muestra los tres planes con su precio y límite de facturas", () => {
  const html = renderToStaticMarkup(<FacturacionView state={STATE} onSelect={() => {}} />);

  assert.match(html, /Starter/);
  assert.match(html, /\$99/);
  assert.match(html, /100 facturas/);
  assert.match(html, /Growth/);
  assert.match(html, /\$299/);
  assert.match(html, /500 facturas/);
  assert.match(html, /Scale/);
  assert.match(html, /\$799/);
  assert.match(html, /2\.000 facturas/);
});

test("marca el plan actual y muestra el consumo del mes", () => {
  const html = renderToStaticMarkup(<FacturacionView state={STATE} onSelect={() => {}} />);

  assert.match(html, /Plan actual/);
  assert.match(html, /87 de 500 facturas/);
  assert.match(html, /Sin cobro real/);
});

test("avisa cuando el consumo supera el límite del plan", () => {
  const html = renderToStaticMarkup(
    <FacturacionView
      state={{ ...STATE, invoices_this_month: 510, overage_invoices: 10, overage_usd: 3.5 }}
      onSelect={() => {}}
    />,
  );

  assert.match(html, /10 facturas por encima del límite/);
  assert.match(html, /\$3\.50/);
});
