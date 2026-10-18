import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { MoneyDisplay, formatCurrencyValue } from "./money-display";

test("formatCurrencyValue formatea números con separador de miles y 2 decimales", () => {
  assert.equal(formatCurrencyValue(1234.5), "1,234.50");
  assert.equal(formatCurrencyValue(0), "0.00");
  assert.equal(formatCurrencyValue(1000000), "1,000,000.00");
});

test("MoneyDisplay renderiza monto en USD por defecto con etiqueta accesible", () => {
  const html = renderToStaticMarkup(<MoneyDisplay amount={1500.5} />);

  assert.match(html, /\$1,500\.50 USD/);
  assert.match(html, /aria-label="\$1,500\.50 USD"/);
});

test("MoneyDisplay muestra monto original cuando es moneda extranjera", () => {
  const html = renderToStaticMarkup(
    <MoneyDisplay amount={58} currency="USD" originalAmount={1000} originalCurrency="MXN" />,
  );

  assert.match(html, /\$58\.00 USD/);
  assert.match(html, /MXN 1,000\.00/);
  assert.match(html, /aria-label="Monto original: MXN 1,000\.00"/);
});

test("MoneyDisplay respeta opción showCurrencyCode=false", () => {
  const html = renderToStaticMarkup(<MoneyDisplay amount={450} showCurrencyCode={false} />);

  assert.match(html, /\$450\.00/);
  assert.doesNotMatch(html, /\$450\.00 USD/);
});
