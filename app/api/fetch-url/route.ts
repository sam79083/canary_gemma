import { NextResponse } from "next/server";
import dns from "dns/promises";
import net from "net";

// POST /api/fetch-url {url} — fetch a public web page and return
// {title, text} (plain text, capped) so the chat can summarize it.
// SSRF-guarded: http(s) only, no credentials in URL, hostname must
// resolve to public IPs only (checked on every redirect hop), 15s
// timeout, 1MB cap, max 3 redirects.
const TIMEOUT_MS = 15000;
const MAX_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;
const MAX_TEXT = 12000;

function isPublicIp(ip: string): boolean {
  if (net.isIP(ip) === 0) return false;
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 127) return false;
    if (a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a >= 224) return false;
    return true;
  }
  // IPv6: reject loopback, unspecified, link-local, unique-local, multicast.
  const low = ip.toLowerCase();
  if (low === "::1" || low === "::") return false;
  if (low.startsWith("fe80:")) return false;
  if (low.startsWith("fc") || low.startsWith("fd")) return false;
  if (low.startsWith("ff")) return false;
  return true;
}

async function hostIsPublic(host: string): Promise<boolean> {
  try {
    const addrs = await dns.lookup(host, { all: true });
    if (addrs.length === 0) return false;
    return addrs.every((a) => isPublicIp(a.address));
  } catch {
    return false;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      try {
        return String.fromCodePoint(Math.min(Number(n), 0x10ffff));
      } catch {
        return "";
      }
    });
}

function htmlToText(html: string): { title: string; text: string } {
  const title =
    decodeEntities(
      (html.match(/<title[^>]*>([\s\S]{0,300})<\/title>/i)?.[1] ?? "").trim(),
    ).slice(0, 200) || "";
  const body = (() => {
    const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    return m ? m[1] : html;
  })();
  const text = decodeEntities(
    body
      .replace(/<(script|style|noscript|svg|canvas|iframe)[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
  return { title, text: text.slice(0, MAX_TEXT) };
}

export async function POST(req: Request) {
  let urlStr: string;
  try {
    const body = (await req.json()) as { url?: unknown };
    if (typeof body.url !== "string") throw new Error("bad");
    urlStr = body.url.trim();
  } catch {
    return NextResponse.json({ error: "Empty body" }, { status: 400 });
  }
  let current: URL;
  try {
    current = new URL(urlStr);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }
  if (current.protocol !== "http:" && current.protocol !== "https:") {
    return NextResponse.json({ error: "Only http(s) URLs" }, { status: 400 });
  }
  if (current.username || current.password) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!(await hostIsPublic(current.hostname))) {
        return NextResponse.json({ error: "Blocked host" }, { status: 403 });
      }
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(current.toString(), {
          redirect: "manual",
          signal: ctl.signal,
          headers: {
            "User-Agent": "canary-gemma/1.0 (+reader)",
            Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
          },
        });
      } finally {
        clearTimeout(timer);
      }
      if (res.status >= 300 && res.status < 400) {
        if (hop === MAX_REDIRECTS) {
          return NextResponse.json({ error: "Too many redirects" }, { status: 502 });
        }
        const loc = res.headers.get("location");
        if (!loc) return NextResponse.json({ error: "Bad redirect" }, { status: 502 });
        current = new URL(loc, current);
        if (current.protocol !== "http:" && current.protocol !== "https:") {
          return NextResponse.json({ error: "Only http(s) URLs" }, { status: 400 });
        }
        continue;
      }
      if (!res.ok) {
        return NextResponse.json(
          { error: `HTTP ${res.status}` },
          { status: 502 },
        );
      }
      const len = Number(res.headers.get("content-length") ?? "0");
      if (len > MAX_BYTES * 2) {
        return NextResponse.json({ error: "Page too large" }, { status: 502 });
      }
      const buf = Buffer.from(await res.arrayBuffer()).slice(0, MAX_BYTES);
      const ct = (res.headers.get("content-type") ?? "").toLowerCase();
      const raw = buf.toString("utf-8");
      if (ct.includes("text/plain")) {
        return NextResponse.json({
          title: "",
          text: raw.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT),
          url: current.toString(),
        });
      }
      const { title, text } = htmlToText(raw);
      if (!text) {
        return NextResponse.json({ error: "No readable text" }, { status: 502 });
      }
      return NextResponse.json({ title, text, url: current.toString() });
    }
    return NextResponse.json({ error: "Too many redirects" }, { status: 502 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/abort/i.test(msg)) {
      return NextResponse.json({ error: "Timed out" }, { status: 502 });
    }
    return NextResponse.json({ error: "Fetch failed" }, { status: 502 });
  }
}
