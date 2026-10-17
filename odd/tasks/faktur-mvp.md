   # faktur-mvp — motor determinista + HITL + auditoría
   PRD `docs/PRD_Faktur.md` + MVP
 `docs/planteamiento_mvp_reto_blinka.md` + ER
 `docs/propuesta_modelo_ER_faktur.md`.

   ## Specs
   - S1: "Tres estados deterministas: PAGAR, FRENAR o ESCALAR A
 HUMANO" — LLM solo extrae a JSON tipado, decide código puro.
   - S2: "Cero pagos aprobados fuera de política" — fail-closed,
 default ESCALAR nunca PAGAR.
   - S3: "FRENAR ≠ ESCALAR. FRENAR es inválido no-aprobable" —
 HITL solo sobre ESCALAR, una sola resolución.
   - S4: "Toda factura genera AuditRecord con reason_code +
 explicación legible" + `policy_version` obligatoria.
   - S5: "Dedup doble: hash SHA-256 UNIQUE + UNIQUE(vendor_id,
 invoice_number)".
   - S6: "Solo PAGAR final escribe ledger_entries; FRENAR y
 ESCALAR-pendiente no mueven saldo".
   - S7: "Set 10 TC con veredictos TC-01..TC-10 según tabla PRD
 §7".

   ## Tasks
   - T1: congelar `specs/policy.spec.json` v1 (S1,S2) — ruta:
 inline — commit: _
   - T2: seed `fixtures/TC-*.json` + `ground_truth.json` (S7) —
 ruta: inline — commit: _
   - T3: validar motor contra fixtures en memoria sin LLM
 (S2,S3,S5,S6) — ruta: verify — commit: _
   - T4: cablear `decisions.policy_version` + CSV reproducible
 (S4) — ruta: inline — commit: _

   ## Log
   - L1: pedido original verbatim: "dame las instrucciones paso
 a paso para crear el esqueleto sdd"