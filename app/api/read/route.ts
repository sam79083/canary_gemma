import { NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { isPrivateHost, cleanReadUrl, extractArticle } from "@/lib/learn-reader";
import { clientIp } from "@/lib/trial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 900_000;
const TIMEOUT_MS = 9000;
const MAX_REDIRECTS = 3;
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 60 * 1000;

const hits = new Map<string, number[]>();

function allow(ip: string, now = Date.now()): boolean {
  const cutoff = now - RATE_WINDOW_MS;
  const recent = (hits.get(ip) ?? []).filter((t) => t >= cutoff);
  if (recent.length >= RATE_LIMIT) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 2000) {
    for (const [key, times] of hits) {
      if (times.every((t) => t < cutoff)) hits.delete(key);
    }
  }
  return true;
}

/** Reject hostnames whose DNS answers land on a private network. */
async function assertPublicHost(hostname: string): Promise<boolean> {
  if (isPrivateHost(hostname)) return false;
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(bare) || bare.includes(":")) return true;
  try {
    const answers = await lookup(bare, { all: true, verbatim: true });
    if (answers.length === 0) return false;
    return answers.every((a) => !isPrivateHost(a.address));
  } catch {
    return false;
  }
}

function decodeBody(buf: Uint8Array, contentType: string): string {
  const label = contentType.match(/charset=["']?([^;"'\s]+)/i)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(label).decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

type FetchResult =
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; error: string; status: number };

async function fetchPage(start: URL): Promise<FetchResult> {
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await assertPublicHost(current.hostname))) {
      return { ok: false, error: "bad-url", status: 400 };
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(current, {
        redirect: "manual",
        signal: ctrl.signal,
        headers: {
          "user-agent": "CanaryReader/1.0 (+https://canary.app; learning reader)",
          accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
          "accept-language": "en,ko;q=0.8",
        },
      });

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return { ok: false, error: "fetch-failed", status: 502 };
        const next = cleanReadUrl(new URL(loc, current).toString());
        if (!next) return { ok: false, error: "bad-url", status: 400 };
        current = next;
        continue;
      }
      if (!res.ok) return { ok: false, error: "fetch-failed", status: 502 };

      const type = (res.headers.get("content-type") ?? "").toLowerCase();
      const allowed =
        type.includes("text/html") ||
        type.includes("application/xhtml") ||
        type.includes("text/plain");
      if (!allowed) return { ok: false, error: "not-html", status: 415 };

      const body = res.body;
      if (!body) return { ok: false, error: "fetch-failed", status: 502 };
      const reader = body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        if (received > MAX_BYTES) {
          await reader.cancel().catch(() => {});
          return { ok: false, error: "too-big", status: 413 };
        }
        chunks.push(value);
      }
      const merged = new Uint8Array(received);
      let offset = 0;
      for (const c of chunks) {
        merged.set(c, offset);
        offset += c.length;
      }
      const raw = decodeBody(merged, type);
      const html = type.includes("text/plain")
        ? `<html><head><title>${current.hostname}</title></head><body><p>${raw
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\r?\n\s*\r?\n/g, "</p><p>")
            .replace(/\r?\n/g, " ")}</p></body></html>`
        : raw;
      return { ok: true, html, finalUrl: current.toString() };
    } catch {
      return { ok: false, error: "fetch-failed", status: 502 };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, error: "too-many-redirects", status: 400 };
}

export async function POST(req: Request) {
  if (!allow(clientIp(req))) {
    return NextResponse.json({ error: "rate-limited" }, { status: 429 });
  }
  let body: { url?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad-url" }, { status: 400 });
  }
  const url = cleanReadUrl(body.url);
  if (!url) return NextResponse.json({ error: "bad-url" }, { status: 400 });

  const page = await fetchPage(url);
  if (!page.ok) return NextResponse.json({ error: page.error }, { status: page.status });

  const article = extractArticle(page.html, page.finalUrl);
  if (article.paragraphs.length === 0 || article.wordCount < 20) {
    return NextResponse.json({ error: "no-article" }, { status: 422 });
  }
  return NextResponse.json({ article });
}
