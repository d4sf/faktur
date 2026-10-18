import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, createBrowserRouter, RouterProvider } from "react-router-dom";

import AppShell from "@/components/layout/AppShell";
import { RequirePermission } from "@/components/auth/RequirePermission";
import type { Permission } from "@/lib/roles";
import Tablero from "@/pages/Tablero";

// Lazy-loaded routes para code splitting enterprise y reducción del bundle inicial
const Subir = lazy(() => import("@/pages/Subir"));
const Procesando = lazy(() => import("@/pages/Procesando"));
const Detalle = lazy(() => import("@/pages/Detalle"));
const Reglas = lazy(() => import("@/pages/Reglas"));
const Bandeja = lazy(() => import("@/pages/Bandeja"));
const Aprobacion = lazy(() => import("@/pages/Aprobacion"));
const Reporte = lazy(() => import("@/pages/Reporte"));
const Facturacion = lazy(() => import("@/pages/Facturacion"));
const Datos = lazy(() => import("@/pages/Datos"));
const Integraciones = lazy(() => import("@/pages/Integraciones"));

function RouteLoadingFallback() {
  return (
    <div className="flex h-[50vh] w-full flex-col items-center justify-center gap-3 animate-in fade-in duration-150">
      <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <span className="text-xs text-muted-foreground font-medium">Cargando vista…</span>
    </div>
  );
}

/**
 * Envuelve una ruta con el permiso que exige. El permiso se aplica en el cliente: el API no
 * valida rol (limitación conocida del MVP).
 */
function guarded(permission: Permission, element: ReactNode) {
  return <RequirePermission permission={permission}>{element}</RequirePermission>;
}

function lazyPage(element: ReactNode) {
  return <Suspense fallback={<RouteLoadingFallback />}>{element}</Suspense>;
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: guarded("dashboard:view", <Tablero />) },
      {
        path: "subir",
        element: guarded("invoice:upload", lazyPage(<Subir />)),
      },
      {
        path: "procesando",
        element: guarded("invoice:upload", lazyPage(<Procesando />)),
      },
      {
        path: "factura/:id",
        element: guarded("invoice:view", lazyPage(<Detalle />)),
      },
      {
        path: "reglas",
        element: guarded("policy:edit", lazyPage(<Reglas />)),
      },
      {
        path: "bandeja",
        element: guarded("approval:resolve", lazyPage(<Bandeja />)),
      },
      {
        path: "aprobacion/:id",
        element: guarded("approval:resolve", lazyPage(<Aprobacion />)),
      },
      {
        path: "reporte",
        element: guarded("report:view", lazyPage(<Reporte />)),
      },
      {
        path: "facturacion",
        element: guarded("billing:view", lazyPage(<Facturacion />)),
      },
      {
        path: "datos",
        element: guarded("demo:reset", lazyPage(<Datos />)),
      },
      {
        path: "integraciones",
        element: guarded("integrations:manage", lazyPage(<Integraciones />)),
      },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export function Router() {
  return <RouterProvider router={router} />;
}
