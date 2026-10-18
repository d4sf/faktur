import { lazy, Suspense } from "react";
import { Navigate, createBrowserRouter, RouterProvider } from "react-router-dom";

import AppShell from "@/components/layout/AppShell";
import Tablero from "@/pages/Tablero";

// Lazy-loaded routes para code splitting enterprise y reducción del bundle inicial
const Subir = lazy(() => import("@/pages/Subir"));
const Procesando = lazy(() => import("@/pages/Procesando"));
const Detalle = lazy(() => import("@/pages/Detalle"));
const Reglas = lazy(() => import("@/pages/Reglas"));
const Bandeja = lazy(() => import("@/pages/Bandeja"));
const Aprobacion = lazy(() => import("@/pages/Aprobacion"));
const Reporte = lazy(() => import("@/pages/Reporte"));
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

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Tablero /> },
      {
        path: "subir",
        element: (
          <Suspense fallback={<RouteLoadingFallback />}>
            <Subir />
          </Suspense>
        ),
      },
      {
        path: "procesando",
        element: (
          <Suspense fallback={<RouteLoadingFallback />}>
            <Procesando />
          </Suspense>
        ),
      },
      {
        path: "factura/:id",
        element: (
          <Suspense fallback={<RouteLoadingFallback />}>
            <Detalle />
          </Suspense>
        ),
      },
      {
        path: "reglas",
        element: (
          <Suspense fallback={<RouteLoadingFallback />}>
            <Reglas />
          </Suspense>
        ),
      },
      {
        path: "bandeja",
        element: (
          <Suspense fallback={<RouteLoadingFallback />}>
            <Bandeja />
          </Suspense>
        ),
      },
      {
        path: "aprobacion/:id",
        element: (
          <Suspense fallback={<RouteLoadingFallback />}>
            <Aprobacion />
          </Suspense>
        ),
      },
      {
        path: "reporte",
        element: (
          <Suspense fallback={<RouteLoadingFallback />}>
            <Reporte />
          </Suspense>
        ),
      },
      {
        path: "datos",
        element: (
          <Suspense fallback={<RouteLoadingFallback />}>
            <Datos />
          </Suspense>
        ),
      },
      {
        path: "integraciones",
        element: (
          <Suspense fallback={<RouteLoadingFallback />}>
            <Integraciones />
          </Suspense>
        ),
      },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export function Router() {
  return <RouterProvider router={router} />;
}
