import { NextResponse } from "next/server";
import fs from "fs/promises";
import { safePath, isBlockedName } from "@/lib/files";

// GET /api/files?path=<rel> — list directory entries
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rel = searchParams.get("path") ?? "";
  const target = safePath(rel);
  if (target === null)
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  try {
    let stat;
    try {
      stat = await fs.stat(target);
    } catch (e) {
      // Fresh deploys have no uploads//downloads dir yet (gitignored) —
      // an empty tree is the truthful answer, not a 500.
      if ((e as NodeJS.ErrnoException)?.code === "ENOENT")
        return NextResponse.json({ path: rel, entries: [] });
      throw e;
    }
    if (!stat.isDirectory())
      return NextResponse.json({ error: "Not a directory" }, { status: 400 });
    const names = (await fs.readdir(target)).filter((n) => !isBlockedName(n));
    names.sort((a, b) => a.localeCompare(b));
    const entries = await Promise.all(
      names.map(async (name) => {
        try {
          const st = await fs.stat(`${target}/${name}`);
          return { name, kind: st.isDirectory() ? "directory" : "file" };
        } catch {
          return { name, kind: "file" as const };
        }
      }),
    );
    return NextResponse.json({ path: rel, entries });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Read failed" },
      { status: 500 },
    );
  }
}
