// Display-side safety net: extract only the final result.
//
// Doctrine: NO question-specific or instruction-specific vocabulary here.
// Hardcoded phrase lists ("the user said …", "I must …", "reply in X")
// only work for the exact questions they were written for. Instead this
// file uses shape only — repeats, quoted drafts, `Label:` headers,
// yes/no pairs, code fences, dedupe — which works for ANY question.
// Prompts carry no behavior lectures either, so there is little left
// for a model to deliberate about in the first place.
// Callers apply this only to final natural-language answers.

/** True for CJK text (Korean/Japanese/Chinese) — the reply language. */
function hasCJK(s: string): boolean {
  return /[\uAC00-\uD7AF\u3040-\u30FF\u4E00-\u9FFF]/.test(s);
}

// --- Structural trace shapes (no content words) ---
//
// A deliberation trace has a recognizable SHAPE whatever its vocabulary:
// leading `Label:`-style sentences, `…?` immediately answered by a bare
// yes/no, and the real answer repeated at the end (quoted draft + bare).
// extractTracedAnswer() returns just that final answer when all three
// signals line up, else null (normal text untouched).

/** Sentences modulo quotes/case/whitespace — for repeat detection. */
function normSent(s: string): string {
  return s
    .trim()
    .replace(/^["“”'‘’⤴\s]+|["“”'‘’.!?。！？\s]+$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** `Label: …` header-shaped sentence (any language, any words). */
function isHeaderShape(s: string): boolean {
  return /^[A-Za-z가-힣][^:?\n]{1,30}:\s+\S/.test(s.trim());
}

/** Bare yes/no sentence (closed set, pre-existing in this file). */
function isYesNoShape(s: string): boolean {
  return /^["“”'‘’]?(yes|no|네|아니요)\.?["“”'‘’]?$/.test(s.trim().toLowerCase());
}

/** Sentence ending in a question mark (modulo closers/quotes). */
function endsQShape(s: string): boolean {
  return /\?\s*["“”'‘’)\]]?$/.test(s.trim());
}

/**
 * Trailing-answer extraction (vocabulary-free): if the message ends with a
 * short run of reply-language (CJK) sentences after non-CJK scaffolding
 * (`Label:` headers, `?`→yes/no pairs, note asides), the run IS the answer —
 * whatever the question was, whatever words the scaffolding uses.
 * Guards: single paragraph (lists keep structure), gated on scaffolding
 * shapes (titled legit answers like "제목: …" stay), near-dup collapse at
 * 0.85 (distinct facts like "오늘/내일 날씨가 좋아요" at 0.80 survive).
 */
function extractAnswerTail(text: string): string | null {
  const parts = text
    .split(/(?<=[.!?。！？][)\]”"]?)\s+/)
    .map((p) => p.trim())
    .filter((p) => p && normSent(p).length > 0);
  if (parts.length < 2) return null;
  let start = parts.length;
  while (start > 0 && hasCJK(parts[start - 1])) start--;
  const run = parts.slice(start);
  const rest = parts.slice(0, start);
  if (run.length === 0 || rest.length === 0 || run.length > 6) return null;
  if (run.join(" ").includes("\n")) return null;
  let headers = 0;
  for (const s of rest) {
    const b = s.replace(/^[*•\-]\s+/, "").trim();
    if (isHeaderShape(b)) headers++;
  }
  let qa = false;
  for (let k = 0; k + 1 < rest.length; k++) {
    if (endsQShape(rest[k]) && isYesNoShape(rest[k + 1])) {
      qa = true;
      break;
    }
  }
  if (!(headers >= 2 || (headers >= 1 && qa))) return null;
  const cleaned = run.map((p, idx) => {
    let c = p.trim().replace(/^["“”'‘’]+\s*|\s*["“”'‘’]+$/g, "");
    // The run was already proven scaffolding-adjacent, so a label on its
    // first sentence (`Response: …`) is residue, not content. Later
    // sentences keep their colons (`Name: Sam.` survives elsewhere).
    if (idx === 0) {
      c = c
        .replace(/^[*•\-]\s+/, "")
        .replace(/^[A-Za-z가-힣][^:?\n]{1,30}:\s*/, "")
        .trim();
    }
    return c;
  });
  const kept: string[] = [];
  for (let i = cleaned.length - 1; i >= 0; i--) {
    const c = cleaned[i];
    if (!c) continue;
    const cn = normSent(c);
    let dup = false;
    for (const k of kept) {
      const kn = normSent(k);
      if (cn && cn === kn) {
        dup = true;
        break;
      }
      if (cn.length >= 8 && kn.length >= 8 && similarity(c, k) >= 0.85) {
        dup = true;
        break;
      }
    }
    if (!dup) kept.unshift(c);
  }
  if (kept.length === 0) return null;
  return kept.join(" ").trim() || null;
}

/**
 * If the message is a deliberation trace ending in its (repeated) answer,
 * return just the answer. Requirements, all structural:
 * - the last two sentences are equal modulo quotes/case (quoted draft +
 *   bare repeat), AND
 * - a `Label:` header or a `?`→yes/no pair appears before them.
 */
function extractTracedAnswer(text: string): string | null {
  const flat = text.replace(/\r\n/g, "\n").replace(/\n+/g, " ").trim();
  if (!flat) return null;
  const parts = flat
    .split(/(?<=[.!?。！？][)\]”"]?)\s+/)
    .map((p) => p.trim())
    .filter((p) => p && normSent(p).length > 0);
  if (parts.length < 3) return null;
  const n = parts.length;
  const last = normSent(parts[n - 1]);
  const prev = normSent(parts[n - 2]);
  // Longer than any bare affirmation ("yes"/"no"/"네"/"아니요" ≤ 4 chars),
  // so a plain "Yes. Yes." can never trigger this.
  if (last.length <= 4 || last !== prev) return null;
  const head = parts.slice(0, n - 2);
  let confirmed = head.some(isHeaderShape);
  if (!confirmed) {
    for (let k = 0; k + 1 < head.length; k++) {
      if (endsQShape(head[k]) && isYesNoShape(head[k + 1])) {
        confirmed = true;
        break;
      }
    }
  }
  if (!confirmed) return null;
  return parts[n - 1].replace(/^["“”'‘’⤴\s]+|["“”'‘’⤴\s]+$/g, "").trim() || null;
}

/** Drop consecutive duplicate sentences and exact-duplicated halves. */
function dedupe(text: string): string {
  // Whole-text doubled (answer printed twice back-to-back).
  const half = Math.floor(text.length / 2);
  if (half > 20 && text.slice(0, half).trim() === text.slice(half).trim()) {
    return text.slice(0, half).trim();
  }
  // Per line, so paragraph breaks and lists survive untouched.
  return text
    .split("\n")
    .map((line) => {
      const parts = line.split(/(?<=[.!?。！？])\s+/);
      const out: string[] = [];
      for (const p of parts) {
        if (out.length > 0 && out[out.length - 1].trim() === p.trim() && p.trim()) continue;
        out.push(p);
      }
      return out.join(" ");
    })
    .join("\n");
}

/** Clean a final model answer for display. Idempotent. */
export function sanitizeAnswer(raw: string): string {
  if (!raw) return raw;
  let text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return "";
  // Code blocks stay untouched apart from repeat-collapsing (this guard
  // must come first — ``` fences are symbol-only lines, see below).
  if (text.includes("```")) return dedupe(text);
  // Leading single-char fragment ("G\n…") and trailing symbol-only lines
  // ("…\n⤴") carry no content — drop them while real content remains.
  // Shapes only, no vocabulary.
  text = text.replace(/^[A-Za-z0-9]\s*\n+(?=\S)/, "");
  const fragLines = text.split("\n");
  while (
    fragLines.length > 1 &&
    fragLines[fragLines.length - 1].trim() !== "" &&
    /^[^\p{L}\p{N}]+$/u.test(fragLines[fragLines.length - 1].trim())
  ) {
    fragLines.pop();
  }
  text = fragLines.join("\n").trim();
  if (!text) return "";

  // Trailing reply-language run after scaffolding — the run is the answer.
  const tail = extractAnswerTail(text);
  if (tail) text = tail;

  // Deliberation trace with a repeated answer at the end (shape-based,
  // vocabulary-free) — take just the answer up front.
  const traced = extractTracedAnswer(text);
  if (traced) return dedupe(traced);

  // Deliberation + quoted drafts + repeated tail (`Label:` scaffolding,
  // `"Draft?"`, analysis, `"Answer."Answer.`) — the repeated final run
  // is the answer. Gated on scaffolding proof, so normal text passes
  // through untouched.
  const finalRepeat = extractFinalRepeat(text);
  if (finalRepeat) return finalRepeat;

  // Quoted draft + bare repeat (`"Answer." … Answer.`): the quoted copy
  // is the draft, the final is the answer. Any language, any question.
  const quotedDraft = extractQuotedDraft(text);
  if (quotedDraft) return quotedDraft;

  // Trace that ends with its answer under a `Label:` — take just the
  // tail. Generic: ANY label words, but only with plural proof (>= 2
  // headers) plus content proof (the tail repeats earlier content, or a
  // ?-yes/no pair exists). Single labels ("Name: Sam.") and titled prose
  // pass through untouched.
  const labeled = extractLastLabeled(text);
  if (labeled !== null) text = labeled;

  // Leading whole-line scaffolding (bare analysis headers, labeled
  // parenthesized asides) carries no content — drop it. Anything left
  // standing is shown as-is; nothing left means chDidntGet downstream.
  const leadLines = text.split("\n");
  while (leadLines.length > 0 && (leadLines[0].trim() === "" || isScaffoldLine(leadLines[0]))) {
    leadLines.shift();
  }
  text = leadLines.join("\n").trim();
  if (!text) return "";

  // Glued boundaries from streaming ("…it.)저는…", `"Hi!"Hi!`) — split
  // CJK joints and quote/paren glue. Decimals/URLs like 3.14 stay intact:
  // the glue needs punctuation + a closer before the join.
  text = text
    .replace(/([.!?。！？)\]”"])(?=[가-힣])/g, "$1 ")
    .replace(/([가-힣])(?=["“‘(\[])/g, "$1 ")
    .replace(/([.!?]["”'’)\]])(?=[A-Za-z0-9“"(\[])/g, "$1 ");

  // Unwrap the first quoted segment: `"저는 …입니다." (trans) 저는 …입니다.`
  // → `저는 …입니다. (trans) 저는 …입니다.` so the steps below can finish it.
  const quoted = text.match(/^["“]\s*([^"”]+?)\s*["”]([\s\S]*)$/);
  if (quoted) {
    const inner = quoted[1].trim();
    const rest = (quoted[2] || "").trim();
    text = rest ? `${inner} ${rest}`.trim() : inner;
  }

  // Standalone English parentheticals inside an otherwise CJK answer are
  // translation asides ("(I am …)"), not content the user asked for.
  if (hasCJK(text)) {
    const sents = text.split(/(?<=[.!?。！？][)\]”"]?)\s+/);
    const kept = sents.filter((s) => {
      const st = s.trim();
      if (/^\([^()]{0,200}\)\.?$/.test(st) && !hasCJK(st)) return false;
      return true;
    });
    if (kept.length > 0 && kept.length !== sents.length) text = kept.join(" ").trim();
  }

  text = text
    .replace(/^(?:final\s+(?:answer|string)|draft response|response|answer)\s*:\s*/i, "")
    .replace(/^["“]+\s*/, "")
    .trim();
  if (!text) return "";
  return dedupe(dropEarlierCopiesOfFinal(text));
}

/** Character-level similarity ratio (0-1) on normalized sentences. */
function similarity(a: string, b: string): number {
  const x = normSent(a);
  const y = normSent(b);
  const m = x.length;
  const n = y.length;
  if (m === 0 || n === 0) return 0;
  if (x === y) return 1;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

/**
 * Draft + final back-to-back ("A. B. A'. B'") — keep the later half.
 * ONLY for already-isolated answer regions (after a Final String: /
 * Response: label). Never applied generally: near-identical sentences can
 * be distinct facts ("오늘/내일 날씨가 좋아요").
 */
function collapseDoubledHalves(text: string): string {
  if (text.includes("\n")) return text;
  const parts = text.split(/(?<=[.!?。！？][)\]”"]?)\s+/);
  if (parts.length < 4 || parts.length % 2 !== 0) return text;
  const half = parts.length / 2;
  for (let k = 0; k < half; k++) {
    const a = normSent(parts[k]);
    const b = normSent(parts[k + half]);
    if (Math.min(a.length, b.length) < 8 || similarity(parts[k], parts[k + half]) < 0.7) {
      return text;
    }
  }
  return parts.slice(half).join(" ").trim();
}

/**
 * Deliberation + quoted drafts + repeated tail
 * (`Label:` scaffolding, `"Draft?"`, analysis, `"Answer."Answer.`): the
 * repeated final run IS the answer.
 * Fires only with hard scaffolding proof, so legit text survives:
 * - single paragraph (multi-paragraph text passes through untouched),
 * - the tail is a doubled window (quote-insensitive): the last w
 *   sentences repeat the w before them (w = 1..3), or a quoted fuller
 *   copy carries the final,
 * - the head (everything before the run) holds >= 2 structural
 *   markers (Label: headers, quoted draft spans, ?-yes/no pairs).
 * Returns the run de-quoted, or null.
 */
function extractFinalRepeat(text: string): string | null {
  if (text.includes("\n")) return null;
  const unglued = text.replace(/([.!?]["”'’)\]])(?=[A-Za-z0-9“"(\[])/g, "$1 ");
  const parts = unglued
    .split(/(?<=[.!?。！？][)\]”"]?)\s+/)
    .map((p) => p.trim())
    .filter((p) => p && normSent(p).length > 0);
  const n = parts.length;
  if (n < 3) return null;
  const final = normSent(parts[n - 1]);
  if (final.length <= 4) return null;
  const dequote = (p: string): string =>
    p
      .trim()
      .replace(/^["“”'‘’⤴\s]+|["“”'‘’⤴\s]+$/g, "")
      .trim();
  // Smallest doubled window first (w=1 subsumes the plain repeat).
  for (let w = 1; w <= 3 && 2 * w <= n; w++) {
    let ok = true;
    for (let j = 0; j < w; j++) {
      if (normSent(parts[n - 2 * w + j]) !== normSent(parts[n - w + j])) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const k = n - w;
    if (k === 0) return null;
    if (!scaffoldedHead(parts.slice(0, k))) continue;
    return parts.slice(k).join(" ").trim().replace(/^["“”'‘’\s]+|["“”'‘’\s]+$/g, "").trim() || null;
  }
  // Quoted fuller copy carrying a short final (`"Yo! How can…?"` +
  // `How can…?` when the window match above missed on length).
  if (n >= 3) {
    const prev = parts[n - 2];
    const pn = normSent(prev);
    if (
      /^["“'‘’]/.test(prev.trim()) &&
      pn.endsWith(final) &&
      pn.length > final.length &&
      pn.length <= final.length + 40 &&
      scaffoldedHead(parts.slice(0, n - 1))
    ) {
      return dequote(prev) || null;
    }
  }
  return null;
}

/** A whole line that is pure scaffolding, never content: a bare analysis
 * header, or a parenthesized aside LABEL (`(Note: …)`). Whole-line only —
 * inline uses stay untouched. */
function isScaffoldLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^(thinking|thought|analysis|reasoning|internal monologue)\s*:?$/i.test(t)) return true;
  if (/^\((note|system|internal)\b[^()\n]{0,200}\)\.?$/i.test(t)) return true;
  return false;
}

/**
 * Generic labeled-answer take: a trace that ends with its answer under a
 * `Label:` takes just the tail — any label words, any language. Proof
 * required, so titled prose survives: >= 2 headers in the text, plus
 * content proof (the tail repeats earlier content, or a ?-yes/no pair
 * exists). Single labels ("Name: Sam.") always pass through untouched.
 */
function extractLastLabeled(text: string): string | null {
  const parts = text
    .split(/(?<=[.!?。！？][)\]”"]?)\s+|\n+/)
    .map((p) => p.trim())
    .filter((p) => p && normSent(p).length > 0);
  if (parts.length < 3) return null;
  const headerIdx: number[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (isHeaderShape(parts[i].replace(/^[*•\-]\s+/, "").trim())) headerIdx.push(i);
  }
  if (headerIdx.length < 2) return null;
  const last = headerIdx[headerIdx.length - 1];
  const tail = parts
    .slice(last)
    .join(" ")
    .replace(/^[*•\-]\s+/, "")
    .replace(/^[A-Za-z가-힣][^:?\n]{1,30}:\s*/, "")
    .trim();
  if (!tail) return null;
  const tailNorms = tail
    .split(/(?<=[.!?。！？][)\]”"]?)\s+/)
    .map((p) => normSent(p))
    .filter((n) => n.length > 4);
  if (tailNorms.length === 0) return null;
  const headNorms = new Set(parts.slice(0, last).map((p) => normSent(p)));
  const repeats = tailNorms.some((tn) => headNorms.has(tn));
  let qa = false;
  for (let i = 0; i + 1 < parts.length; i++) {
    if (endsQShape(parts[i]) && isYesNoShape(parts[i + 1])) {
      qa = true;
      break;
    }
  }
  if (!repeats && !qa) return null;
  return collapseDoubledHalves(tail) || null;
}

/**
 * Quoted draft + bare repeat: some earlier `"quoted span"` says exactly
 * what the final sentence says (any language, any question). The quoted
 * copy is the draft, the final is the answer — return the final.
 * Proof required: >= 2 structural markers with at least the matching
 * draft among them (a lone quote + echo is just emphasis, keep it).
 */
function extractQuotedDraft(text: string): string | null {
  const parts = text
    .split(/(?<=[.!?。！？][)\]”"]?)\s+|\n+/)
    .map((p) => p.trim())
    .filter((p) => p && normSent(p).length > 0);
  if (parts.length < 3) return null;
  const final = normSent(parts[parts.length - 1]);
  if (final.length <= 4) return null;
  const head = parts.slice(0, parts.length - 1);
  const drafts = head.join(" ").match(/["“][^"”]{8,}["”]/g) ?? [];
  if (!drafts.some((d) => normSent(d) === final)) return null;
  let markers = drafts.length;
  for (const p of head) {
    if (isHeaderShape(p.replace(/^[*•\-]\s+/, "").trim())) markers++;
  }
  for (let i = 0; i + 1 < head.length; i++) {
    if (endsQShape(head[i]) && isYesNoShape(head[i + 1])) {
      markers++;
      break;
    }
  }
  if (markers < 2) return null;
  return parts[parts.length - 1].replace(/^["“”'‘’\s]+|["“”'‘’\s]+$/g, "").trim() || null;
}

/** Scaffolding proof: >= 2 structural markers, no vocabulary involved. */
function scaffoldedHead(head: string[]): boolean {  if (head.length === 0) return false;
  let markers = 0;
  for (const p of head) {
    if (isHeaderShape(p.replace(/^[*•\-]\s+/, "").trim())) markers++;
  }
  const flat = head.join(" ");
  const drafts = flat.match(/["“][^"”]{8,}["”]/g);
  if (drafts) markers += drafts.length;
  for (let i = 0; i + 1 < head.length; i++) {
    if (endsQShape(head[i]) && isYesNoShape(head[i + 1])) {
      markers++;
      break;
    }
  }
  return markers >= 2;
}

/**
 * Generic no-duplication rule (vocabulary-free): the final sentence wins —
 * drop earlier copies of it (modulo quotes/case/whitespace), whatever the
 * question was. Single-paragraph only, so lists and multi-paragraph answers
 * keep their structure. Bare affirmations ("Yes.") never trigger it.
 */function dropEarlierCopiesOfFinal(text: string): string {
  if (text.includes("\n")) return text;
  const parts = text.split(/(?<=[.!?。！？][)\]”"]?)\s+/);
  if (parts.length < 2) return text;
  const target = normSent(parts[parts.length - 1]);
  if (target.length <= 4) return text;
  const kept = parts.filter(
    (p, idx) => idx === parts.length - 1 || normSent(p) !== target,
  );
  return kept.length === parts.length ? text : kept.join(" ").trim();
}
