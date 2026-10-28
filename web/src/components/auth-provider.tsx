"use client";

import { useRouter } from "next/navigation";
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { api, ApiError, CurrentUser, fetchCurrentUser, getToken, logout as apiLogout } from "@/lib/api";

interface AuthContextValue {
  user: CurrentUser;
  /** True if the user holds the permission tag. UI gating only; the API enforces. */
  can: (tag: string) => boolean;
  logout: () => Promise<void>;
  /** OPERATIONS_ENABLED on the server: finance, stock, service, HR etc. are switched on. */
  operations: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Loads the signed-in user; sends anyone without a valid token to /login. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  // null until GET /config answers, so pages don't flash "not available" while the switch is loading.
  const [operations, setOperations] = useState<boolean | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    // If the switch can't be read, keep operations hidden (the API blocks them anyway).
    api<{ operationsEnabled: boolean }>("/config")
      .then((c) => setOperations(c.operationsEnabled))
      .catch(() => setOperations(false));
    fetchCurrentUser()
      .then(setUser)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) router.replace("/login");
        else setError(err instanceof Error ? err.message : "Could not load user");
      });
  }, [router]);

  const logout = useCallback(async () => {
    await apiLogout().catch(() => undefined);
    router.replace("/login");
  }, [router]);

  if (error) return <main className="grid min-h-screen place-items-center p-4 text-sm font-medium text-red-600">{error}</main>;
  if (!user || operations === null) {
    return (
      <main className="grid min-h-screen place-items-center p-4">
        <div className="flex items-center gap-3 text-sm text-neutral-500">
          <span className="size-4 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" aria-hidden />
          Loading Precon ERP…
        </div>
      </main>
    );
  }

  const can = (tag: string) => user.permissions.includes(tag);
  return <AuthContext.Provider value={{ user, can, logout, operations }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
