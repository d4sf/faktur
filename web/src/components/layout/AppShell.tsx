/**
 * @file AppShell.tsx
 * @description Estructura de layout principal de la aplicación Blinka PayAgent.
 * Provee la barra lateral fija con navegación canónica, el encabezado superior con ThemeToggle
 * y el contenedor principal para el renderizado de rutas mediante Outlet.
 */

import {
  Database,
  FileSpreadsheet,
  Inbox,
  LayoutDashboard,
  Menu,
  SlidersHorizontal,
  UploadCloud,
} from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Tablero", icon: LayoutDashboard },
  { to: "/subir", label: "Subir factura", icon: UploadCloud },
  { to: "/bandeja", label: "Bandeja de revisión", icon: Inbox },
  { to: "/reglas", label: "Reglas de política", icon: SlidersHorizontal },
  { to: "/reporte", label: "Reporte CSV", icon: FileSpreadsheet },
  { to: "/datos", label: "Datos de demo", icon: Database },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();

  return (
    <SidebarMenu className="gap-1">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive =
          item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);

        return (
          <SidebarMenuItem key={item.to}>
            <SidebarMenuButton
              asChild
              isActive={isActive}
              className={cn(
                "h-9 px-3 rounded-xl font-medium transition-all duration-150",
                isActive
                  ? "!bg-[#185338] !text-white font-semibold shadow-xs hover:!bg-[#185338] hover:!text-white"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <NavLink
                to={item.to}
                end={item.to === "/"}
                onClick={onNavigate}
                className="flex w-full items-center gap-2.5"
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0 transition-colors",
                    isActive ? "!text-white opacity-100" : "text-muted-foreground",
                  )}
                />
                <span className={cn(isActive ? "!text-white font-semibold" : "")}>
                  {item.label}
                </span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

export default function AppShell() {
  const location = useLocation();
  const currentItem = navItems.find((item) =>
    item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to),
  );

  return (
    <SidebarProvider>
      <div className="flex min-h-svh w-full bg-background">
        <Sidebar className="hidden md:flex border-r border-sidebar-border bg-sidebar">
          <SidebarHeader className="flex h-14 justify-center border-b border-sidebar-border px-5">
            <div className="flex flex-col">
              <span className="text-sm font-bold leading-tight tracking-tight text-sidebar-foreground">
                Blinka PayAgent
              </span>
              <span className="text-[11px] leading-tight text-muted-foreground font-normal">
                Revisión de facturas
              </span>
            </div>
          </SidebarHeader>

          <SidebarContent className="py-2">
            <SidebarGroup className="p-0">
              <SidebarGroupLabel className="px-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Navegación
              </SidebarGroupLabel>
              <SidebarGroupContent className="mt-1 px-3">
                <NavLinks />
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="border-t border-sidebar-border/60 p-3">
            <ThemeToggle />
          </SidebarFooter>
        </Sidebar>

        <div className="flex flex-1 flex-col min-w-0">
          <header className="flex h-14 items-center justify-between border-b border-border px-4 md:px-8 bg-card/40 backdrop-blur-sm sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden">
                    <Menu className="size-5" />
                    <span className="sr-only">Abrir menú</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-0 flex flex-col justify-between">
                  <div>
                    <SheetHeader className="border-b border-border p-4 text-left">
                      <SheetTitle className="text-base font-bold">Blinka PayAgent</SheetTitle>
                    </SheetHeader>
                    <nav className="p-3">
                      <NavLinks />
                    </nav>
                  </div>
                  <div className="border-t border-border p-4">
                    <ThemeToggle />
                  </div>
                </SheetContent>
              </Sheet>

              <div className="flex items-center gap-2">
                <h1 className="text-base md:text-lg font-semibold tracking-tight">
                  {currentItem?.label ?? "Panel"}
                </h1>
              </div>
            </div>
          </header>

          <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-6 md:px-8 md:py-8 lg:px-10 lg:py-8">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
