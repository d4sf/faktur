import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function BentoGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {children}
    </div>
  );
}

export function BentoCard({
  children,
  className,
  span = 1,
}: {
  children: ReactNode;
  className?: string;
  span?: 1 | 2 | 4;
}) {
  const spanClass = span === 2 ? "sm:col-span-2" : span === 4 ? "lg:col-span-4" : "";
  return <div className={cn(spanClass, className)}>{children}</div>;
}
