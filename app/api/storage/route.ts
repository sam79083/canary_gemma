import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { ROOT } from "@/lib/files";

// GET /api/storage — live server-disk usage for the app's own data dirs
// (sessions/, uploads/) plus filesystem free/total where available.
// Read-only, capped tree walk. Note: with a connected folder, chats and
// files live on the USER's disk — these numbers then cover only visitors
// without a folder (server fallback) plus generated-image temp files.
const MAX_FILES = 2000;

async function dirSize(rel: string): Promise<{ files: number; bytes: number }> {
  const root = path.join(ROOT, rel);
  let files = 0;
  let bytes = 0;
  const stack: string[] = [root];
  while (stack.length > 0 && files < MAX_FILES) {
    const cur = stack.pop() as string;
    let entries;
    try {
      entries = await fs.readdir(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      try {
        if (e.isDirectory()) {
          stack.push(full);
        } else if (e.isFile()) {
          const st = await fs.stat(full);
          files++;
          bytes += st.size;
          if (files >= MAX_FILES) break;
        }
      } catch {
        // vanished mid-walk — ignore
      }
    }
  }
  return { files, bytes };
}

export async function GET() {
  const [sessions, uploads] = await Promise.all([
    dirSize("sessions"),
    dirSize("uploads"),
  ]);
  let fsys: { free: number; total: number } | null = null;
  try {
    const s = await fs.statfs(ROOT);
    const bsize = s.bsize ?? 4096;
    fsys = {
      free: (s.bfree ?? 0) * bsize,
      total: (s.blocks ?? 0) * bsize,
    };
    if (!fsys.total) fsys = null;
  } catch {
    fsys = null;
  }
  return NextResponse.json({ sessions, uploads, fs: fsys });
}
