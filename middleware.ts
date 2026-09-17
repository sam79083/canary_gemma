import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Refresh the Supabase session cookie on every request (anon key only). */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  if (!url || !anon) return response;
  // No session cookie => visitor: skip Supabase entirely (no network).
  // Trial traffic must cost nothing.
  const hasSession = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
  if (!hasSession) return response;
  const sb = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(toSet) {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  // Session refresh is best-effort with a hard timeout: a stalled Auth
  // call must never hang the request into a proxy 502. Fail open — API
  // routes verify membership themselves on every call.
  try {
    await Promise.race([
      sb.auth.getUser(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("auth-timeout")), 8000),
      ),
    ]);
  } catch {
    // keep serving the request with the cookies as they arrived
  }
  return response;
}

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-|manifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
