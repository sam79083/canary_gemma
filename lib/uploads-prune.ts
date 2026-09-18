import fs from "fs/promises";
import path from "path";
import { safePath } from "@/lib/files";

// Server-side uploads/ janitor: temp pictures rot away so the disk never
// fills. Runs lazily on every write — no cron needed. Only touches the
// server's uploads/ dir; real workspace folders (user's PC) are never pruned.
const UPLOADS_TTL_MS = 24 * 60 * 60 * 1000;
const UPLOADS_KEEP_NEWEST = 200;

/** Delete expired/excess temp uploads. Never throws — best effort. */
export async function pruneUploads(): Promise<void> {
  try {
    const dir = safePath("uploads");
    if (dir === null) return;
    // Walk recursively: AI temp files may live in subfolders
    // (e.g. uploads/notes/a.md) — those never rotted away before.
    const files: { full: string; mtime: number }[] = [];
    const stack: string[] = [dir];
    while (stack.length > 0) {
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
            if (st.isFile()) files.push({ full, mtime: st.mtimeMs });
          }
        } catch {
          // vanished mid-sweep — ignore
        }
      }
    }
    files.sort((a, b) => b.mtime - a.mtime);
    const now = Date.now();
    const kill = files.filter(
      (f, i) => i >= UPLOADS_KEEP_NEWEST || now - f.mtime > UPLOADS_TTL_MS,
    );
    await Promise.all(kill.map((f) => fs.unlink(f.full).catch(() => {})));
    // Sweep up dirs left empty (deepest first).
    const dirs: string[] = [];
    const dst: string[] = [dir];
    while (dst.length > 0) {
      const cur = dst.pop() as string;
      try {
        const entries = await fs.readdir(cur, { withFileTypes: true });
        for (const e of entries) {
          if (e.isDirectory()) {
            const full = path.join(cur, e.name);
            dirs.push(full);
            dst.push(full);
          }
        }
      } catch {
        // ignore
      }
    }
    for (const d of dirs.reverse()) {
      try {
        await fs.rmdir(d);
      } catch {
        // not empty or gone — keep it
      }
    }
  } catch {
    // uploads/ missing or unreadable — nothing to do
  }
}
