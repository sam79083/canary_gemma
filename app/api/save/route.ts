import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { ensureSessionsDir, SESSIONS_DIR } from "@/lib/files";
import type { ChatMessage } from "@/lib/types";

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

// POST /api/save — persist a chat session (accepts object or legacy array)
export async function POST(req: Request) {
  let data: unknown;
  try {
    data = await req.json();
  } catch {
    return NextResponse.json({ error: "Empty body" }, { status: 400 });
  }
  await ensureSessionsDir();
  const filename = `session_${stamp()}.json`;

  let payload: { title: string; messages: ChatMessage[]; timestamp: number };
  if (Array.isArray(data)) {
    const msgs = data as ChatMessage[];
    payload = {
      title: msgs[0]?.content?.slice(0, 50) || "New conversation",
      messages: msgs,
      timestamp: Date.now(),
    };
  } else {
    const obj = data as {
      title?: string;
      messages?: ChatMessage[];
      timestamp?: number;
    };
    payload = {
      title: obj.title || "New conversation",
      messages: obj.messages || [],
      timestamp: obj.timestamp || Date.now(),
    };
  }

  await fs.writeFile(
    path.join(SESSIONS_DIR, filename),
    JSON.stringify(payload, null, 2),
    "utf-8",
  );
  return NextResponse.json({ success: true, filename });
}
