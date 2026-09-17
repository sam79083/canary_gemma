import { createBrowserClient } from "@supabase/ssr";

// NOTE: static member access (`process.env.NEXT_PUBLIC_X`) is required
// here. Dynamic lookup (`process.env[name]`) does NOT resolve NEXT_PUBLIC
// vars in the browser bundle, so the client always looked unconfigured.
function clientEnv(): { url: string; anon: string } {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  return { url, anon };
}

/** True when the Supabase URL + anon key are present in this bundle. */
export function supabaseConfigured(): boolean {
  const { url, anon } = clientEnv();
  return url.length > 0 && anon.length > 0;
}

/** Browser-side Supabase client (anon key, RLS enforced). Null when unconfigured. */
export function supabaseBrowser() {
  if (!supabaseConfigured()) return null;
  const { url, anon } = clientEnv();
  return createBrowserClient(url, anon);
}
