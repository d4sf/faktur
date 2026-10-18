import React from "react";
import { cn } from "@/lib/utils";

interface MoneyDisplayProps {
  amount: number;
  currency?: string;
  showCurrencyCode?: boolean;
  originalAmount?: number;
  originalCurrency?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function formatCurrencyValue(val: number): string {
  return val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const MoneyDisplay: React.FC<MoneyDisplayProps> = ({
  amount,
  currency = "USD",
  showCurrencyCode = true,
  originalAmount,
  originalCurrency,
  className,
  size = "md",
}) => {
  const isForeign =
    originalCurrency && originalCurrency !== currency && originalAmount !== undefined;

  const sizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-xl font-bold",
  };

  const formattedMain = showCurrencyCode
    ? `$${formatCurrencyValue(amount)} ${currency}`
    : `$${formatCurrencyValue(amount)}`;

  return (
    <div className={cn("inline-flex flex-col", className)}>
      <span
        className={cn("font-semibold text-foreground tracking-tight font-mono", sizeClasses[size])}
        aria-label={formattedMain}
      >
        {formattedMain}
      </span>
      {isForeign && (
        <span
          className="text-[11px] text-muted-foreground font-normal"
          aria-label={`Monto original: ${originalCurrency} ${formatCurrencyValue(originalAmount)}`}
        >
          {originalCurrency} {formatCurrencyValue(originalAmount)}
        </span>
      )}
    </div>
  );
};
