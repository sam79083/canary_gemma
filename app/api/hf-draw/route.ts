import { NextResponse } from "next/server";
import { HF_IMAGE_MODEL } from "@/lib/cloud-model";
import { trialUse } from "@/lib/trial";

// POST /api/hf-draw {prompt} — HD drawing with the SERVER's HF token.
// The token never leaves the server: the browser sends only the prompt.
// 501 = no server key configured (client falls back to the user's own key).
// 429 {error:"trial-over"} = visitor budget spent (bring your own key).
export async function POST(req: Request) {
  const token = process.env.HF_TOKEN;
  if (!token) return NextResponse.json({ error: "no-server-key" }, { status: 501 });
  let prompt = "";
  try {
    const body = (await req.json()) as { prompt?: string };
    prompt = (body.prompt ?? "").trim().slice(0, 1500);
  } catch {
    return NextResponse.json({ error: "Empty body" }, { status: 400 });
  }
  if (!prompt) return NextResponse.json({ error: "Empty prompt" }, { status: 400 });
  const remaining = await trialUse(req, "hf");
  if (remaining < 0)
    return NextResponse.json({ error: "trial-over" }, { status: 429 });
  try {
    const res = await fetch(
      `https://router.huggingface.co/hf-inference/models/${HF_IMAGE_MODEL}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs: prompt }),
        signal: AbortSignal.timeout(240000),
      },
    );
    if (res.status === 401 || res.status === 403)
      return NextResponse.json({ error: "hf-bad-key" }, { status: 502 });
    if (res.status === 429)
      return NextResponse.json({ error: "hf-limited" }, { status: 502 });
    if (!res.ok) {
      let detail = "";
      try {
        detail = ` ${(await res.text()).slice(0, 200)}`;
      } catch {
        // ignore
      }
      return NextResponse.json(
        { error: `HTTP ${res.status}${detail}` },
        { status: 502 },
      );
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1024)
      return NextResponse.json({ error: "empty-image" }, { status: 502 });
    return new Response(new Uint8Array(buf), {
      headers: { "Content-Type": res.headers.get("content-type") || "image/jpeg" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Draw failed" },
      { status: 502 },
    );
  }
}
