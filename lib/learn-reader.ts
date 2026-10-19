// Authentic-input reader — pure helpers shared by /api/read (server extraction)
// and ReadBox (client rendering). Zero-token: no AI, no network here.
//
// The API route owns the risky part (fetching arbitrary URLs); this file stays
// dependency-free so it can ship to the browser and be unit-tested in Node.

import type { CEFR } from "./learn-bank";

export interface Article {
  title: string;
  site: string;
  url: string;
  paragraphs: string[];
  text: string;
  wordCount: number;
  minutes: number;
  level: CEFR;
}

export interface DictEntry {
  term: string;
  level: CEFR;
  meaning: string;
  ko?: string;
}

const CEFR_ORDER: CEFR[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
function levelRank(level: CEFR | null | undefined): number {
  const i = CEFR_ORDER.indexOf(level ?? "A1");
  return i < 0 ? 0 : i;
}

// ---------------------------------------------------------------------------
// URL safety (used by the server route; exported for tests)
// ---------------------------------------------------------------------------

/**
 * True for hosts that must never be fetched: loopback, private LAN, link-local,
 * CGNAT, multicast, `.local` names and IPv6 ULA/link-local. Hostnames that are
 * not IP literals pass here and are resolved + re-checked in the route.
 */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "::1" || h === "0.0.0.0" || h === "::") return true;

  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  if (h.includes(":")) {
    const mapped = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mapped) {
      const hi = parseInt(mapped[1], 16);
      const lo = parseInt(mapped[2], 16);
      const v4 = [(hi >> 8) & 255, hi & 255, (lo >> 8) & 255, lo & 255].join(".");
      return isPrivateHost(v4);
    }
    const embedded = h.replace(/^::ffff:/, "");
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(embedded)) return isPrivateHost(embedded);
    if (embedded.startsWith("fe80:") || embedded.startsWith("fc") || embedded.startsWith("fd")) {
      return true;
    }
  }
  return false;
}

/** Parse + vet a user-supplied URL. Returns null for anything unusable. */
export function cleanReadUrl(raw: unknown): URL | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== "80" && u.port !== "443") return null;
  if (isPrivateHost(u.hostname)) return null;
  return u;
}

// ---------------------------------------------------------------------------
// HTML → article
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  copy: "©",
  reg: "®",
  trade: "™",
  eacute: "é",
  egrave: "è",
  agrave: "à",
  ccedil: "ç",
  uuml: "ü",
  ouml: "ö",
  auml: "ä",
  szlig: "ß",
  middot: "·",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]+);/g, (m, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const n = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff) return m;
      try {
        return String.fromCodePoint(n);
      } catch {
        return m;
      }
    }
    return ENTITIES[body.toLowerCase()] ?? m;
  });
}

export function stripTags(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|iframe|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");
}

function collapse(s: string): string {
  return decodeEntities(s)
    .replace(/\[\s*\d+\s*\]/g, "") // footnote markers like [3]
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?%)\]])/g, "$1")
    .replace(/\(\s+/g, "(")
    .trim();
}

