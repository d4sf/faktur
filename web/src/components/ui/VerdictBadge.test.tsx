import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { VerdictBadge } from "@/components/ui/VerdictBadge";

test("VerdictBadge renderiza texto e ícono para PAGAR", () => {
  const html = renderToStaticMarkup(<VerdictBadge verdict="PAGAR" />);
  assert.match(html, /PAGAR/);
  assert.match(html, /<svg/);
  assert.match(html, /data-verdict="PAGAR"/);
});

test("VerdictBadge renderiza texto e ícono para FRENAR", () => {
  const html = renderToStaticMarkup(<VerdictBadge verdict="FRENAR" size="lg" />);
  assert.match(html, /FRENAR/);
  assert.match(html, /<svg/);
  assert.match(html, /data-verdict="FRENAR"/);
});

test("VerdictBadge renderiza texto e ícono para ESCALAR", () => {
  const html = renderToStaticMarkup(<VerdictBadge verdict="ESCALAR" />);
  assert.match(html, /ESCALAR/);
  assert.match(html, /<svg/);
  assert.match(html, /data-verdict="ESCALAR"/);
});
