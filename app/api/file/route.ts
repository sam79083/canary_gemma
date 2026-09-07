import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { isRoot, safePath } from "@/lib/files";

// GET /api/file?path=<rel> — read file content
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rel = searchParams.get("path") ?? "";
  const target = safePath(rel);
  if (target === null)
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  try {
    const stat = await fs.stat(target);
    if (!stat.isFile())
      return NextResponse.json({ error: "Not a file" }, { status: 400 });
    try {
      const content = await fs.readFile(target, "utf-8");
      return NextResponse.json({ path: rel, content });
    } catch {
      return NextResponse.json(
        { error: "Binary file not supported" },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json({ error: "Not a file" }, { status: 400 });
  }
}

// POST /api/file {path, content} — create or overwrite file
export async function POST(req: Request) {
  let body: { path?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Empty body" }, { status: 400 });
  }
  const rel = body.path ?? "";
  const target = safePath(rel);
  if (target === null)
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  try {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body.content ?? "", "utf-8");
    return NextResponse.json({ success: true, path: rel });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Write failed" },
      { status: 500 },
    );
  }
}

// DELETE /api/file?path=<rel> — delete file or directory (never project root)
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const rel = searchParams.get("path") ?? "";
  if (!rel || ["", ".", "/", "\\"].includes(rel.trim()))
    return NextResponse.json(
      { error: "Refusing to delete project root" },
      { status: 400 },
    );
  const target = safePath(rel);
  if (target === null || isRoot(target))
    return NextResponse.json(
      { error: "Refusing to delete project root" },
      { status: 400 },
    );
  try {
    const stat = await fs.stat(target);
    if (stat.isDirectory()) await fs.rm(target, { recursive: true });
    else await fs.unlink(target);
    return NextResponse.json({ success: true, path: rel });
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT")
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Delete failed" },
      { status: 500 },
    );
  }
}
