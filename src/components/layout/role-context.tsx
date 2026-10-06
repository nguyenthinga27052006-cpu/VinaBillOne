import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_ROLE } from "@/lib/billing/roles";
import type { Role } from "@/lib/billing/types";
import { ROLES } from "@/lib/billing/types";

const KEY = "vinabill-role";

type Ctx = {
  role: Role;
  setRole: (r: Role) => void;
};

const RoleContext = createContext<Ctx>({ role: DEFAULT_ROLE, setRole: () => {} });

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>(DEFAULT_ROLE);

  useEffect(() => {
    const stored = window.localStorage.getItem(KEY);
    if (stored && (ROLES as readonly string[]).includes(stored)) {
      setRoleState(stored as Role);
    }
  }, []);

  const setRole = (r: Role) => {
    setRoleState(r);
    window.localStorage.setItem(KEY, r);
  };

  const value = useMemo(() => ({ role, setRole }), [role]);
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  return useContext(RoleContext);
}
