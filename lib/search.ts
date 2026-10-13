import type { ChatMessage } from "./types";
import { renderMarkdown, stripLeakedToolText } from "./markdown";

/** One match inside the rendered content of a message. */
export interface SearchHit {
  msgIdx: number;
  start: number;
  end: number;
}

/** A hit enriched with its position in the flat match list (for active styling). */
export interface HighlightHit {
  start: number;
  end: number;
  globalIdx: number;
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildSearchRegExp(query: string): RegExp | null {
  const q = query.trim();
  if (!q) return null;
  try {
    return new RegExp(escapeRegExp(q), "gi");
  } catch {
    return null;
  }
}

/** All case-insensitive matches in a plain-text string. */
export function findTextHits(text: string, re: RegExp): { start: number; end: number }[] {
  const hits: { start: number; end: number }[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    hits.push({ start: m.index, end: m.index + m[0].length });
    if (m[0].length === 0) re.lastIndex++;
  }
  return hits;
}

/** Matches inside an HTML string, restricted to text nodes so tags/attributes
 *  are never corrupted by the highlight spans. */
export function findHtmlHits(html: string, re: RegExp): { start: number; end: number }[] {
  const hits: { start: number; end: number }[] = [];
  const tagRe = /<[^>]*>/g;
  const scan = (seg: string, offset: number) => {
    re.lastIndex = 0;
    let r: RegExpExecArray | null;
    while ((r = re.exec(seg)) !== null) {
      hits.push({ start: offset + r.index, end: offset + r.index + r[0].length });
      if (r[0].length === 0) re.lastIndex++;
    }
  };
  let segStart = 0;
  let tm: RegExpExecArray | null;
  while ((tm = tagRe.exec(html)) !== null) {
    scan(html.slice(segStart, tm.index), segStart);
    segStart = tagRe.lastIndex;
  }
  scan(html.slice(segStart), segStart);
  return hits;
}

/** Flat, ordered match list across the whole conversation. User messages are
 *  matched against raw text; assistant messages against their rendered markdown
 *  (exactly what MessageList paints), so highlight offsets line up. */
export function computeSearchHits(
  messages: ChatMessage[],
  query: string,
  mdCopyLabel: string,
): SearchHit[] {
  const re = buildSearchRegExp(query);
  if (!re) return [];
  const hits: SearchHit[] = [];
  messages.forEach((m, msgIdx) => {
    if (typeof m.content !== "string") return;
    if (m.role === "user") {
      for (const h of findTextHits(m.content, re)) hits.push({ msgIdx, ...h });
      return;
    }
    const html = renderMarkdown(stripLeakedToolText(m.content), mdCopyLabel);
    for (const h of findHtmlHits(html, re)) hits.push({ msgIdx, ...h });
  });
  return hits;
}

/** Wrap matched ranges of an HTML string in highlight spans. */
export function highlightHtml(html: string, hits: HighlightHit[], activeHitIndex: number): string {
  const sorted = [...hits].sort((a, b) => a.start - b.start || a.end - b.end);
  let out = "";
  let cursor = 0;
  for (const h of sorted) {
    if (h.start < cursor || h.start >= h.end) continue;
    out += html.slice(cursor, h.start);
    const cls =
      h.globalIdx === activeHitIndex ? "search-match search-match-active" : "search-match";
    out += `<span class="${cls}">${html.slice(h.start, h.end)}</span>`;
    cursor = h.end;
  }
  out += html.slice(cursor);
  return out;
}
