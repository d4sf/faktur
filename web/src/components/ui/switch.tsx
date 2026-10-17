/**
 * @file switch.tsx
 * @description Componente primitivo accesible de interruptor (Switch / Toggle),
 * estilizado con Tailwind CSS y preparado para control de tema y opciones booleanas.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Propiedades del componente Switch.
 */
interface SwitchProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Estado de activación del switch.
   */
  checked?: boolean;
  /**
   * Callback ejecutado al alternar el estado del switch.
   */
  onCheckedChange?: (checked: boolean) => void;
}

/**
 * Interruptor con rol accesible WAI-ARIA role="switch".
 */
const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked = false, onCheckedChange, disabled, onClick, ...props }, ref) => {
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled) return;
      onCheckedChange?.(!checked);
      onClick?.(e);
    };

    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        data-state={checked ? "checked" : "unchecked"}
        disabled={disabled}
        ref={ref}
        onClick={handleClick}
        className={cn(
          "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-primary" : "bg-muted-foreground/30",
          className,
        )}
        {...props}
      >
        <span
          data-state={checked ? "checked" : "unchecked"}
          className={cn(
            "pointer-events-none block size-5 rounded-full bg-background shadow-lg ring-0 transition-transform duration-200 ease-in-out",
            checked ? "translate-x-5" : "translate-x-0",
          )}
        />
      </button>
    );
  },
);

Switch.displayName = "Switch";

export { Switch };
