import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { safePath, isBlockedName } from "@/lib/files";

// Workspace disconnected: list files in the server upload/ folder
// so the browser can offer downloads.  (When workspace IS connected,
// the FileTree shows those files; this endpoint is only for visitors
// without a folder.)
export async function GET() {
  const target = safePath("uploads");
  if (target === null) {
    return NextResponse.json({ entries: [] });
  }
  let names: string[];
  try {
    names = (await fs.readdir(target)).filter((n) => !isBlockedName(n));
  } catch {
    return NextResponse.json({ entries: [] });
  }
  // Sort: directories first, then alphabetical.
  const entries = await Promise.all(
    names.map(async (name) => {
      try {
        const st = await fs.stat(`${target}/${name}`);
        if (st.isDirectory()) return { name, kind: "dir" };
        return { name, kind: "file", mtimeMs: st.mtimeMs, size: st.size };
      } catch {
        return { name, kind: "file" };
      }
    })
  );
  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  // Same TTL the janitor (app/api/file/route.ts) enforces.
  return NextResponse.json({ entries, ttlMs: 24 * 60 * 60 * 1000 });
}
