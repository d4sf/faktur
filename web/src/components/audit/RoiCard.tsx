import { Skeleton } from "@/components/ui/skeleton";

interface RoiCardProps {
  title: string;
  value: string;
  subtitle: string;
  variant?: "hero" | "default";
  loading?: boolean;
}

export function RoiCard({
  title,
  value,
  subtitle,
  variant = "default",
  loading = false,
}: RoiCardProps) {
  if (variant === "hero") {
    return (
      <div className="rounded-2xl bg-[#185338] text-white p-5 shadow-xs flex flex-col justify-between min-h-[130px]">
        <div>
          <span className="text-xs font-medium text-emerald-100/90">{title}</span>
          {loading ? (
            <div className="h-9 flex items-center mt-1.5">
              <Skeleton className="h-8 w-28 bg-white/20" />
            </div>
          ) : (
            <div className="text-3xl font-extrabold tracking-tight mt-1.5 font-logo">{value}</div>
          )}
        </div>
        <p className="text-[11px] font-medium text-emerald-200 mt-2">{subtitle}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-card border border-border/80 p-5 shadow-xs flex flex-col justify-between min-h-[130px] hover:border-border transition-colors">
      <div>
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        {loading ? (
          <div className="h-9 flex items-center mt-1.5">
            <Skeleton className="h-8 w-28" />
          </div>
        ) : (
          <div className="text-3xl font-extrabold tracking-tight text-foreground mt-1.5 font-logo">
            {value}
          </div>
        )}
      </div>
      <p className="text-[11px] font-medium text-muted-foreground mt-2">{subtitle}</p>
    </div>
  );
}
