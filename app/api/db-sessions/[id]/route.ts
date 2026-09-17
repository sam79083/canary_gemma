import { NextResponse } from "next/server";
import { getMember, supabaseServer } from "@/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/db-sessions/[id] — load one of the member's sessions.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "not-found" }, { status: 404 });
  const member = await getMember();
  if (!member) return NextResponse.json({ error: "member-only" }, { status: 401 });
  const sb = await supabaseServer();
  if (!sb) return NextResponse.json({ error: "auth-unconfigured" }, { status: 503 });
  const { data: session } = await sb
    .from("sessions")
    .select("id,title")
    .eq("id", id)
    .eq("user_id", member.id)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: "not-found" }, { status: 404 });
  const { data: messages, error } = await sb
    .from("messages")
    .select("role,content")
    .eq("session_id", id)
    .order("id", { ascending: true })
    .limit(500);
  if (error) return NextResponse.json({ error: "db-error" }, { status: 500 });
  return NextResponse.json({
    title: (session as { title: string }).title,
    messages: (messages ?? []).filter(
      (m): m is { role: "user" | "assistant"; content: string } =>
        (m as { role: unknown }).role === "user" ||
        (m as { role: unknown }).role === "assistant",
    ),
  });
}

// DELETE /api/db-sessions/[id] — delete one session (messages cascade).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "not-found" }, { status: 404 });
  const member = await getMember();
  if (!member) return NextResponse.json({ error: "member-only" }, { status: 401 });
  const sb = await supabaseServer();
  if (!sb) return NextResponse.json({ error: "auth-unconfigured" }, { status: 503 });
  const { data, error } = await sb
    .from("sessions")
    .delete()
    .eq("id", id)
    .eq("user_id", member.id)
    .select("id");
  if (error) return NextResponse.json({ error: "db-error" }, { status: 500 });
  // Zero rows = id unknown or not owned: say so instead of a false ok,
  // otherwise the row lingers in the UI with a "deleted ✓" toast.
  if (!data || data.length === 0)
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
