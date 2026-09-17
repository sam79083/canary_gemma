import { NextResponse } from "next/server";
import { DEFAULT_GEMINI_MODEL } from "@/lib/cloud-model";
import { getMember } from "@/supabase/server";
import { trialUse } from "@/lib/trial";

// The trial session has no other identity channel (unlike keyed sessions),
// so the designation fact goes here — nothing else for the model to echo.
const TRIAL_SYSTEM = `You are '${DEFAULT_GEMINI_MODEL}'.`;

// POST /api/gemini-chat {contents} — trial chat with the SERVER's Gemini key.
// Non-streaming (trial simplicity): returns {text, remaining, usage}.
// The key never leaves the server. 501 = no server key;
// 429 {error:"trial-over"} = budget spent.
// Logged-in members bypass the budget (cookie-authenticated).
export async function POST(req: Request) {
  const key = process.env.GEMINI_KEY;
  if (!key) return NextResponse.json({ error: "no-server-key" }, { status: 501 });
  let contents: unknown;
  try {
    const body = (await req.json()) as { contents?: unknown };
    contents = body.contents;
  } catch {
    return NextResponse.json({ error: "Empty body" }, { status: 400 });
  }
  if (!Array.isArray(contents) || contents.length === 0)
    return NextResponse.json({ error: "Empty contents" }, { status: 400 });
  const remaining = await trialUse(req, "gemini", (await getMember()) !== null);
  if (remaining < 0)
    return NextResponse.json({ error: "trial-over" }, { status: 429 });
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: TRIAL_SYSTEM }] },
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
        }),
        signal: AbortSignal.timeout(60000),
      },
    );
    if (!res.ok) {
      let detail = "";
      try {
        detail = ` ${(await res.text()).slice(0, 200)}`;
      } catch {
        // ignore
      }
      // Normalize to codes the client's friendlyError already maps to
      // localized messages (bad-key/quota). Full detail goes to the
      // server logs for diagnosis.
      console.error(`gemini-chat upstream HTTP ${res.status}${detail}`);
      const code =
        res.status === 400 ||
        res.status === 401 ||
        res.status === 403
          ? "server-bad-key"
          : res.status === 429
            ? "quota"
            : res.status === 404
              ? "bad-model"
              : `HTTP ${res.status}${detail}`;
      return NextResponse.json({ error: code }, { status: 502 });
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
    };
    const text = (data.candidates ?? [])
      .flatMap((c) => c.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("");
    // Pass usage through (may be absent for some models) so the client
    // usage meter works on the trial/member path too — never the key.
    const meta = data.usageMetadata;
    const usage =
      meta &&
      (typeof meta.promptTokenCount === "number" ||
        typeof meta.candidatesTokenCount === "number" ||
        typeof meta.totalTokenCount === "number")
        ? {
            in: meta.promptTokenCount ?? 0,
            out: meta.candidatesTokenCount ?? 0,
            total:
              meta.totalTokenCount ??
              (meta.promptTokenCount ?? 0) + (meta.candidatesTokenCount ?? 0),
          }
        : null;
    return NextResponse.json({ text, remaining, usage });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Chat failed" },
      { status: 502 },
    );
  }
}
