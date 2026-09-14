import { NextResponse } from "next/server";
import {
  authCookieHeader,
  authUser,
  checkCredentials,
  clearCookieHeader,
  getCredentials,
} from "@/lib/auth";

function useSecure(): boolean {
  return process.env.NODE_ENV === "production";
}

// GET /api/auth — { loggedIn, user } (read-only, for the login button).
export async function GET(req: Request) {
  const user = authUser(req);
  return NextResponse.json({ loggedIn: user !== null, user });
}

// POST /api/auth {id, pw} — member login, sets an HttpOnly session cookie.
export async function POST(req: Request) {
  let id = "";
  let pw = "";
  try {
    const body = (await req.json()) as { id?: unknown; pw?: unknown };
    id = typeof body.id === "string" ? body.id : "";
    pw = typeof body.pw === "string" ? body.pw : "";
  } catch {
    return NextResponse.json({ ok: false, error: "Empty body" }, { status: 400 });
  }
  if (!id || !pw) {
    return NextResponse.json(
      { ok: false, error: "Missing id or password" },
      { status: 400 },
    );
  }
  if (!checkCredentials(id, pw)) {
    // Slow down guessing; the secret itself is never revealed.
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json(
      { ok: false, error: "Wrong id or password" },
      { status: 401 },
    );
  }
  const res = NextResponse.json({ ok: true, user: getCredentials().id });
  res.headers.set("Set-Cookie", authCookieHeader(useSecure()));
  return res;
}

// DELETE /api/auth — logout, clears the session cookie.
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", clearCookieHeader());
  return res;
}
