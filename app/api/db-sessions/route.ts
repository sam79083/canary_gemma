import { NextResponse } from "next/server";
import { getMember, supabaseServer } from "@/supabase/server";
import { sanitizeDbMessages } from "@/lib/db-sessions";
import { normalizeTitle } from "@/lib/sessions-local";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/db-sessions — list the member's sessions (newest first).
// 401 for visitors. RLS scopes everything to the caller's own rows.
export async function GET() {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: "member-only" }, { status: 401 });
  const sb = await supabaseServer();
  if (!sb) return NextResponse.json({ error: "auth-unconfigured" }, { status: 503 });
  const { data, error } = await sb
    .from("sessions")
    .select("id,title,updated_at")
    .eq("user_id", member.id)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: "db-error" }, { status: 500 });
  return NextResponse.json({ sessions: data ?? [] });
}

// POST /api/db-sessions {id?, title, messages} — upsert one conversation.
// Replaces all messages (callers keep one row per conversation).
export async function POST(req: Request) {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: "member-only" }, { status: 401 });
  const sb = await supabaseServer();
  if (!sb) return NextResponse.json({ error: "auth-unconfigured" }, { status: 503 });
  let body: { id?: unknown; title?: unknown; messages?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad-body" }, { status: 400 });
  }
  const id = typeof body.id === "string" && UUID_RE.test(body.id) ? body.id : null;
  const title = normalizeTitle(body.title, Date.now());
  const messages = sanitizeDbMessages(body.messages);
  if (messages.length === 0)
    return NextResponse.json({ error: "empty" }, { status: 400 });

  if (id) {
    const { data: own } = await sb
      .from("sessions")
      .select("id")
      .eq("id", id)
      .eq("user_id", member.id)
      .maybeSingle();
    if (!own) return NextResponse.json({ error: "not-found" }, { status: 404 });
    const { error: upErr } = await sb
      .from("sessions")
      .update({ title, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (upErr) return NextResponse.json({ error: "db-error" }, { status: 500 });
    const { error: delErr } = await sb.from("messages").delete().eq("session_id", id);
    if (delErr) return NextResponse.json({ error: "db-error" }, { status: 500 });
    const { error: insErr } = await sb
      .from("messages")
      .insert(messages.map((m) => ({ session_id: id, role: m.role, content: m.content })));
    if (insErr) return NextResponse.json({ error: "db-error" }, { status: 500 });
    return NextResponse.json({ id });
  }

  const { data: created, error: cErr } = await sb
    .from("sessions")
    .insert({ user_id: member.id, title })
    .select("id")
    .single();
  if (cErr || !created)
    return NextResponse.json({ error: "db-error" }, { status: 500 });
  const newId = (created as { id: string }).id;
  const { error: insErr } = await sb
    .from("messages")
    .insert(messages.map((m) => ({ session_id: newId, role: m.role, content: m.content })));
  if (insErr) {
    await sb.from("sessions").delete().eq("id", newId);
    return NextResponse.json({ error: "db-error" }, { status: 500 });
  }
  return NextResponse.json({ id: newId });
}

// DELETE /api/db-sessions — delete ALL of the member's sessions.
export async function DELETE() {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: "member-only" }, { status: 401 });
  const sb = await supabaseServer();
  if (!sb) return NextResponse.json({ error: "auth-unconfigured" }, { status: 503 });
  const { error } = await sb.from("sessions").delete().eq("user_id", member.id);
  if (error) return NextResponse.json({ error: "db-error" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
