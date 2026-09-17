import { NextResponse } from "next/server";
import { getMember } from "@/supabase/server";
import { trialPeek } from "@/lib/trial";

// GET /api/trial-status — remaining free trial uses for this visitor.
// Read-only: never consumes budget. Members report huge numbers.
export async function GET(req: Request) {
  const left = await trialPeek(req, (await getMember()) !== null);
  return NextResponse.json(left);
}
