import { NextResponse } from "next/server";
import { trialPeek } from "@/lib/trial";

// GET /api/trial-status — remaining free trial uses for this visitor.
// Read-only: never consumes budget. Localhost reports huge numbers.
export async function GET(req: Request) {
  const left = await trialPeek(req);
  return NextResponse.json(left);
}
