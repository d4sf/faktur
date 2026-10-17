/**
 * @file Reglas.tsx
 * @description Catálogo oficial de las 8 reglas deterministas de política (versión v1 congelada)
 * y panel de parámetros financieros globales (umbral autónomo, presupuesto mensual, tolerancia de desvío y budgets por categoría).
 * Basado en specs/policy.spec.json y en la matriz de precedencia del motor de decisiones.
 */

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VerdictBadge } from "@/components/ui/VerdictBadge";

/**
 * Representa una regla del motor determinista de cuentas por pagar.
 */
interface PolicyRule {
  ruleNumber: string;
  name: string;
  verdict: "PAGAR" | "FRENAR" | "ESCALAR";
  reasonCode: string;
  condition: string;
  action: string;
}

const POLICY_RULES: PolicyRule[] = [
  {
    ruleNumber: "Regla 1",
    name: "Extracción y legibilidad de datos",
    verdict: "FRENAR",
    reasonCode: "ERR_INVALID_DATA / ALERT_LOW_CONFIDENCE",
    condition: "Datos críticos ilegibles, sin folio o confianza del modelo inferior a 0.70.",
    action: "Frena inmediatamente si falta folio o tax ID; escala si la confianza es baja.",
  },
  {
    ruleNumber: "Regla 2",
    name: "Verificación de duplicados",
    verdict: "FRENAR",
    reasonCode: "ERR_DUPLICATE_INVOICE",
    condition: "Hash SHA-256 o combinación de proveedor y número de factura ya registrada.",
    action: "Bloquea el pago permanentemente para evitar desembolsos duplicados.",
  },
  {
    ruleNumber: "Regla 3",
    name: "Lista de beneficiarios bloqueados",
    verdict: "FRENAR",
    reasonCode: "ERR_BLACKLISTED_VENDOR",
    condition: "El beneficiario o RFC figura en la lista de entidades sancionadas por auditoría.",
    action: "Freno estricto de seguridad. No es aprobable ni por excepción humana.",
  },
  {
    ruleNumber: "Regla 4",
    name: "Proveedor registrado en directorio",
    verdict: "ESCALAR",
    reasonCode: "ALERT_NEW_VENDOR",
    condition: "El proveedor es nuevo o no figura en el catálogo de proveedores activos.",
    action: "Escala a revisión humana para verificar alta de proveedor y cuenta bancaria.",
  },
  {
    ruleNumber: "Regla 5",
    name: "Desvío sobre importe histórico",
    verdict: "ESCALAR",
    reasonCode: "ALERT_VENDOR_DRIFT",
    condition: "El importe supera en más del 40% (factor 1.4x) el promedio histórico acordado.",
    action: "Escala a revisión humana para validar el incremento de costo.",
  },
  {
    ruleNumber: "Regla 6",
    name: "Presupuesto disponible en período y categoría",
    verdict: "ESCALAR",
    reasonCode: "ALERT_BUDGET_OVERRUN / ALERT_BUDGET_TIGHT",
    condition: "El monto compromete el presupuesto mensual de $5,000 USD o agota la categoría.",
    action: "Escala a revisión humana antes de comprometer el saldo disponible.",
  },
  {
    ruleNumber: "Regla 7",
    name: "Límite de aprobación autónoma ($1,000 USD)",
    verdict: "ESCALAR",
    reasonCode: "ALERT_THRESHOLD_EXCEEDED",
    condition: "Cualquier factura con importe superior a $1,000.00 USD.",
    action: "Requiere firma humana de autorización para montos elevados.",
  },
  {
    ruleNumber: "Regla 8",
    name: "Criterio de pase directo y dispersión STP",
    verdict: "PAGAR",
    reasonCode: "SUCCESS_TOUCHLESS_STP",
    condition: "Factura válida que cumple satisfactoriamente las 7 reglas previas.",
    action: "Emisión de pago automático inmediato hacia la cuenta del proveedor.",
  },
];

const CATEGORY_BUDGETS = [
  { category: "Marketing", budget: "$4,000.00 USD", status: "Activo" },
  { category: "Legal", budget: "$3,000.00 USD", status: "Activo" },
  { category: "Infraestructura", budget: "$1,500.00 USD", status: "Activo" },
  { category: "Diseño", budget: "$1,000.00 USD", status: "Activo" },
  { category: "Software", budget: "$500.00 USD", status: "Activo" },
  { category: "Retail", budget: "$0.00 USD", status: "Bloqueado" },
];

export default function Reglas() {
  return (
    <div className="space-y-8">
      {/* 1. Encabezado */}
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Reglas de política
        </h2>
        <p className="text-sm text-muted-foreground">
          Parámetros financieros y orden de precedencia determinista del agente de pagos (versión v1
          congelada).
        </p>
      </div>

      {/* 2. Parámetros globales congelados */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 md:gap-5">
        <Card className="rounded-xl border border-border/80 shadow-xs">
          <CardHeader className="pb-1.5">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Umbral autónomo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              $1,000<span className="text-base font-normal text-muted-foreground">.00</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Máximo para pago sin intervención humana
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-border/80 shadow-xs">
          <CardHeader className="pb-1.5">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Presupuesto mensual
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              $5,000<span className="text-base font-normal text-muted-foreground">.00</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Límite de dispersión global por ciclo
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-border/80 shadow-xs">
          <CardHeader className="pb-1.5">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Tolerancia de desvío
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              1.4<span className="text-base font-normal text-muted-foreground">x</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Máximo +40% sobre histórico acordado
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-border/80 shadow-xs">
          <CardHeader className="pb-1.5">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Confianza mínima IA
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              70<span className="text-base font-normal text-muted-foreground">%</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Umbral mínimo de legibilidad de campos
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 3. Tabla de las 8 reglas con orden de precedencia */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold tracking-tight text-foreground">
              Matriz determinista de precedencia (8 reglas)
            </h3>
            <p className="text-xs text-muted-foreground">
              El motor evalúa las reglas en este orden estricto de 1 a 8. La primera condición que
              se cumple define el veredicto.
            </p>
          </div>
          <span className="text-xs font-mono text-muted-foreground">Versión v1</span>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/20 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px] whitespace-nowrap">
                    Regla
                  </th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px]">
                    Nombre
                  </th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px] whitespace-nowrap">
                    Salida canónica
                  </th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px]">
                    Condición de disparo
                  </th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px]">
                    Acción del agente
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {POLICY_RULES.map((rule) => (
                  <tr key={rule.ruleNumber} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-foreground whitespace-nowrap">
                      {rule.ruleNumber}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">{rule.name}</td>
                    <td className="px-4 py-3">
                      <VerdictBadge verdict={rule.verdict} size="sm" />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-sm">{rule.condition}</td>
                    <td className="px-4 py-3 text-muted-foreground max-w-sm">{rule.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 4. Presupuestos por categoría */}
      <div className="space-y-3">
        <h3 className="text-base font-bold tracking-tight text-foreground">
          Presupuestos asignados por categoría
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {CATEGORY_BUDGETS.map((cat) => (
            <div
              key={cat.category}
              className="rounded-xl border border-border/80 bg-card p-3 space-y-1 shadow-xs"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">{cat.category}</span>
              </div>
              <p className="font-mono text-xs font-bold text-foreground">{cat.budget}</p>
              <span className="text-[10px] text-muted-foreground">{cat.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
