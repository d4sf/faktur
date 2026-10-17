import { BentoCard, BentoGrid } from "@/components/layout/BentoGrid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Aprobacion() {
  return (
    <BentoGrid>
      <BentoCard span={4}>
        <Card>
          <CardHeader>
            <CardTitle>Aprobacion</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Próximamente</p>
          </CardContent>
        </Card>
      </BentoCard>
    </BentoGrid>
  );
}
