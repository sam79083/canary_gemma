"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/supabase/client";

/** Supabase member session. Null = visitor. user is the account email. */
export function useAuth() {
  const [user, setUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<string | null> => {
    try {
      const sb = supabaseBrowser();
      if (!sb) return null;
      const {
        data: { user: u },
      } = await sb.auth.getUser();
      const email = u?.email ?? null;
      setUser(email);
      return email;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const sb = supabaseBrowser();
    if (!sb) return;
    const { data: sub } = sb.auth.onAuthStateChange((_ev, session) => {
      setUser(session?.user?.email ?? null);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  const login = useCallback(
    async (email: string, pw: string): Promise<boolean> => {
      setChecking(true);
      setError(null);
      try {
        const sb = supabaseBrowser();
        if (!sb) throw new Error("Auth not configured");
        const { data, error: err } = await sb.auth.signInWithPassword({
          email: email.trim(),
          password: pw,
        });
        if (err) {
          // 11th member hits the DB cap trigger ("member-full").
          setError(/member-full/i.test(err.message) ? "member-full" : err.message);
          return false;
        }
        setUser(data.user?.email ?? email.trim());
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Login failed");
        return false;
      } finally {
        setChecking(false);
      }
    },
    [],
  );

  const signup = useCallback(
    async (email: string, pw: string): Promise<boolean> => {
      setChecking(true);
      setError(null);
      try {
        const sb = supabaseBrowser();
        if (!sb) throw new Error("Auth not configured");
        const { data, error: err } = await sb.auth.signUp({
          email: email.trim(),
          password: pw,
        });
        if (err) {
          setError(/member-full/i.test(err.message) ? "member-full" : err.message);
          return false;
        }
        // With email confirmation off, session exists immediately.
        setUser(data.user?.email ?? (data.session ? email.trim() : null));
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Signup failed");
        return false;
      } finally {
        setChecking(false);
      }
    },
    [],
  );

  const clearError = useCallback((): void => {
    setError(null);
  }, []);

  const loginWithGoogle = useCallback(async (): Promise<boolean> => {
    setChecking(true);
    setError(null);
    try {
      const sb = supabaseBrowser();
      if (!sb) throw new Error("Auth not configured");
      const { error: err } = await sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (err) throw err;
      return true; // browser redirects to Google
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google login failed");
      setChecking(false);
      return false;
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await supabaseBrowser()?.auth.signOut();
    } catch {
      // still treat as logged out locally
    }
    setUser(null);
  }, []);

  return {
    user,
    loggedIn: user !== null,
    loading,
    checking,
    error,
    login,
    signup,
    loginWithGoogle,
    logout,
    refresh,
    clearError,
  };
}

export type AuthApi = ReturnType<typeof useAuth>;
