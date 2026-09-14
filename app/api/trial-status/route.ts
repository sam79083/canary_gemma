import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { trialPeek } from "@/lib/trial";

// GET /api/trial-status — remaining free trial uses for this visitor.
// Read-only: never consumes budget. Localhost and members report huge numbers.
export async function GET(req: Request) {
  const left = await trialPeek(req, isAuthenticated(req));
  return NextResponse.json(left);
}
