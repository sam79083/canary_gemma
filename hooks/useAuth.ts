"use client";

import { useCallback, useEffect, useState } from "react";

/** Member session (server HttpOnly cookie). Null = visitor. */
export function useAuth() {
  const [user, setUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch("/api/auth", { cache: "no-store" });
      const data = (await res.json()) as { loggedIn?: boolean; user?: string };
      const u = data.loggedIn && data.user ? data.user : null;
      setUser(u);
      return u;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (id: string, pw: string): Promise<boolean> => {
      setChecking(true);
      setError(null);
      try {
        const res = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, pw }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          user?: string;
          error?: string;
        };
        if (res.ok && data.ok) {
          setUser(data.user ?? id.trim());
          return true;
        }
        setError(data.error || `Login failed (HTTP ${res.status})`);
        return false;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Login failed");
        return false;
      } finally {
        setChecking(false);
      }
    },
    [],
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await fetch("/api/auth", { method: "DELETE" });
    } catch {
      // cookie stays until expiry — still treat as logged out locally
    }
    setUser(null);
  }, []);

  return { user, loggedIn: user !== null, loading, checking, error, login, logout, refresh };
}

export type AuthApi = ReturnType<typeof useAuth>;
