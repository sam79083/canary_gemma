import { NextResponse } from "next/server";
import { getMember, supabaseServer } from "@/supabase/server";

// Free-tier guard: one small JSONB blob per member (level, XP, SRS cards).
const MAX_BYTES = 100000;

// GET /api/learn-state — the member's saved learning progress (401 visitors).
export async function GET() {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: "member-only" }, { status: 401 });
  const sb = await supabaseServer();
  if (!sb) return NextResponse.json({ error: "auth-unconfigured" }, { status: 503 });
  const { data, error } = await sb
    .from("learn_state")
    .select("state, updated_at")
    .eq("user_id", member.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "db-error" }, { status: 500 });
  if (!data) return NextResponse.json({ state: null, updated_at: null });
  const row = data as { state?: unknown; updated_at?: unknown };
  return NextResponse.json({
    state: row.state && typeof row.state === "object" ? row.state : null,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
  });
}

// PUT /api/learn-state {state} — upsert one row per member.
export async function PUT(req: Request) {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: "member-only" }, { status: 401 });
  const sb = await supabaseServer();
  if (!sb) return NextResponse.json({ error: "auth-unconfigured" }, { status: 503 });
  let body: { state?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad-body" }, { status: 400 });
  }
  if (!body.state || typeof body.state !== "object" || Array.isArray(body.state)) {
    return NextResponse.json({ error: "bad-body" }, { status: 400 });
  }
  let raw: string;
  try {
    raw = JSON.stringify(body.state);
  } catch {
    return NextResponse.json({ error: "bad-body" }, { status: 400 });
  }
  if (raw.length > MAX_BYTES) {
    return NextResponse.json({ error: "too-large" }, { status: 413 });
  }
  const { error } = await sb.from("learn_state").upsert(
    {
      user_id: member.id,
      state: JSON.parse(raw) as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) return NextResponse.json({ error: "db-error" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