function metaContent(html: string, prop: string): string {
  const want = prop.toLowerCase();
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const name = tag.match(/(?:property|name)=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (name !== want) continue;
    const content = tag.match(/content=["']([\s\S]*?)["']/i)?.[1];
    if (content) return collapse(content);
  }
  return "";
}

function innerTag(html: string, tag: string): string {
  const m = html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m?.[1] ?? "";
}

const JUNK =
  /^(advertisement|subscribe|sign up|sign in|log in|share|related|recommended|read more|photo|image|video|listen to this article|get the app|download the app)\b/i;

function isJunkParagraph(p: string): boolean {
  if (p.length < 40) return true;
  if (p.length < 160 && (JUNK.test(p) || /\bcookies?\b/i.test(p) || /all rights reserved/i.test(p))) {
    return true;
  }
  if (/^(by|published|updated|photo by|illustration by)\b/i.test(p) && p.length < 100) return true;
  return false;
}

/** Split prose into readable paragraphs; re-chunk one giant blob by sentence. */
export function paragraphsFromText(raw: string): string[] {
  const normalized = raw.replace(/\r\n?/g, "\n");
  let parts = normalized
    .split(/\n\s*\n+/)
    .flatMap((p) => p.split(/\n(?=[A-Z0-9"“'])/))
    .map(collapse)
    .filter(Boolean);
  if (parts.length === 1 && parts[0].length > 700) {
    const sentences = parts[0].split(/(?<=[.!?])\s+(?=[A-Z0-9"“'])/);
    const chunks: string[] = [];
    for (let i = 0; i < sentences.length; i += 3) {
      chunks.push(sentences.slice(i, i + 3).join(" "));
    }
    parts = chunks.map(collapse).filter(Boolean);
  }
  const out: string[] = [];
  for (const p of parts) {
    if (out[out.length - 1] === p) continue;
    out.push(p);
  }
  return out;
}

export function countWords(text: string): number {
  return (text.match(/[A-Za-z][A-Za-z'’-]*/g) ?? []).length;
}

/** Rough CEFR estimate from sentence length, word length and variety. */
export function estimateReadLevel(text: string): CEFR {
  const words = text.match(/[A-Za-z][A-Za-z'’-]*/g) ?? [];
  if (words.length < 20) return "A1";
  const sentences = Math.max(1, (text.match(/[.!?]+(?=\s|$)/g) ?? []).length);
  const avg = words.length / sentences;
  const longRatio = words.filter((w) => w.length >= 7).length / words.length;
  const denseRatio = words.filter((w) => w.length >= 10).length / words.length;
  const uniqueRatio = new Set(words.map((w) => w.toLowerCase())).size / words.length;

  let score = 0;
  if (avg >= 28) score += 4;
  else if (avg >= 23) score += 3;
  else if (avg >= 19) score += 2;
  else if (avg >= 15) score += 1;
  if (longRatio >= 0.2) score += 3;
  else if (longRatio >= 0.15) score += 2;
  else if (longRatio >= 0.1) score += 1;
  if (denseRatio >= 0.35) score += 3;
  else if (denseRatio >= 0.22) score += 2;
  else if (denseRatio >= 0.12) score += 1;
  if (uniqueRatio >= 0.6) score += 1;

  if (score >= 10) return "C2";
  if (score >= 8) return "C1";
  if (score >= 6) return "B2";
  if (score >= 4) return "B1";
  if (score >= 2) return "A2";
  return "A1";
}

function buildArticle(
  title: string,
  site: string,
  url: string,
  paragraphs: string[],
  fallbackTitle = "Untitled article",
): Article {
  const text = paragraphs.join("\n\n");
  const wordCount = countWords(text);
  return {
    title: title || fallbackTitle,
    site,
    url,
    paragraphs,
    text,
    wordCount,
    minutes: Math.max(1, Math.round(wordCount / 220)),
    level: estimateReadLevel(text),
  };
}

/** Extract readable paragraphs from a fetched HTML page. */
export function extractArticle(html: string, url: string): Article {
  const rawTitle =
    metaContent(html, "og:title") ||
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ||
    innerTag(html, "h1");
  const title = collapse(rawTitle ?? "");
  let site = "";
  try {
    site = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    site = "";
  }

  const zone = innerTag(html, "article") || innerTag(html, "main") || html;
  const cleaned = zone
    .replace(/<(script|style|noscript|svg|iframe|template|form|nav|footer|header|aside)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  let paragraphs: string[] = [];
  for (const m of cleaned.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const p = collapse(stripTags(m[1]));
    if (p) paragraphs.push(p);
  }

  if (paragraphs.length < 2) {
    const text = stripTags(
      cleaned
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h[1-6]|section|blockquote|article)>/gi, "\n\n"),
    );
    paragraphs = paragraphsFromText(text);
  }

  const filtered = paragraphs.filter((p) => !isJunkParagraph(p));
  if (filtered.length >= 1) paragraphs = filtered;

  return buildArticle(title, site, url, paragraphs);
}

/** Build an article from text the learner pasted in. */
export function articleFromText(raw: string, title = "Pasted text"): Article {
  const paragraphs = paragraphsFromText(raw).filter((p) => p.length >= 2);
  return buildArticle(title, "Pasted", "", paragraphs);
}

// ---------------------------------------------------------------------------
// Study aids
// ---------------------------------------------------------------------------

/** English words that are worth learning from this article (at / just above level). */
export function matchStudyWords(
  text: string,
  entries: DictEntry[],
  level: CEFR | null,
  max = 8,
): DictEntry[] {
  const seen = new Set(
    (text.match(/[A-Za-z][A-Za-z'’-]*/g) ?? []).map((w) => w.toLowerCase()),
  );
  const rank = levelRank(level);
  const used = new Set<string>();
  const out: DictEntry[] = [];
  for (const e of entries) {
    const term = e.term.trim().toLowerCase();
    if (!term || term.includes(" ") || used.has(term) || term.length < 3) continue;
    if (!seen.has(term)) continue;
    const r = levelRank(e.level);
    if (r < rank || r > rank + 1) continue;
    used.add(term);
    out.push({ ...e, term });
  }
  out.sort((a, b) => levelRank(b.level) - levelRank(a.level) || a.term.localeCompare(b.term));
  return out.slice(0, max);
}

/** Possible dictionary keys for an inflected surface form. */
export function lemmaCandidates(word: string): string[] {
  const w = word
    .toLowerCase()
    .replace(/[’']s$/, "")
    .replace(/^[^a-z]+|[^a-z]+$/g, "");
  if (!w) return [];
  const out = new Set<string>([w]);
  if (w.endsWith("ies") && w.length > 4) out.add(w.slice(0, -3) + "y");
  if (w.endsWith("ied") && w.length > 4) out.add(w.slice(0, -3) + "y");
  if (w.endsWith("es") && w.length > 3) out.add(w.slice(0, -2));
  if (w.endsWith("s") && !w.endsWith("ss") && w.length > 3) out.add(w.slice(0, -1));
  if (w.endsWith("ed") && w.length > 3) {
    out.add(w.slice(0, -2));
    out.add(w.slice(0, -1));
  }
  if (w.endsWith("ing") && w.length > 4) {
    out.add(w.slice(0, -3));
    out.add(w.slice(0, -3) + "e");
    const stem = w.slice(0, -3);
    if (stem.length > 2 && stem[stem.length - 1] === stem[stem.length - 2]) {
      out.add(stem.slice(0, -1));
    }
  }
  return [...out];
}

export interface ReaderToken {
  text: string;
  word: boolean;
}

/** Split a paragraph into tappable words + untouched separators. */
export function tokenizeParagraph(text: string): ReaderToken[] {
  const out: ReaderToken[] = [];
  for (const m of text.matchAll(/[A-Za-z][A-Za-z'’-]*|[^A-Za-z]+/g)) {
    const t = m[0];
    out.push({ text: t, word: /^[A-Za-z]/.test(t) });
  }
  return out;
}
