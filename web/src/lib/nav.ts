import {
  CreditCard,
  Database,
  FileSpreadsheet,
  Inbox,
  LayoutDashboard,
  SlidersHorizontal,
  UploadCloud,
  Webhook,
  type LucideIcon,
} from "lucide-react";

import { can, type Permission, type Role } from "@/lib/roles";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission: Permission;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: "/", label: "Tablero", icon: LayoutDashboard, permission: "dashboard:view" },
  { to: "/subir", label: "Subir factura", icon: UploadCloud, permission: "invoice:upload" },
  { to: "/bandeja", label: "Bandeja de revisión", icon: Inbox, permission: "approval:resolve" },
  {
    to: "/reglas",
    label: "Reglas de política",
    icon: SlidersHorizontal,
    permission: "policy:edit",
  },
  { to: "/facturacion", label: "Facturación", icon: CreditCard, permission: "billing:view" },
  { to: "/reporte", label: "Reporte CSV", icon: FileSpreadsheet, permission: "report:view" },
  {
    to: "/integraciones",
    label: "Integraciones",
    icon: Webhook,
    permission: "integrations:manage",
  },
  { to: "/datos", label: "Datos de demo", icon: Database, permission: "demo:reset" },
];

export function visibleNavItems(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => can(role, item.permission));
}
