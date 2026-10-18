/**
 * @file roles.ts
 * @description Matriz estática de roles y permisos del MVP. Los permisos se aplican en el
 * cliente (navegación, rutas y acciones); el API no valida rol.
 */

export const PERMISSIONS = [
  "dashboard:view",
  "invoice:upload",
  "invoice:view",
  "approval:resolve",
  "policy:edit",
  "report:view",
  "billing:view",
  "integrations:manage",
  "demo:reset",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type Role = "cfo" | "analyst" | "approver" | "auditor";

export const ROLE_LABELS: Record<Role, string> = {
  cfo: "CFO / Controller",
  analyst: "Analista AP",
  approver: "Aprobador",
  auditor: "Auditor",
};

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  cfo: PERMISSIONS,
  analyst: ["dashboard:view", "invoice:upload", "invoice:view"],
  approver: ["dashboard:view", "invoice:view", "approval:resolve"],
  auditor: ["dashboard:view", "invoice:view", "report:view"],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
