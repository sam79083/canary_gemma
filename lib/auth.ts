// Member login: a single ID/PW pair from the server environment.
// Logged-in visitors use the server keys without limits and never need
// their own API keys.
//
// SERVER-ONLY: importing this file bakes the credential fallback into the
// bundle, so only import it from API routes / server code — never from
// client components (they talk to /api/auth over fetch instead).

import { createHash, timingSafeEqual } from "node:crypto";

export const AUTH_COOKIE = "canary_auth";
const TOKEN_PREFIX = "canary-auth-v1";

/** Credentials from env, falling back to the owner's pair. */
export function getCredentials(): { id: string; pw: string } {
  const id = (process.env.SAM_ID ?? "sam").trim() || "sam";
  const pw = (process.env.SAM_PW ?? "1227").trim() || "1227";
  return { id, pw };
}

/** Stateless session token: only computable with the server-side secret. */
export function signToken(id: string, pw: string): string {
  return createHash("sha256")
    .update(`${TOKEN_PREFIX}:${id}:${pw}`)
    .digest("hex");
}

function expectedToken(): string {
  const { id, pw } = getCredentials();
  return signToken(id, pw);
}

/** Constant-time compare so a wrong cookie reveals nothing by timing. */
export function verifyToken(token: string | null | undefined): boolean {
  if (!token) return false;
  try {
    const a = Buffer.from(token.trim(), "utf8");
    const b = Buffer.from(expectedToken(), "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function checkCredentials(id: string, pw: string): boolean {
  const creds = getCredentials();
  try {
    const a = Buffer.from(`${id.trim()}\0${pw}`, "utf8");
    const b = Buffer.from(`${creds.id}\0${creds.pw}`, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k && !(k in out)) out[k] = decodeURIComponent(v);
  }
  return out;
}

/** True when the request carries a valid member session cookie. */
export function isAuthenticated(req: Request): boolean {
  try {
    const cookies = parseCookies(req.headers.get("cookie"));
    return verifyToken(cookies[AUTH_COOKIE]);
  } catch {
    return false;
  }
}

/** Authenticated member id, or null for visitors. */
export function authUser(req: Request): string | null {
  if (!isAuthenticated(req)) return null;
  return getCredentials().id;
}

export function authCookieHeader(secure: boolean): string {
  const parts = [
    `${AUTH_COOKIE}=${expectedToken()}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=2592000", // 30 days
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearCookieHeader(): string {
  return `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
