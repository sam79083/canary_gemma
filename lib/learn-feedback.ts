// AI-powered writing feedback, level-aware (differentiation: beyond grammar).
//
// Two layers, same philosophy as essay mode:
//   analyzeStyle() — deterministic, zero-token: sentence length, passive
//     voice, filler words, repeated openers, CEFR-appropriate vocab mix.
//   buildStyleCoachPrompt() — qualitative AI polish on top, with the rule
//     findings + the learner's target level baked in.
// Self-contained (no runtime cross-imports) so plain `node --test` covers it.

import type { CEFR } from "./learn-bank";

export type Goal = "general" | "business" | "academic" | "travel" | "exam";

export interface StyleMetric {
  sentences: number;
  words: number;
  avgSentenceLen: number;
  longSentences: number;
  passiveHits: number;
  fillerHits: string[];
  repeatedOpener: string | null;
  tone: "casual" | "neutral" | "formal";
}

export interface StyleFinding {
  tip: string;
  fix?: string;
}

const FILLERS = ["very", "really", "just", "quite", "actually", "basically", "literally", "stuff", "things", "a lot"];
const CASUAL_MARKS = ["gonna", "wanna", "kinda", "sorta", "yeah", "nope", "cool", "awesome", "hey", "btw", "lol", "omg"];
const FORMAL_MARKS = ["furthermore", "moreover", "nevertheless", "consequently", "regarding", "therefore", "thus", "hence", "accordingly"];

function sentencesOf(text: string): string[] {
  return text
    .split("\n")
    .flatMap((line) => line.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [])
    .map((s) => s.trim())
    .filter((s) => /[a-zA-Z]/.test(s));
}

