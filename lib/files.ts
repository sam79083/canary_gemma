import path from "path";
import fs from "fs/promises";

// Project root is the workspace. Sensitive paths are never listed, read,
// written, or deleted through the file API.
export const ROOT = process.cwd();
export const SESSIONS_DIR = path.join(ROOT, "sessions");

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

/** True if target is the project root itself (never deletable). */
export function isRoot(target: string): boolean {
  return path.normalize(target) === ROOT;
}

export async function ensureSessionsDir(): Promise<void> {
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
}
