import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { isRoot, safePath } from "@/lib/files";

// Server-side uploads/ janitor: temp pictures rot away so the disk never
// fills. Runs lazily on every write — no cron needed. Only touches the
// server's uploads/ dir; real workspace folders (user's PC) are never pruned.
const UPLOADS_TTL_MS = 24 * 60 * 60 * 1000;
const UPLOADS_KEEP_NEWEST = 200;

async function pruneUploads(): Promise<void> {
  try {
    const dir = safePath("uploads");
    if (dir === null) return;
    const names = await fs.readdir(dir);
    const files: { name: string; mtime: number }[] = [];
    for (const name of names) {
      try {
        const st = await fs.stat(path.join(dir, name));
        if (st.isFile()) files.push({ name, mtime: st.mtimeMs });
      } catch {
        // vanished mid-sweep — ignore
      }
    }
    files.sort((a, b) => b.mtime - a.mtime);
    const now = Date.now();
    const kill = files.filter(
      (f, i) => i >= UPLOADS_KEEP_NEWEST || now - f.mtime > UPLOADS_TTL_MS,
    );
    await Promise.all(
      kill.map((f) => fs.unlink(path.join(dir, f.name)).catch(() => {})),
    );
  } catch {
    // uploads/ missing or unreadable — nothing to do
  }
}

// GET /api/file?path=<rel> — read file content (?raw=1 returns bytes)
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
    if (searchParams.get("raw") === "1") {
      const buf = await fs.readFile(target);
      const ext = rel.split(".").pop()?.toLowerCase();
      const type =
        ext === "png"
          ? "image/png"
          : ext === "jpg" || ext === "jpeg"
            ? "image/jpeg"
            : ext === "webp"
              ? "image/webp"
              : ext === "gif"
                ? "image/gif"
                : "application/octet-stream";
      return new Response(new Uint8Array(buf), {
        headers: { "Content-Type": type },
      });
    }
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

// POST /api/file {path, content} — create or overwrite file.
// {path, contentBase64} writes binary (e.g. generated PNGs).
export async function POST(req: Request) {
  let body: { path?: string; content?: string; contentBase64?: string };
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
    if (typeof body.contentBase64 === "string" && body.contentBase64) {
      await fs.writeFile(target, Buffer.from(body.contentBase64, "base64"));
    } else {
      await fs.writeFile(target, body.content ?? "", "utf-8");
    }
    // Fire-and-forget: don't delay the response for janitor work.
    void pruneUploads();
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
