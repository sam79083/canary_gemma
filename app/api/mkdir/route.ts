import { NextResponse } from "next/server";
import fs from "fs/promises";
import { safePath } from "@/lib/files";

// POST /api/mkdir {path} — create directory
export async function POST(req: Request) {
  let body: { path?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Empty body" }, { status: 400 });
  }
  const target = safePath(body.path ?? "");
  if (target === null)
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  try {
    await fs.mkdir(target, { recursive: true });
    return NextResponse.json({ success: true, path: body.path ?? "" });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Mkdir failed" },
      { status: 500 },
    );
  }
}
