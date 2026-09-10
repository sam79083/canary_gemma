import { NextResponse } from "next/server";

// GET /api/draw?prompt=... — free keyless image proxy.
// Browsers get 403 fetching Pollinations directly (hotlink protection),
// but server-to-server works. The prompt is re-encoded here and the host
// is fixed, so this can't be abused as an open proxy.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const prompt = (searchParams.get("prompt") ?? "").trim().slice(0, 1500);
  if (!prompt)
    return NextResponse.json({ error: "Empty prompt" }, { status: 400 });
  const seed =
    Number(searchParams.get("seed")) || Math.floor(Math.random() * 1000000);
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=1024&height=1024&nologo=true&private=true&enhance=true&model=flux&seed=${seed}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(180000),
    });
    if (!res.ok)
      return NextResponse.json(
        { error: `Upstream HTTP ${res.status}` },
        { status: 502 },
      );
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1024)
      return NextResponse.json({ error: "Empty image" }, { status: 502 });
    const type = res.headers.get("content-type") || "image/jpeg";
    return new Response(new Uint8Array(buf), {
      headers: { "Content-Type": type },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Draw failed" },
      { status: 502 },
    );
  }
}
