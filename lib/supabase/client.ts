import { createBrowserClient } from "@supabase/ssr";

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

/** Browser-side Supabase client (anon key, RLS enforced). Null when unconfigured. */
export function supabaseBrowser() {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const anon = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !anon) return null;
  return createBrowserClient(url, anon);
}
