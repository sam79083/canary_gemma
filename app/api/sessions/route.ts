import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { ensureSessionsDir, SESSIONS_DIR } from "@/lib/files";

// GET /api/sessions — list saved chat sessions, newest first
export async function GET() {
  await ensureSessionsDir();
  const files = (await fs.readdir(SESSIONS_DIR)).filter((f) =>
    f.endsWith(".json"),
  );
  const sessions = await Promise.all(
    files.map(async (f) => {
      try {
        const raw = await fs.readFile(path.join(SESSIONS_DIR, f), "utf-8");
        const data = JSON.parse(raw);
        const stat = await fs.stat(path.join(SESSIONS_DIR, f));
        return {
          filename: f,
          title: data.title || "Untitled",
          timestamp: data.timestamp || stat.mtimeMs,
        };
      } catch {
        return { filename: f, title: f, timestamp: 0 };
      }
    }),
  );
  sessions.sort((a, b) => b.timestamp - a.timestamp);
  return NextResponse.json({ sessions });
}
