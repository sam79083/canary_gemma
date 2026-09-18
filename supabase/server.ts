import { createServerClient } from "@supabase/ssr";

// NOTE: next/headers is intentionally NOT a top-level import. It only
// resolves inside the Next.js runtime — a static import breaks plain
// `node --test` (ERR_MODULE_NOT_FOUND) before any test runs. Each use
// below dynamic-imports it; outside Next that rejects, and the existing
// try/catch paths return false/null (the unconfigured behavior the
// auth tests assert).

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

function creds(): { url: string; anon: string } | null {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const anon = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !anon) return null;
  return { url, anon };
}

/**
 * True when the request carries a Supabase session cookie (chunked
 * `sb-<ref>-auth-token[.N]` included). Pure string check — no network.
 * Visitors without one skip Supabase entirely: trial traffic must cost
 * nothing and touch nothing outside this server.
 */
export async function hasSessionCookie(): Promise<boolean> {
  try {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    return store
      .getAll()
      .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
  } catch {
    return false;
  }
}

/** Route-handler Supabase client (reads session cookies, refreshes them). */
export async function supabaseServer() {
  const c = creds();
  if (!c) return null;
  const { cookies } = await import("next/headers");
  const store = await cookies();
  return createServerClient(c.url, c.anon, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(toSet) {
        try {
          toSet.forEach(({ name, value, options }) =>
            store.set(name, value, options),
          );
        } catch {
          // Route handlers can set cookies; middleware refresh covers the rest.
        }
      },
    },
  });
}

/** Rejects if the Supabase call stalls — callers fail fast instead of hanging. */
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("auth-timeout")), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Logged-in member from the request cookies, or null (visitor). */
export async function getMember(): Promise<{ id: string; email: string } | null> {
  try {
    // No session cookie => definitely a visitor. Return before any
    // Supabase network call so trial traffic stays fully local.
    if (!(await hasSessionCookie())) return null;
    const sb = await supabaseServer();
    if (!sb) return null;
    const {
      data: { user },
    } = await withTimeout(sb.auth.getUser(), 10000);
    if (!user) return null;
    return { id: user.id, email: user.email ?? "" };
  } catch {
    return null;
  }
}
