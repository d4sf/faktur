interface RoiCardProps {
  title: string;
  value: string;
  subtitle: string;
  variant?: "hero" | "default";
}

export function RoiCard({ title, value, subtitle, variant = "default" }: RoiCardProps) {
  if (variant === "hero") {
    return (
      <div className="rounded-2xl bg-[#185338] text-white p-5 shadow-xs flex flex-col justify-between min-h-[130px]">
        <div>
          <span className="text-xs font-medium text-emerald-100/90">{title}</span>
          <div className="text-3xl font-extrabold tracking-tight mt-1.5">{value}</div>
        </div>
        <p className="text-[11px] font-medium text-emerald-200 mt-2">{subtitle}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-card border border-border/80 p-5 shadow-xs flex flex-col justify-between min-h-[130px] hover:border-border transition-colors">
      <div>
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <div className="text-3xl font-extrabold tracking-tight text-foreground mt-1.5">{value}</div>
      </div>
      <p className="text-[11px] font-medium text-muted-foreground mt-2">{subtitle}</p>
    </div>
  );
}
