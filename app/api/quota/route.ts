import { NextResponse } from "next/server";

// GET /api/quota — SerpAPI searches-left (key never sent to the browser)
export async function GET() {
  const key = process.env.SERPAPI_KEY;
  if (!key) return NextResponse.json({ error: "SERPAPI_KEY not configured" }, { status: 500 });
  try {
    const resp = await fetch(
      `https://serpapi.com/account.json?api_key=${key}`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(15000),
      },
    );
    const data = await resp.json();
    const {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      api_key: _omit,
      ...safe
    } = data;
    return NextResponse.json({
      plan_name: safe.plan_name,
      searches_per_month: safe.searches_per_month,
      plan_searches_left: safe.plan_searches_left,
      total_searches_left: safe.total_searches_left,
      this_month_usage: safe.this_month_usage,
      plan_renewal_date: safe.plan_renewal_date,
      account_email: safe.account_email,
      account_status: safe.account_status,
    });
  } catch (e) {
    console.log(`[quota] failed: ${e}`);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Quota check failed" },
      { status: 502 },
    );
  }
}
