import { NextResponse } from "next/server";
import { getMember, supabaseServer } from "@/supabase/server";

const MAX_LEN = 2000;

function clean(v: unknown): string {
  return (typeof v === "string" ? v : "").trim().slice(0, MAX_LEN);
}

// GET /api/preferences — the member's saved preferences (401 visitors).
export async function GET() {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: "member-only" }, { status: 401 });
  const sb = await supabaseServer();
  if (!sb) return NextResponse.json({ error: "auth-unconfigured" }, { status: 503 });
  const { data, error } = await sb
    .from("preferences")
    .select("custom_instructions")
    .eq("user_id", member.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "db-error" }, { status: 500 });
  const row = (data ?? {}) as { custom_instructions?: unknown };
  return NextResponse.json({
    custom_instructions:
      typeof row.custom_instructions === "string" ? row.custom_instructions : "",
  });
}

// PUT /api/preferences {custom_instructions} — upsert one row per member.
export async function PUT(req: Request) {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: "member-only" }, { status: 401 });
  const sb = await supabaseServer();
  if (!sb) return NextResponse.json({ error: "auth-unconfigured" }, { status: 503 });
  let body: { custom_instructions?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad-body" }, { status: 400 });
  }
  const custom_instructions = clean(body.custom_instructions);
  const { error } = await sb.from("preferences").upsert(
    {
      user_id: member.id,
      custom_instructions,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) return NextResponse.json({ error: "db-error" }, { status: 500 });
  return NextResponse.json({ ok: true, custom_instructions });
}
