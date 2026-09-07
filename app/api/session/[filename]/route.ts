import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { SESSIONS_DIR } from "@/lib/files";

// GET /api/session/:filename — load one saved session
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  // Strict guard: plain *.json names only, no traversal
  if (!/^[\w\-. ]+\.json$/.test(filename) || filename.includes(".."))
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const raw = await fs.readFile(
      path.join(SESSIONS_DIR, filename),
      "utf-8",
    );
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
