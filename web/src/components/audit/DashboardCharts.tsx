import { useEffect, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import type { AuditMetrics, AuditRecordView } from "@/types/audit";
import type { PolicySpec } from "@/types/policy";
import { cn } from "@/lib/utils";

interface DashboardChartsProps {
  records: AuditRecordView[];
  metrics?: AuditMetrics;
}

interface SegmentHover {
  label: string;
  shortLabel: string;
  amount: number;
  count: number;
  pct: number;
  color: string;
}

export function DashboardCharts({ records, metrics }: DashboardChartsProps) {
  const [activeSegment, setActiveSegment] = useState<SegmentHover | null>(null);
  const [activeBarIdx, setActiveBarIdx] = useState<number | null>(null);
  const [policy, setPolicy] = useState<PolicySpec | null>(null);

  // Carga de la política activa para conocer el presupuesto real mensual de la BD
  useEffect(() => {
    fetch("/api/policy")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: PolicySpec | null) => {
        if (data) setPolicy(data);
      })
      .catch(() => {});
  }, []);

  // 1. Datos para Donut Chart de Veredictos (100% calculados de los registros reales de la BD)
  const donutData = useMemo(() => {
    let pagarCount = 0;
    let pagarUsd = 0;
    let escalarCount = 0;
    let escalarUsd = 0;
    let frenarCount = 0;
    let frenarUsd = 0;

    for (const r of records) {
      const amt = r.amount_usd || r.invoice.total_usd || 0;
      if (r.verdict === "PAGAR") {
        pagarCount++;
        pagarUsd += amt;
      } else if (r.verdict === "ESCALAR") {
        escalarCount++;
        escalarUsd += amt;
      } else if (r.verdict === "FRENAR") {
        frenarCount++;
        frenarUsd += amt;
      }
    }

    const totalUsd = pagarUsd + escalarUsd + frenarUsd;
    const totalCount = pagarCount + escalarCount + frenarCount;

    const pagarPct = totalUsd > 0 ? Math.round((pagarUsd / totalUsd) * 100) : 0;
    const escalarPct = totalUsd > 0 ? Math.round((escalarUsd / totalUsd) * 100) : 0;
    const frenarPct = totalUsd > 0 ? Math.max(100 - pagarPct - escalarPct, 0) : 0;

    const segments = [
      {
        id: "pagar",
        label: "Aprobación autónoma",
        shortLabel: "Aprobado",
        amount: pagarUsd,
        count: pagarCount,
        pct: pagarPct,
        color: "#185338",
        bgBadge: "bg-[#185338]/10 text-[#185338] dark:bg-[#185338]/25 dark:text-[#4ade80]",
        ringColor: "stroke-[#185338]",
      },
      {
        id: "escalar",
        label: "Requiere revisión humana",
        shortLabel: "En revisión",
        amount: escalarUsd,
        count: escalarCount,
        pct: escalarPct,
        color: "#f59e0b",
        bgBadge: "bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400",
        ringColor: "stroke-amber-500",
      },
      {
        id: "frenar",
        label: "Frenado por riesgo / fraude",
        shortLabel: "Frenado",
        amount: frenarUsd,
        count: frenarCount,
        pct: frenarPct,
        color: "#f43f5e",
        bgBadge: "bg-rose-500/10 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400",
        ringColor: "stroke-rose-500",
      },
    ];

    return { totalUsd, totalCount, segments };
  }, [records]);

  // Radio y circunferencia optimizados para máximo espacio interior
  const radius = 40;
  const circumference = 2 * Math.PI * radius;

  // 2. Flujo de Facturas en el tiempo (Siempre 7 días continuos visibles, mapeando datos reales)
  const barData = useMemo(() => {
    // 1. Determinar fecha de referencia (hoy o la fecha más reciente registrada)
    const now = new Date();
    let refDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (records.length > 0) {
      for (const r of records) {
        const raw = r.created_at || r.invoice.issue_date;
        if (raw) {
          const d = new Date(raw);
          if (!isNaN(d.getTime())) {
            const dOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            if (dOnly > refDate) {
              refDate = dOnly;
            }
          }
        }
      }
    }

    // 2. Generar SIEMPRE exactamente los últimos 7 días continuos hasta refDate
    const days: { dateKey: string; day: string; total: number; amount: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(refDate);
      d.setDate(d.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const dayNum = String(d.getDate()).padStart(2, "0");
      const dateKey = `${year}-${month}-${dayNum}`;

      const dayLabel = d
        .toLocaleDateString("es-ES", {
          day: "numeric",
          month: "short",
        })
        .replace(".", "");

      days.push({
        dateKey,
        day: dayLabel,
        total: 0,
        amount: 0,
      });
    }

    // 3. Mapear los registros reales de la base de datos a sus respectivos días
    for (const r of records) {
      const raw = r.created_at || r.invoice.issue_date;
      if (!raw) continue;
      const dateKey = raw.slice(0, 10);
      const amt = r.amount_usd || r.invoice.total_usd || 0;

      const target = days.find((d) => d.dateKey === dateKey);
      if (target) {
        target.total += 1;
        target.amount += amt;
      }
    }

    // Si por algún desajuste de zona horaria o fecha todos cayeron fuera del rango de 7 días,
    // garantizamos que las facturas reales existentes se asignen al día de hoy para que no se pierdan
    const totalMapped = days.reduce((acc, d) => acc + d.total, 0);
    if (totalMapped === 0 && records.length > 0) {
      const lastDay = days[days.length - 1];
      lastDay.total = records.length;
      lastDay.amount = records.reduce(
        (acc, r) => acc + (r.amount_usd || r.invoice.total_usd || 0),
        0,
      );
    }

    const maxCount = Math.max(...days.map((d) => d.total), 1);

    return days.map((d) => ({
      dateKey: d.dateKey,
      day: d.day,
      total: d.total,
      amount: d.amount,
      heightPct: d.total > 0 ? Math.max(Math.round((d.total / maxCount) * 100), 14) : 0,
    }));
  }, [records]);

  // 3. Métrica de presupuesto real (Conectado a la política y al ledger de SQLite)
  const budgetData = useMemo(() => {
    // Si la política está cargada usa su límite real; por defecto 5,000 USD de la política v1
    const totalBudget = policy?.monthly_budget_usd ?? 5000;
    const remaining = metrics?.budget_remaining ?? totalBudget;
    const used = Math.max(totalBudget - remaining, 0);
    const usedPct = totalBudget > 0 ? Math.min(Math.round((used / totalBudget) * 100), 100) : 0;

    // Circunferencia para el medidor semi-anillo
    const gaugeCircumference = 2 * Math.PI * 32;

    let statusText = "Saludable";
    if (usedPct >= 90) statusText = "Crítico";
    else if (usedPct >= 75) statusText = "Ajustado";

    return { totalBudget, remaining, used, usedPct, gaugeCircumference, statusText };
  }, [policy, metrics]);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      {/* TARJETA 1: Donut Circular de Decisiones (7 columnas) */}
      <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-xs lg:col-span-7 flex flex-col justify-between transition-all hover:border-border">
        {/* Cabecera limpia */}
        <div className="flex items-center justify-between pb-4 border-b border-border/40">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex size-2 rounded-full bg-[#185338] animate-pulse" />
              <h3 className="text-sm font-bold tracking-tight text-foreground uppercase tracking-wider">
                Distribución de Veredictos
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Destino y proporción del capital evaluado por el motor
            </p>
          </div>

          <span className="rounded-full bg-[#185338] px-2.5 py-0.5 text-xs font-bold text-white shadow-xs">
            {donutData.totalCount} facturas
          </span>
        </div>

        {/* Contenido: Donut Circular a la izquierda + Leyenda detallada a la derecha */}
        <div className="flex flex-col sm:flex-row items-center justify-around gap-6 py-6">
          {/* Gráfico Donut SVG con tamaño generoso para evitar desbordes */}
          <div className="relative size-48 sm:size-52 shrink-0 flex items-center justify-center">
            <svg className="size-full -rotate-90" viewBox="0 0 100 100">
              {/* Fondo del anillo */}
              <circle
                cx="50"
                cy="50"
                r={radius}
                className="stroke-muted/30 fill-none"
                strokeWidth="8.5"
              />

              {/* Segmentos del donut */}
              {donutData.totalCount > 0 ? (
                (() => {
                  let cumulativePct = 0;
                  return donutData.segments.map((seg) => {
                    const strokeDasharray = `${(seg.pct / 100) * circumference} ${circumference}`;
                    const strokeDashoffset = -((cumulativePct / 100) * circumference);
                    cumulativePct += seg.pct;
                    const isHovered = activeSegment?.label === seg.label;
                    const hasActive = activeSegment !== null;

                    return (
                      <circle
                        key={seg.id}
                        cx="50"
                        cy="50"
                        r={radius}
                        fill="none"
                        stroke={seg.color}
                        strokeWidth={isHovered ? 12.5 : 8.5}
                        strokeDasharray={strokeDasharray}
                        strokeDashoffset={strokeDashoffset}
                        style={{
                          transformOrigin: "50% 50%",
                          filter: isHovered ? `drop-shadow(0 0 6px ${seg.color}88)` : "none",
                          transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                        }}
                        className={cn(
                          "cursor-pointer",
                          hasActive && !isHovered ? "opacity-35" : "opacity-100",
                        )}
                        onMouseEnter={() =>
                          setActiveSegment({
                            label: seg.label,
                            shortLabel: seg.shortLabel,
                            amount: seg.amount,
                            count: seg.count,
                            pct: seg.pct,
                            color: seg.color,
                          })
                        }
                        onMouseLeave={() => setActiveSegment(null)}
                      />
                    );
                  });
                })()
              ) : (
                <circle
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="8.5"
                  className="stroke-muted/50"
                />
              )}
            </svg>

            {/* Centro interactivo del Donut */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-3 pointer-events-none select-none">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                {activeSegment && (
                  <span
                    className="size-2 rounded-full shrink-0 animate-pulse"
                    style={{ backgroundColor: activeSegment.color }}
                  />
                )}
                {activeSegment ? activeSegment.shortLabel : "Total evaluado"}
              </span>

              <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground tabular-nums my-0.5">
                $
                {Math.round(
                  activeSegment ? activeSegment.amount : donutData.totalUsd,
                ).toLocaleString("en-US")}
              </span>

              <span className="text-[10px] font-medium text-muted-foreground tracking-tight">
                {activeSegment
                  ? `${activeSegment.pct}% · ${activeSegment.count} ${activeSegment.count === 1 ? "factura" : "facturas"}`
                  : `${metrics?.touchless_rate ?? 0}% autónomo (STP)`}
              </span>
            </div>
          </div>

          {/* Leyenda minimalista y espaciosa con highlight interactivo */}
          <div className="flex flex-col gap-3.5 w-full sm:max-w-[260px]">
            {donutData.segments.map((seg) => {
              const isHovered = activeSegment?.label === seg.label;
              const hasActive = activeSegment !== null;

              return (
                <div
                  key={seg.id}
                  className={cn(
                    "flex items-center justify-between p-2.5 rounded-2xl border transition-all duration-200 cursor-pointer",
                    isHovered
                      ? "bg-muted/80 border-border/80 shadow-xs scale-[1.03]"
                      : hasActive
                        ? "opacity-40 border-transparent hover:opacity-100"
                        : "border-transparent hover:bg-muted/40",
                  )}
                  onMouseEnter={() =>
                    setActiveSegment({
                      label: seg.label,
                      shortLabel: seg.shortLabel,
                      amount: seg.amount,
                      count: seg.count,
                      pct: seg.pct,
                      color: seg.color,
                    })
                  }
                  onMouseLeave={() => setActiveSegment(null)}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={cn(
                        "rounded-full shrink-0 shadow-xs transition-all duration-200",
                        isHovered ? "size-3.5 ring-2 ring-offset-2 ring-offset-card" : "size-3",
                      )}
                      style={{ backgroundColor: seg.color }}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-semibold text-foreground truncate">
                        {seg.shortLabel}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {seg.count} facturas
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold text-foreground block tabular-nums">
                      ${Math.round(seg.amount).toLocaleString("en-US")}
                    </span>
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {seg.pct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer sutil */}
        <div className="pt-3 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-[#185338]" />
            Criterios de validación deterministas
          </span>
          <span className="font-semibold text-foreground">100% auditado</span>
        </div>
      </div>

      {/* TARJETA 2: Flujo Semanal en Barras Minimalistas + Gauge Presupuesto (5 columnas) */}
      <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-xs lg:col-span-5 flex flex-col justify-between transition-all hover:border-border">
        {/* Cabecera */}
        <div>
          <div className="flex items-center justify-between pb-4 border-b border-border/40">
            <div>
              <h3 className="text-sm font-bold tracking-tight text-foreground uppercase tracking-wider">
                Flujo Semanal
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Volumen diario de procesamiento
              </p>
            </div>

            <span className="rounded-full bg-[#185338] px-2.5 py-0.5 text-xs font-bold text-white shadow-xs">
              {metrics ? `${metrics.touchless_rate}% STP` : "Activo"}
            </span>
          </div>

          {/* Gráfico de Barras Estilo "Pill" Esbelta con expansión al hover */}
          <div className="pt-6">
            <div className="flex items-end justify-between gap-2 h-36 px-1">
              {barData.map((b, idx) => {
                const isHovered = activeBarIdx === idx;
                const hasActive = activeBarIdx !== null;

                return (
                  <div
                    key={b.dateKey}
                    className="group relative flex flex-1 flex-col items-center h-full justify-end cursor-pointer"
                    onMouseEnter={() => setActiveBarIdx(idx)}
                    onMouseLeave={() => setActiveBarIdx(null)}
                  >
                    {/* Tooltip flotante */}
                    {isHovered && (
                      <div className="absolute -top-12 z-20 rounded-lg border border-border/80 bg-popover/95 px-2.5 py-1 text-[11px] font-bold text-foreground shadow-lg backdrop-blur-sm pointer-events-none whitespace-nowrap animate-in fade-in-0 zoom-in-95">
                        {b.total} {b.total === 1 ? "factura" : "facturas"} ($
                        {Math.round(b.amount).toLocaleString("en-US")})
                      </div>
                    )}

                    {/* Barra de pista tenue con expansión perceptible */}
                    <div
                      className={cn(
                        "relative h-28 rounded-full bg-muted/40 overflow-hidden flex flex-col justify-end transition-all duration-200",
                        isHovered ? "w-4 sm:w-5 bg-muted/70 shadow-sm" : "w-3 sm:w-3.5",
                        hasActive && !isHovered ? "opacity-35" : "opacity-100",
                      )}
                    >
                      {/* Barra rellena en verde bosque si tiene datos o línea base sutil si está vacía */}
                      {b.total > 0 ? (
                        <div
                          style={{ height: `${b.heightPct}%` }}
                          className={cn(
                            "w-full rounded-full transition-all duration-300",
                            isHovered
                              ? "bg-[#185338] shadow-[0_0_8px_rgba(24,83,56,0.6)]"
                              : "bg-[#185338]/85",
                          )}
                        />
                      ) : (
                        <div
                          className={cn(
                            "w-full h-1 rounded-full transition-all duration-200",
                            isHovered ? "bg-muted-foreground/30" : "bg-muted-foreground/15",
                          )}
                        />
                      )}
                    </div>

                    <span
                      className={cn(
                        "mt-2 text-[11px] transition-all duration-150 truncate max-w-[42px] text-center",
                        isHovered
                          ? "font-bold text-foreground scale-105"
                          : hasActive
                            ? "text-muted-foreground/40 font-medium"
                            : "text-muted-foreground font-medium",
                      )}
                    >
                      {b.day}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sección Inferior: Anillo de Presupuesto Consumido */}
        <div className="mt-5 pt-4 border-t border-border/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Mini Anillo Radial */}
              <div className="relative size-12 shrink-0 flex items-center justify-center">
                <svg className="size-full -rotate-90" viewBox="0 0 80 80">
                  <circle
                    cx="40"
                    cy="40"
                    r="32"
                    className="stroke-muted/50 fill-none"
                    strokeWidth="7"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r="32"
                    fill="none"
                    className="stroke-[#185338] transition-all duration-500"
                    strokeWidth="7"
                    strokeDasharray={`${(budgetData.usedPct / 100) * budgetData.gaugeCircumference} ${budgetData.gaugeCircumference}`}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute text-[10px] font-bold text-foreground">
                  {budgetData.usedPct}%
                </span>
              </div>

              <div>
                <span className="text-xs font-bold text-foreground block">
                  Presupuesto ejecutado
                </span>
                <span className="text-[11px] text-muted-foreground">
                  ${Math.round(budgetData.remaining).toLocaleString("en-US")} disponibles de $
                  {Math.round(budgetData.totalBudget).toLocaleString("en-US")}
                </span>
              </div>
            </div>

            <span className="rounded-full bg-[#185338] px-2.5 py-0.5 text-[11px] font-bold text-white shadow-xs">
              {budgetData.statusText}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
