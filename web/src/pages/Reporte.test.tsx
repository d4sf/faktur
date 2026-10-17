import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import Reporte from "@/pages/Reporte";

test("el reporte ofrece la descarga del CSV desde la ruta de la API", () => {
  const html = renderToStaticMarkup(<Reporte />);

  assert.match(html, /href="\/api\/report\.csv"/);
  assert.match(html, /Descargar reporte CSV/);
});

test("el nombre del archivo lo fija la API, no un download hardcodeado", () => {
  const html = renderToStaticMarkup(<Reporte />);

  assert.doesNotMatch(html, /download="/);
});
