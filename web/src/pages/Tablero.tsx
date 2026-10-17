import { BentoCard, BentoGrid } from "@/components/layout/BentoGrid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Tablero() {
  return (
    <BentoGrid>
      {["Touchless Rate", "Presupuesto Restante", "Total Procesadas", "Pendientes"].map((title) => (
        <BentoCard key={title}>
          <Card>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Próximamente</p>
            </CardContent>
          </Card>
        </BentoCard>
      ))}
    </BentoGrid>
  );
}
