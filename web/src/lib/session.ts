/**
 * @file session.ts
 * @description Usuarios de demo y persistencia mínima de la sesión en localStorage.
 * No hay autenticación: el usuario se elige desde el selector del sidebar.
 */

import type { Role } from "@/lib/roles";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export const DEMO_USERS: readonly User[] = [
  { id: "cfo", name: "Valentina Ríos", email: "cfo@flush.demo", role: "cfo" },
  { id: "analyst", name: "Martín Salas", email: "analista@flush.demo", role: "analyst" },
  { id: "approver", name: "Carla Méndez", email: "aprobador@flush.demo", role: "approver" },
  { id: "auditor", name: "Diego Paredes", email: "auditor@flush.demo", role: "auditor" },
];

export const SESSION_KEY = "flush.session.userId";

export function parseSession(raw: string | null): string | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/** Fallback al CFO: una sesión corrupta no debe dejar la app sin usuario. */
export function resolveUser(raw: string | null): User {
  const id = parseSession(raw);
  return DEMO_USERS.find((user) => user.id === id) ?? DEMO_USERS[0];
}

export function serializeSession(userId: string): string {
  return userId;
}
