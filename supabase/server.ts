import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

function creds(): { url: string; anon: string } | null {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const anon = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !anon) return null;
  return { url, anon };
}

/** Route-handler Supabase client (reads session cookies, refreshes them). */
export async function supabaseServer() {
  const c = creds();
  if (!c) return null;
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
