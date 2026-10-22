import path from "path";

// Project root is the workspace. Sensitive paths are never listed, read,
// written, or deleted through the file API.
export const ROOT = process.cwd();

const BLOCKED_SEGMENTS = new Set([
  ".next",
  "node_modules",
  ".git",
  ".turbo",
]);

function isBlocked(rel: string): boolean {
  const parts = rel.split(/[\\/]/).filter(Boolean);
  for (const part of parts) {
    if (isBlockedName(part)) return true;
  }
  return false;
}

/** Names never shown in directory listings (secrets, build output). */
export function isBlockedName(name: string): boolean {
  if (BLOCKED_SEGMENTS.has(name)) return true;
  if (name === ".env" || name.startsWith(".env.")) return true;
  return false;
}

/** Resolve a workspace-relative path safely inside ROOT, or null if invalid. */
export function safePath(rel: string): string | null {
  if (typeof rel !== "string") return null;
  if (isBlocked(rel)) return null;
  const target = path.normalize(path.join(ROOT, rel));
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return null;
  return target;
}

/**
 * Server fallback workspace is uploads/ only. Without a connected member
 * workspace every path the client uses is jailed under uploads/ — this is
 * the server-side enforcement of that documented behavior, so the file
 * API can never read or mutate project source.
 */
export function inServerJail(rel: string): boolean {
  const norm = (rel || "").replace(/\\/g, "/").replace(/^\.\/+/, "")
    .replace(/^\/+|\/+$/g, "");
  return norm === "uploads" || norm.startsWith("uploads/");
}

/** True if target is the project root itself (never deletable). */
export function isRoot(target: string): boolean {
  return path.normalize(target) === ROOT;
}
