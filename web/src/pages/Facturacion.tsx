import { Check, CreditCard, Receipt, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { BillingState, Plan, PlanId } from "@/types/billing";

function formatMoney(value: number, decimals: number): string {
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function formatCount(value: number): string {
  return value.toLocaleString("es-AR");
}

interface FacturacionViewProps {
  state: BillingState;
  onSelect: (plan: PlanId) => void;
  pendingPlan?: PlanId | null;
}

/** Vista pura (sin fetch) para poder testearla con `renderToStaticMarkup`. */
export function FacturacionView({ state, onSelect, pendingPlan = null }: FacturacionViewProps) {
  const usagePercentage =
    state.invoice_limit === 0
      ? 0
      : Math.min(100, Math.round((state.invoices_this_month / state.invoice_limit) * 100));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground font-logo">
          Facturación
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Elegí el plan según el volumen de facturas procesadas por mes. Demo sin cobro real.
        </p>
      </div>

      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Receipt className="size-4 text-muted-foreground" />
              Plan actual: {state.plan_name}
            </div>
            <span className="text-xs text-muted-foreground">
              {formatCount(state.invoices_this_month)} de {formatCount(state.invoice_limit)}{" "}
              facturas este mes
            </span>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[#185338] transition-all"
              style={{ width: `${usagePercentage}%` }}
            />
          </div>

          {state.overage_invoices > 0 && (
            <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
              {formatCount(state.overage_invoices)} facturas por encima del límite · excedente{" "}
              {formatMoney(state.overage_usd, 2)}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {state.plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            isCurrent={plan.id === state.plan}
            isPending={plan.id === pendingPlan}
            onSelect={onSelect}
          />
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Sin cobro real: el plan elegido se guarda para la demo y no se emite ninguna factura. El
        consumo cuenta las facturas ingeridas desde el día 1 del mes (UTC).
      </p>
    </div>
  );
}

function PlanCard({
  plan,
  isCurrent,
  isPending,
  onSelect,
}: {
  plan: Plan;
  isCurrent: boolean;
  isPending: boolean;
  onSelect: (plan: PlanId) => void;
}) {
  return (
    <Card className={isCurrent ? "border-[#185338] ring-1 ring-[#185338]/30" : ""}>
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold tracking-tight">{plan.name}</span>
          {isCurrent && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#185338] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              <Check className="size-3" />
              Plan actual
            </span>
          )}
        </div>

        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-extrabold tracking-tight">
            {formatMoney(plan.price_usd, 0)}
          </span>
          <span className="text-xs text-muted-foreground">/mes</span>
        </div>

        <ul className="space-y-1.5 text-xs text-muted-foreground">
          <li className="flex items-center gap-2">
            <Receipt className="size-3.5 shrink-0" />
            {formatCount(plan.invoice_limit)} facturas incluidas
          </li>
          <li className="flex items-center gap-2">
            <Users className="size-3.5 shrink-0" />
            {plan.users_included} usuarios incluidos
          </li>
          <li className="flex items-center gap-2">
            <CreditCard className="size-3.5 shrink-0" />
            Excedente {formatMoney(plan.extra_invoice_usd, 2)} por factura
          </li>
        </ul>

        <Button
          className="mt-auto w-full"
          variant={isCurrent ? "outline" : "default"}
          disabled={isCurrent || isPending}
          onClick={() => onSelect(plan.id)}
        >
          {isCurrent ? "Plan activo" : isPending ? "Guardando…" : "Elegir plan"}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function Facturacion() {
  const [state, setState] = useState<BillingState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<PlanId | null>(null);

  const load = () => {
    fetch("/api/billing")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: BillingState) => setState(data))
      .catch(() => setError("No se pudo cargar la facturación"));
  };

  useEffect(() => {
    load();
  }, []);

  const handleSelect = async (plan: PlanId) => {
    setPendingPlan(plan);
    setError(null);
    try {
      const res = await fetch("/api/billing/plan", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setState(data as BillingState);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el plan");
    } finally {
      setPendingPlan(null);
    }
  };

  if (error !== null && state === null) {
    return (
      <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (state === null) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FacturacionView state={state} onSelect={handleSelect} pendingPlan={pendingPlan} />
      {error !== null && (
        <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}
