import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import { can as roleCan, type Permission } from "@/lib/roles";
import { SESSION_KEY, resolveUser, serializeSession, type User } from "@/lib/session";

interface SessionValue {
  user: User;
  can: (permission: Permission) => boolean;
  switchUser: (id: string) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

function readStoredSession(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function SessionProvider({
  children,
  initialUser,
}: {
  children: ReactNode;
  initialUser?: User;
}) {
  const [user, setUser] = useState<User>(() => initialUser ?? resolveUser(readStoredSession()));

  const value = useMemo<SessionValue>(
    () => ({
      user,
      can: (permission) => roleCan(user.role, permission),
      switchUser: (id) => {
        const next = resolveUser(id);
        setUser(next);
        try {
          window.localStorage.setItem(SESSION_KEY, serializeSession(next.id));
        } catch {
          // localStorage puede no estar disponible (modo privado): la sesión vive solo en memoria.
        }
      },
    }),
    [user],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (value === null) throw new Error("useSession debe usarse dentro de <SessionProvider>");
  return value;
}
