import { NextResponse } from "next/server";

// GET /api/debug-env — reports whether Supabase env vars are present
// in THIS build. Returns booleans only, never secret values.
// NEXT_PUBLIC_* vars are baked in at build time, so if these are false
// on Render, the build predates the env vars -> redeploy.
export async function GET() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  return NextResponse.json({
    hasUrl: url.length > 0,
    hasAnonKey: anon.length > 0,
    urlLooksValid: /^https:\/\/.+\.supabase\.co$/.test(url),
    nodeEnv: process.env.NODE_ENV ?? "unknown",
  });
}
