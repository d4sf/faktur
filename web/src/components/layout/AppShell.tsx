/**
 * @file AppShell.tsx
 * @description Estructura de layout principal de la aplicación Blinka PayAgent.
 * Provee la barra lateral fija con navegación canónica, el encabezado superior con ThemeToggle
 * y el contenedor principal para el renderizado de rutas mediante Outlet.
 */

import { Menu } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useRef } from "react";

import { useSession } from "@/components/session/SessionProvider";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NAV_ITEMS, visibleNavItems } from "@/lib/nav";
import { ROLE_LABELS } from "@/lib/roles";
import { DEMO_USERS } from "@/lib/session";
import { cn } from "@/lib/utils";

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const { user } = useSession();
  const items = visibleNavItems(user.role);
  const lastNav = useRef(0);

  const handleNavigate = (e: { preventDefault: () => void }) => {
    const now = Date.now();
    if (now - lastNav.current < 300) {
      e.preventDefault();
      return;
    }
    lastNav.current = now;
    onNavigate?.();
  };

  return (
    <SidebarMenu className="gap-1">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive =
          item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);

        return (
          <SidebarMenuItem
            key={item.to}
            className="h-9 flex items-center group-data-[collapsible=icon]:justify-center"
          >
            <SidebarMenuButton
              asChild
              isActive={isActive}
              tooltip={item.label}
              className={cn(
                "h-9 px-3 rounded-xl font-medium transition-[width,padding,background-color,border-radius,box-shadow] duration-300 ease-in-out",
                "group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:rounded-lg group-data-[collapsible=icon]:justify-center",
                isActive
                  ? "!bg-[#185338] !text-white font-semibold shadow-xs hover:!bg-[#185338] hover:!text-white"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <NavLink
                to={item.to}
                end={item.to === "/"}
                onClick={handleNavigate}
                className="flex w-full items-center gap-3 overflow-hidden transition-[width,padding,gap] duration-300 ease-in-out group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:!p-0"
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0 transition-transform duration-300 ease-in-out group-hover/menu-item:scale-110",
                    isActive ? "!text-white opacity-100" : "text-muted-foreground",
                  )}
                />
                <span
                  className={cn(
                    "overflow-hidden whitespace-nowrap transition-[opacity,max-width,transform] duration-300 ease-in-out group-data-[collapsible=icon]:max-w-0 group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:-translate-x-2 max-w-[180px] opacity-100 translate-x-0",
                    isActive ? "!text-white font-semibold" : "",
                  )}
                >
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

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}

function UserSwitcher() {
  const { user, switchUser } = useSession();

  return (
    <div className="space-y-1.5 group-data-[collapsible=icon]:hidden">
      <div className="flex items-center gap-2 overflow-hidden">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#185338] text-[10px] font-bold text-white">
          {initials(user.name)}
        </div>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-xs font-semibold text-sidebar-foreground">{user.name}</p>
          <p className="truncate text-[10px] text-muted-foreground">{ROLE_LABELS[user.role]}</p>
        </div>
      </div>
      <select
        aria-label="Cambiar usuario de demo"
        value={user.id}
        onChange={(event) => switchUser(event.target.value)}
        className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[11px] text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {DEMO_USERS.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.name} — {ROLE_LABELS[candidate.role]}
          </option>
        ))}
      </select>
      <p className="text-[9px] text-muted-foreground">Sesión de demo — sin autenticación</p>
    </div>
  );
}

export default function AppShell() {
  const location = useLocation();
  const currentItem = NAV_ITEMS.find((item) =>
    item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to),
  );

  return (
    <SidebarProvider>
      <div className="flex min-h-svh w-full bg-background">
        <Sidebar
          collapsible="icon"
          className="hidden md:flex border-r border-sidebar-border bg-sidebar"
        >
          <SidebarHeader className="flex h-14 justify-center border-b border-sidebar-border px-4 transition-[padding] duration-300 ease-in-out group-data-[collapsible=icon]:px-2">
            <div className="flex items-center gap-3 overflow-hidden">
              <img
                src="/logo.svg"
                alt="FLUSH Logo"
                className="size-8 shrink-0 object-contain rounded-lg transition-transform duration-300 ease-in-out hover:scale-105"
              />
              <div className="flex flex-col min-w-0 overflow-hidden whitespace-nowrap transition-[opacity,max-width,transform] duration-300 ease-in-out group-data-[collapsible=icon]:max-w-0 group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:-translate-x-2 max-w-[180px] opacity-100 translate-x-0">
                <span className="text-base font-bold leading-tight tracking-tight text-sidebar-foreground truncate font-logo">
                  FLUSH
                </span>
                <span className="text-[11px] leading-tight text-muted-foreground font-normal truncate">
                  Revisión de facturas
                </span>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent className="py-2">
            <SidebarGroup className="p-0">
              <SidebarGroupContent className="px-3 transition-[padding] duration-300 ease-in-out group-data-[collapsible=icon]:px-2">
                <NavLinks />
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="border-t border-sidebar-border/60 p-3 group-data-[collapsible=icon]:p-1.5 transition-all duration-300">
            <div className="space-y-2">
              <UserSwitcher />
              <ThemeToggle />
            </div>
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
                      <div className="flex items-center gap-2.5">
                        <img
                          src="/logo.svg"
                          alt="FLUSH Logo"
                          className="size-8 shrink-0 object-contain rounded-lg"
                        />
                        <div>
                          <SheetTitle className="text-lg font-bold font-logo leading-tight">
                            FLUSH
                          </SheetTitle>
                          <p className="text-[11px] text-muted-foreground">Revisión de facturas</p>
                        </div>
                      </div>
                    </SheetHeader>
                    <nav className="p-3">
                      <NavLinks />
                    </nav>
                  </div>
                  <div className="border-t border-border p-4">
                    <div className="space-y-3">
                      <UserSwitcher />
                      <ThemeToggle />
                    </div>
                  </div>
                </SheetContent>
              </Sheet>

              <SidebarTrigger className="hidden md:flex text-muted-foreground hover:text-foreground transition-transform duration-200 ease-in-out hover:scale-105 active:scale-95" />

              <div className="flex items-center gap-2">
                <h1 className="text-base md:text-lg font-semibold tracking-tight font-logo">
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
