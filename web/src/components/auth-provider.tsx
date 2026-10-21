"use client";

import { useRouter } from "next/navigation";
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { ApiError, CurrentUser, fetchCurrentUser, getToken, logout as apiLogout } from "@/lib/api";

interface AuthContextValue {
  user: CurrentUser;
  /** True if the user holds the permission tag. UI gating only; the API enforces. */
  can: (tag: string) => boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Loads the signed-in user; sends anyone without a valid token to /login. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
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

  if (error) return <main className="p-4 text-red-600">{error}</main>;
  if (!user) return <main className="p-4 text-neutral-500">Loading…</main>;

  const can = (tag: string) => user.permissions.includes(tag);
  return <AuthContext.Provider value={{ user, can, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
