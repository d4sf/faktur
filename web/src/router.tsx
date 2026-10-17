import { Navigate, createBrowserRouter, RouterProvider } from "react-router-dom";

import AppShell from "@/components/layout/AppShell";
import Aprobacion from "@/pages/Aprobacion";
import Bandeja from "@/pages/Bandeja";
import Detalle from "@/pages/Detalle";
import Procesando from "@/pages/Procesando";
import Reglas from "@/pages/Reglas";
import Reporte from "@/pages/Reporte";
import Subir from "@/pages/Subir";
import Tablero from "@/pages/Tablero";

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Tablero /> },
      { path: "subir", element: <Subir /> },
      { path: "procesando", element: <Procesando /> },
      { path: "factura/:id", element: <Detalle /> },
      { path: "reglas", element: <Reglas /> },
      { path: "bandeja", element: <Bandeja /> },
      { path: "aprobacion/:id", element: <Aprobacion /> },
      { path: "reporte", element: <Reporte /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export function Router() {
  return <RouterProvider router={router} />;
}
