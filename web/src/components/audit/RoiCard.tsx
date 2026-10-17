import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface RoiCardProps {
  title: string;
  value: string;
  subtitle: string;
}

export function RoiCard({ title, value, subtitle }: RoiCardProps) {
  return (
    <Card className="rounded-xl border border-border/70 shadow-xs hover:shadow-md transition-all">
      <CardHeader className="pb-1.5">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  );
}
