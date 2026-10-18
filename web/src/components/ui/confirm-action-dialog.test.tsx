import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ConfirmActionDialog } from "./confirm-action-dialog";

test("ConfirmActionDialog cuando isOpen=false no renderiza contenido modal", () => {
  const html = renderToStaticMarkup(
    <ConfirmActionDialog
      isOpen={false}
      onOpenChange={() => {}}
      title="¿Aprobar pago?"
      description="Esta acción registrará la decisión en el ledger."
      onConfirm={() => {}}
    />,
  );

  assert.doesNotMatch(html, /¿Aprobar pago\?/);
});