function wordsOf(s: string): string[] {
  return (s.toLowerCase().match(/[a-z']+/g) ?? []).map((w) => w.replace(/^'+|'+$/g, "")).filter(Boolean);
}

export function analyzeStyle(rawText: string): StyleMetric {
  const text = rawText.replace(/\r/g, "");
  const sentences = sentencesOf(text);
  const all = wordsOf(text);
  const words = all.length;
  const lens = sentences.map((s) => wordsOf(s).length);
  const avg = lens.length > 0 ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
  const longSentences = lens.filter((l) => l > 25).length;
  // Passive: be-verb + past participle-ish (ed/en) within 3 words.
  // Passive: be-verb + (0-2 words) + participle. Regular (-ed/-en) plus
  // common irregulars (done/gone/seen/written/…), which never match -ed/-en.
  const IRREG = "done,gone,seen,been,written,taken,given,known,shown,grown,thrown,drawn,broken,spoken,chosen,forgotten,hidden,driven,eaten,fallen,built,sent,spent,paid,said,heard,found,thought,brought,bought,taught,caught,felt,kept,left,met,lost,paid,understood".split(",");
  let passiveHits = 0;
  const lower = ` ${text.toLowerCase()} `;
  const passives =
    lower.match(/\b(am|is|are|was|were|be|been|being)\b(\s+\w+){0,2}?\s+\w+(ed|en)\b/g) ?? [];
  passiveHits = Math.min(20, passives.length);
  if (passiveHits === 0) {
    for (const p of IRREG) {
      const re = new RegExp(`\\b(am|is|are|was|were|be|been|being)\\b(\\s+\\w+){0,2}?\\s+${p}\\b`, "g");
      const hits = lower.match(re) ?? [];
      passiveHits += hits.length;
      if (passiveHits >= 20) break;
    }
    passiveHits = Math.min(20, passiveHits);
  }
  const set = new Set(all);
  const fillerHits = FILLERS.filter((f) => set.has(f));
  // Repeated sentence openers (3+ sentences starting with the same word).
  const openers = sentences
    .map((s) => (s.match(/[a-zA-Z]+/) ?? [""])[0].toLowerCase())
    .filter((w) => w.length > 2 && !["the", "and", "but"].includes(w));
  const counts = new Map<string, number>();
  for (const o of openers) counts.set(o, (counts.get(o) ?? 0) + 1);
  let repeatedOpener: string | null = null;
  for (const [w, n] of counts) if (n >= 3) { repeatedOpener = w; break; }
  const casual = CASUAL_MARKS.filter((m) => lower.includes(m)).length;
  const formal = FORMAL_MARKS.filter((m) => lower.includes(m)).length;
  const tone = casual > formal ? "casual" : formal > casual ? "formal" : "neutral";
  return {
    sentences: sentences.length,
    words,
    avgSentenceLen: Math.round(avg * 10) / 10,
    longSentences,
    passiveHits,
    fillerHits,
    repeatedOpener,
    tone,
  };
}

/** Level-aware tips: what counts as "good" shifts with the target level. */
export function styleFindings(m: StyleMetric, level: CEFR | null, goal: Goal = "general"): StyleFinding[] {
  const out: StyleFinding[] = [];
  const target: CEFR = level ?? "B1";
  const rank = (["A1", "A2", "B1", "B2", "C1", "C2"] as CEFR[]).indexOf(target);

  if (m.words === 0)
    return [{ tip: "🦜 Paste a paragraph first — even 3 messy sentences work." }];
  if (m.avgSentenceLen > 22)
    out.push({ tip: `📏 Long sentences (avg ${m.avgSentenceLen} words) — split one with "and/but" into two. Short beats fancy.` });
  else if (m.avgSentenceLen > 0 && m.avgSentenceLen < 8 && rank >= 3)
    out.push({ tip: "📏 Short, choppy sentences — join two with however / although / while for flow." });
  if (m.longSentences > 0 && rank < 3)
    out.push({ tip: `🧩 ${m.longSentences} marathon sentence(s): one idea per sentence at ${target}. Full stop is your friend.` });
  if (m.passiveHits >= 3)
    out.push({ tip: `🙈 ${m.passiveHits} passive spots — try active once: "was done by the team" → "the team did it".`, fix: "Active voice" });
  if (m.fillerHits.length > 0)
    out.push({ tip: `✂️ Fillers spotted (${m.fillerHits.slice(0, 4).join(", ")}) — delete one and the sentence gets stronger.` });
  if (m.repeatedOpener)
    out.push({ tip: `🔁 Every sentence starts with "${m.repeatedOpener}" — open one with However / For example / Meanwhile.` });
  // Goal-aware tone coaching (the differentiation: style + register, not grammar).
  if (goal === "business" && m.tone === "casual")
    out.push({ tip: "💼 Business goal + casual tone clash — swap hey/cool/awesome for hello/great/appreciated." });
  if (goal === "academic" && m.tone !== "formal")
    out.push({ tip: "🎓 Academic writing wants formal connectors: furthermore, nevertheless, consequently." });
  if ((goal === "travel" || goal === "general") && m.tone === "formal" && rank <= 2)
    out.push({ tip: "🧳 Travel chat sounds stiff when formal — short friendly sentences win over moreover/furthermore." });
  if (goal === "exam" && m.sentences > 0 && m.sentences < 5)
    out.push({ tip: "🏆 Exam answers need 3+ paragraphs: position → reason + example → conclusion." });
  if (rank >= 4 && m.tone !== "formal")
    out.push({ tip: "🐉 C1+ polish: one nominalization per paragraph (decide → decision, develop → development)." });
  if (out.length === 0)
    out.push({ tip: "✅ Clean shape — good length, active voice, no fillers. Now chase one stronger verb per sentence." });
  return out.slice(0, 5);
}

/** Qualitative AI prompt: rule findings + level + goal baked in. */
export function buildStyleCoachPrompt(
  text: string,
  level: CEFR | null,
  goal: Goal,
  metric: StyleMetric,
  findings: StyleFinding[],
): string {
  return [
    "You are a friendly English writing coach. Polish my paragraph below.",
    `My level: ${level ?? "B1 (learning)"}. My goal: ${goal}.`,
    `Quick scan: ${metric.words} words, ${metric.sentences} sentences, avg ${metric.avgSentenceLen} words/sentence, tone ${metric.tone}.`,
    `Rule-based notes: ${findings.map((f) => f.tip).join(" ")}`,
    "Reply with: 1) my paragraph rewritten at my level (keep MY ideas), 2) 3 word swaps (mine → stronger), 3) one tone tip for my goal. Under 180 words. Be encouraging!",
    "",
    "--- my paragraph ---",
    text.trim().slice(0, 2000),
  ].join("\n");
}
