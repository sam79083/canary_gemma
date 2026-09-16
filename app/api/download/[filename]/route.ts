import { NextResponse } from "next/server";
import fs from "fs/promises";
import { safePath } from "@/lib/files";

// GET /api/download/<base64url(filename)> — stream a server temp file
// (uploads/<basename>) as a browser download attachment.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  let raw: string;
  try {
    const b64 = filename.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const bin = atob(padded);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    raw = new TextDecoder().decode(bytes);
  } catch {
    return NextResponse.json(
      { error: "Invalid filename encoding" },
      { status: 400 },
    );
  }
  const name = (raw.split("/").pop() ?? "").trim();
  if (!name || name === "." || name === ".." || name.includes("..")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }
  const target = safePath(`uploads/${name}`);
  if (target === null) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }
  try {
    const stat = await fs.stat(target);
    if (!stat.isFile()) {
      return NextResponse.json({ error: "Not a file" }, { status: 404 });
    }
    const buf = await fs.readFile(target);
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    const contentType =
      ext === "md" || ext === "markdown"
        ? "text/markdown; charset=utf-8"
        : ext === "json"
          ? "application/json; charset=utf-8"
          : ext === "html" || ext === "htm"
            ? "text/html; charset=utf-8"
            : ext === "css"
              ? "text/css; charset=utf-8"
              : ext === "csv"
                ? "text/csv; charset=utf-8"
                : ext === "txt" || ext === "log"
                  ? "text/plain; charset=utf-8"
                  : "application/octet-stream";
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Content-Length": String(buf.length),
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
