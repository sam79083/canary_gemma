import { NextResponse } from "next/server";

// GET /api/search?q=... — SerpAPI Google proxy (key stays server-side)
// In-memory per-IP limiter (10/min). Keyed on the LAST x-forwarded-for hop —
// the one the trusted reverse proxy appended. First hop is client-set and
// therefore spoofable. Entries are pruned so the map cannot grow forever.
const RATE_MAX = 10;
const RATE_WIN_MS = 60_000;
const _rl = new Map<string, { n: number; t: number }>();

function rateKey(ip: string, now: number): "ok" | "limited" {
  const rec = _rl.get(ip);
  if (rec && now - rec.t < RATE_WIN_MS) {
    rec.n++;
    if (rec.n > RATE_MAX) return "limited";
    return "ok";
  }
  for (const [k, v] of _rl) if (now - v.t >= RATE_WIN_MS) _rl.delete(k);
  _rl.set(ip, { n: 1, t: now });
  return "ok";
}

export async function GET(req: Request) {
  const hops = (req.headers.get("x-forwarded-for") ?? "").split(",").map((h) => h.trim());
  const ip = hops[hops.length - 1] || "local";
  if (rateKey(ip, Date.now()) === "limited")
    return NextResponse.json({ error: "Rate limited", results: [] }, { status: 429 });
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("q") ?? "").trim();
  if (!query)
    return NextResponse.json(
      { error: "Empty query", results: [] },
      { status: 400 },
    );
  const key = (process.env.SERPAPI_KEY ?? "").trim();
  if (!key)
    return NextResponse.json(
      { error: "SERPAPI_KEY not configured", results: [] },
      { status: 500 },
    );
  try {
    const params = new URLSearchParams({
      q: query,
      api_key: key,
      engine: "google",
      num: "5",
      hl: "en",
    });
    console.log(`[search] query: ${query}`);
    const resp = await fetch(`https://serpapi.com/search.json?${params}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15000),
    });
    const data = await resp.json();
    if (data.error) {
      console.log(`[search] SerpAPI error: ${data.error}`);
      return NextResponse.json(
        { error: data.error, results: [] },
        { status: 502 },
      );
    }
    const results: {
      source: string;
      title: string;
      snippet: string;
      url: string;
    }[] = [];
    for (const k of ["answer_box", "knowledge_graph"] as const) {
      const box = data[k];
      if (
        typeof box === "object" &&
        box !== null &&
        ("answer" in box || "description" in box)
      ) {
        results.push({
          source: `Google ${k}`,
          title: box.title || box.name || "Answer",
          snippet: box.answer || box.description || "",
          url: box.link || "",
        });
      }
    }
    for (const item of (data.organic_results ?? []).slice(0, 5)) {
      results.push({
        source: "Google",
        title: item.title || "Search Result",
        snippet: item.snippet || "",
        url: item.link || "",
      });
    }
    console.log(`[search] returning ${results.length} results`);
    return NextResponse.json({ query, results });
  } catch (e) {
    console.log(`[search] failed: ${e}`);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Search failed", results: [] },
      { status: 502 },
    );
  }
}
