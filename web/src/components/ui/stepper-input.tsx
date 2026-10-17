import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "cn";

export interface StepperInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  prefix?: string;
  suffix?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
}

export function StepperInput({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  prefix,
  suffix,
  disabled = false,
  className,
  inputClassName,
}: StepperInputProps) {
  const handleStep = (direction: 1 | -1) => {
    if (disabled) return;
    const next = value + direction * step;
    const clampedMin = min !== undefined ? Math.max(min, next) : next;
    const clamped = max !== undefined ? Math.min(max, clampedMin) : clampedMin;
    onChange(Number(clamped.toFixed(2)));
  };

  return (
    <div
      className={cn(
        "relative inline-flex items-center rounded-lg border border-border/80 bg-background/90 shadow-xs focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20 transition-all overflow-hidden",
        disabled && "opacity-50 pointer-events-none",
        className,
      )}
    >
      {prefix && (
        <span className="pl-2.5 pr-0.5 text-xs font-semibold text-muted-foreground select-none pointer-events-none">
          {prefix}
        </span>
      )}

      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const val = Number(e.target.value);
          if (!isNaN(val)) onChange(val);
        }}
        disabled={disabled}
        className={cn(
          "h-8 min-w-0 bg-transparent text-right font-mono text-xs font-bold text-foreground outline-none px-1.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
          inputClassName,
        )}
      />

      {suffix && (
        <span className="pr-1 text-xs font-semibold text-muted-foreground select-none pointer-events-none">
          {suffix}
        </span>
      )}

      {/* Flechitas estilizadas perfectamente integradas */}
      <div className="flex flex-col border-l border-border/70 my-0.5 ml-1 pr-0.5">
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled || (max !== undefined && value >= max)}
          onClick={() => handleStep(1)}
          className="h-3.5 w-4 flex items-center justify-center rounded-xs text-muted-foreground hover:text-foreground hover:bg-muted active:bg-muted/80 transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
        >
          <ChevronUp className="size-2.5" />
        </button>
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled || (min !== undefined && value <= min)}
          onClick={() => handleStep(-1)}
          className="h-3.5 w-4 flex items-center justify-center rounded-xs text-muted-foreground hover:text-foreground hover:bg-muted active:bg-muted/80 transition-colors cursor-pointer border-t border-border/50 disabled:opacity-30 disabled:pointer-events-none"
        >
          <ChevronDown className="size-2.5" />
        </button>
      </div>
    </div>
  );
}
