import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { useSession } from "@/components/session/SessionProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Permission } from "@/lib/roles";

export function Forbidden() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Card className="max-w-md">
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-muted">
            <Lock className="size-5 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-bold tracking-tight">Sin permiso para esta sección</h2>
          <p className="text-sm text-muted-foreground">
            Tu rol actual no incluye este acceso. Cambiá de usuario de demo en el sidebar para
            probar otro rol.
          </p>
          <Button asChild variant="outline" className="mt-1">
            <Link to="/">Volver al tablero</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const { can } = useSession();
  if (!can(permission)) return <Forbidden />;
  return <>{children}</>;
}
