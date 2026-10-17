import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { InvoiceFilePreview } from "@/components/subir/InvoiceFilePreview";

function pdfFile(size = 2048): File {
  return new File([new Uint8Array(size)], "factura_aws.pdf", { type: "application/pdf" });
}

test("la preview muestra el mensaje 'Analizando documento…' y el progreso", () => {
  const html = renderToStaticMarkup(
    <InvoiceFilePreview
      file={pdfFile()}
      flowState="PROCESSING"
      processingMessage="Analizando documento…"
      processingProgress={40}
    />,
  );

  assert.match(html, /Analizando documento…/);
  assert.match(html, /factura_aws\.pdf/);
  assert.match(html, /40%/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /En análisis/);
});

test("al terminar, la preview deja de mostrar el estado de análisis", () => {
  const html = renderToStaticMarkup(
    <InvoiceFilePreview
      file={pdfFile()}
      flowState="COMPLETED"
      processingMessage="Analizando documento…"
      processingProgress={100}
    />,
  );

  assert.match(html, /Documento analizado/);
  assert.doesNotMatch(html, /Analizando documento…/);
  assert.doesNotMatch(html, /role="progressbar"/);
  assert.match(html, /Listo/);
});
