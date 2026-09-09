// Tiny zero-dependency markdown renderer for chat messages.
// Supports: fenced code blocks, inline code, bold, italic, headings,
// unordered/ordered lists, links, blockquotes, tables (basic), line breaks.
// Everything is HTML-escaped FIRST, so model output can never inject markup.
// Unclosed fences (mid-stream) are auto-closed so streaming never breaks.

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(s: string): string {
  // s is already escaped; add inline elements.
  let out = s;
  out = out.replace(/`([^`\n]+)`/g, "<code class=\"md-code\">$1</code>");
  out = out.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*\w])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/(^|[^~\w])~~([^~\n]+)~~/g, "$1<del>$2</del>");
  return out;
}

export function renderMarkdown(text: string): string {
  const lines = esc(text).split("\n");
  let html = "";
  let inFence = false;
  let fenceLang = "";
  let fenceBuf: string[] = [];
  let listTag: string | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length > 0) {
      html += `<p>${inline(para.join(" "))}</p>`;
      para = [];
    }
  };
  const closeList = () => {
    if (listTag) {
      html += `</${listTag}>`;
      listTag = null;
    }
  };
  const flushFence = () => {
    const code = fenceBuf.join("\n").replace(/^\n+|\n+$/g, "");
    const cls = fenceLang ? ` class="md-lang-${fenceLang}"` : "";
    html += `<pre class="md-pre"><code${cls}>${code || " "}</code></pre>`;
    fenceBuf = [];
    fenceLang = "";
  };

  for (const line of lines) {
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      if (inFence) {
        inFence = false;
        flushFence();
      } else {
        inFence = true;
        fenceLang = (fence[1] || "").replace(/[^a-z0-9+-]/gi, "");
        flushPara();
        closeList();
      }
      continue;
    }
    if (inFence) {
      fenceBuf.push(line);
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushPara();
      closeList();
      const level = heading[1].length;
      html += `<h${level + 2} class="md-h">${inline(heading[2])}</h${level + 2}>`;
      continue;
    }
    const quote = line.match(/^&gt;\s?(.*)$/);
    if (quote) {
      flushPara();
      closeList();
      html += `<blockquote class="md-quote">${inline(quote[1])}</blockquote>`;
      continue;
    }
    if (/^\s*---+\s*$/.test(line)) {
      flushPara();
      closeList();
      html += "<hr class=\"md-hr\" />";
      continue;
    }
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const tag = ul ? "ul" : "ol";
      if (listTag !== tag) {
        closeList();
        html += `<${tag} class="md-list">`;
        listTag = tag;
      }
      html += `<li>${inline((ul ?? ol)![1])}</li>`;
      continue;
    }
    if (/^\s*$/.test(line)) {
      flushPara();
      closeList();
      continue;
    }
    if (/^\|(.+)\|$/.test(line.trim()) && line.includes("|")) {
      // Table rows: render header separator honestly, cells simply.
      const cells = line
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((c) => inline(c.trim()));
      if (/^[\s|:-]+$/.test(line.trim().replace(/&[^;]+;/g, ""))) {
        continue; // separator row — skip
      }
      flushPara();
      closeList();
      html += `<div class="md-trow">${cells.map((c) => `<span class="md-tcell">${c}</span>`).join("")}</div>`;
      continue;
    }
    para.push(line.trim());
  }
  if (inFence) flushFence(); // unclosed fence (streaming) — still render
  flushPara();
  closeList();
  return html || " ";
}
