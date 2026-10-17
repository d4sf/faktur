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
   * Clases adicionales opcionales de Tailwind CSS.
   */
  className?: string;
}

/**
 * Renderiza la etiqueta de veredicto con fondo sólido y tipografía en negrita.
 */
export function VerdictBadge({ verdict, size = "md", className }: VerdictBadgeProps) {
  const sizeStyles = {
    sm: "px-2 py-0.5 text-[10px]",
    md: "px-2.5 py-0.5 text-[11px]",
    lg: "px-3 py-1 text-xs font-bold",
  }[size];

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
