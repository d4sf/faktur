/**
 * @file VerdictBadge.tsx
 * @description Componente de etiqueta visual sólida para los tres veredictos canónicos:
 * PAGAR (verde esmeralda), FRENAR (rojo carmín) y ESCALAR (ámbar dorado).
 * Diseñado sin emojis circulares y con esquinas suaves (rounded-md) para máxima legibilidad fintech.
 */

import { cn } from "@/lib/utils";

/**
 * Propiedades del componente VerdictBadge.
 */
interface VerdictBadgeProps {
  /**
   * Veredicto canónico a representar.
   */
  verdict: "PAGAR" | "FRENAR" | "ESCALAR" | string;
  /**
   * Tamaño visual del badge: 'sm' (tablas densas), 'md' (por defecto) o 'lg' (tarjetas y encabezados).
   */
  size?: "sm" | "md" | "lg";
  /**
   * Variante visual: 'solid' (bloque sólido) o 'pill' (cápsula con punto indicador de estado).
   */
  variant?: "solid" | "pill";
  /**
   * Clases adicionales opcionales de Tailwind CSS.
   */
  className?: string;
}

/**
 * Renderiza la etiqueta de veredicto con fondo sólido o en formato cápsula con indicador.
 */
export function VerdictBadge({
  verdict,
  size = "md",
  variant = "solid",
  className,
}: VerdictBadgeProps) {
  const sizeStyles = {
    sm: "px-2 py-0.5 text-[10px]",
    md: "px-2.5 py-0.5 text-[11px]",
    lg: "px-3 py-1 text-xs font-bold",
  }[size];

  // Variante cápsula con punto indicador (no parece un botón interactivo)
  if (variant === "pill") {
    const pillStyles =
      {
        PAGAR: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        FRENAR: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
        ESCALAR: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
      }[verdict] || "border-border bg-muted text-muted-foreground";

    const dotColor =
      {
        PAGAR: "bg-emerald-500",
        FRENAR: "bg-rose-500",
        ESCALAR: "bg-amber-500",
      }[verdict] || "bg-muted-foreground";

    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border text-[10px] font-mono tracking-wider font-semibold select-none shadow-none",
          pillStyles,
          sizeStyles,
          className,
        )}
      >
        <span className={cn("size-1.5 rounded-full shrink-0", dotColor)} />
        <span>{verdict}</span>
      </span>
    );
  }

  // Variante sólida predeterminada
  if (verdict === "PAGAR") {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center font-bold tracking-wider text-white bg-emerald-600 dark:bg-emerald-600 rounded-md shadow-xs select-none",
          sizeStyles,
          className,
        )}
      >
        PAGAR
      </span>
    );
  }

  if (verdict === "FRENAR") {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center font-bold tracking-wider text-white bg-rose-600 dark:bg-rose-600 rounded-md shadow-xs select-none",
          sizeStyles,
          className,
        )}
      >
        FRENAR
      </span>
    );
  }

  if (verdict === "ESCALAR") {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center font-bold tracking-wider text-white bg-amber-500 dark:bg-amber-600 rounded-md shadow-xs select-none",
          sizeStyles,
          className,
        )}
      >
        ESCALAR
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center font-medium bg-muted text-foreground rounded-md",
        sizeStyles,
        className,
      )}
    >
      {verdict}
    </span>
  );
}
