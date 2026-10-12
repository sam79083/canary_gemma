// Listening + shadowing engine (the read/write-only gap).
//
// Three modes over deterministic, zero-token content:
//   dictate-word  — TTS speaks a frequency word, learner types it
//   dictate-sent  — TTS speaks a generated sentence, learner types it
//   comprehend    — TTS speaks a sentence, learner answers a choice question
// Shadowing (repeat-after-me) is scored by wordHitRate() against the mic
// transcript in components/learn/ShadowBox.tsx.
//
// Self-contained (type-only cross-imports) so plain `node --test` covers it.

import type { BankItem, CEFR } from "./learn-bank";

export type ListenMode = "dictate-word" | "dictate-sent" | "comprehend";

export interface ListenItem extends BankItem {
  listenMode: ListenMode;
  /** Exact text the TTS reads aloud. */
  audio: string;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// --- sentence factory: simple S-V-O / S-be-Adj patterns, concrete words ----

const NOUNS = [
  "cat", "dog", "bus", "book", "baby", "rain", "coffee", "phone", "teacher",
  "park", "doctor", "movie", "garden", "bird", "child", "kitchen", "letter",
  "market", "music", "river", "sister", "street", "sun", "train",
];
const ADJS = [
  "big", "happy", "busy", "early", "fast", "clean", "warm", "bright",
  "quiet", "fresh", "kind", "late",
];
const OBJS = [
  "apples", "music", "books", "movies", "coffee", "tea", "rice", "pictures",
  "songs", "letters", "football", "lunch",
];
const PLACES = ["park", "home", "school", "market", "garden", "library"];

function sentenceAt(i: number): string {
  const n = NOUNS[i % NOUNS.length];
  const a = ADJS[(i * 5 + 1) % ADJS.length];
  const o = OBJS[(i * 7 + 2) % OBJS.length];
  const p = PLACES[(i * 3 + 1) % PLACES.length];
  switch (i % 4) {
    case 0:
      return `The ${n} is ${a}.`;
    case 1:
      return `I like ${o}.`;
    case 2:
      return `We meet at the ${p}.`;
    default:
      return `The ${a} ${n} likes ${o}.`;
  }
}

export function listenSentenceCount(): number {
  return NOUNS.length * ADJS.length * 2;
}

export function normHeard(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Dictation grading: exact normalized match (punct/case blind). */
export function gradeHeard(input: string, accept: string[]): boolean {
  const n = normHeard(input);
  if (!n) return false;
  return accept.some((a) => normHeard(a) === n);
}

/** Content words for shadowing/comprehension (skip tiny glue words). */
export function contentWords(sentence: string): string[] {
  return normHeard(sentence).split(" ").filter((w) => w.length > 2);
}

/**
 * Shadowing score: fraction of the sentence's content words present in the
 * mic transcript (0–1). Forgiving by design — accent-proof effort scoring.
 */
export function wordHitRate(sentence: string, transcript: string): number {
  const want = [...new Set(contentWords(sentence))];
  if (want.length === 0) return 0;
  const got = new Set(normHeard(transcript).split(" ").filter(Boolean));
  const hits = want.filter((w) => got.has(w)).length;
  return Math.round((hits / want.length) * 100) / 100;
}

function orderChoices(correct: string, distract: string[], rng: () => number): { choices: string[]; answerIndex: number } {
  const seen = new Set<string>([correct.toLowerCase()]);
  const uniq: string[] = [];
  for (const d of [...distract, "-", "..."]) {
    if (seen.has(d.toLowerCase())) continue;
    seen.add(d.toLowerCase());
    uniq.push(d);
    if (uniq.length === 3) break;
  }
  const all = shuffled([correct, ...uniq], rng);
  return { choices: all.slice(0, 4), answerIndex: all.indexOf(correct) };
}

export function listenWordItem(level: CEFR, words: string[], idx: number, salt: string | number = ""): ListenItem {
  const k = ((idx % words.length) + words.length) % words.length;
  const word = words[k];
  void salt;
  return {
    id: `li-w-${level.toLowerCase()}-${k}`,
    skill: "listening",
    level,
    kind: "fill",
    prompt: "🔊 Listen and type the word:",
    audio: word,
    accept: [word],
    explain: `"${word}" — say it aloud once more.`,
    word: `listen:${word}`,
    listenMode: "dictate-word",
  };
}

export function listenSentenceItem(idx: number, salt: string | number = ""): ListenItem {
  const total = listenSentenceCount();
  const k = ((idx % total) + total) % total;
  void salt;
  const sentence = sentenceAt(Math.floor(k / 2) % (NOUNS.length * ADJS.length));
  return {
    id: `li-s-${k}`,
    skill: "listening",
    level: "A1",
    kind: "fill",
    prompt: "🔊 Listen and type the sentence:",
    audio: sentence,
    accept: [sentence],
    explain: `"${sentence}"`,
    listenMode: "dictate-sent",
  };
}

export function listenComprehensionItem(idx: number, salt: string | number = ""): ListenItem {
  const rng = mulberry32(hashStr(`listen-c|${idx}|${salt}`));
  const s = sentenceAt(idx % (NOUNS.length * ADJS.length));
  // Ask about the adjective: "What is ___?" with noun distractors.
  const adj = contentWords(s).find((w) => (ADJS as string[]).includes(w)) ?? ADJS[0];
  const correctNoun = NOUNS.find((n) => normHeard(s).split(" ").includes(n)) ?? NOUNS[0];
  const distract = shuffled(
    NOUNS.filter((n) => n !== correctNoun),
    rng,
  ).slice(0, 3);
  const { choices, answerIndex } = orderChoices(correctNoun, distract, rng);
  return {
    id: `li-c-${idx}`,
    skill: "listening",
    level: "A2",
    kind: "choice",
    prompt: `🔊 Listen — what is "${adj}"?`,
    audio: s,
    choices,
    answerIndex,
    explain: `"${s}" → ${correctNoun}.`,
    listenMode: "comprehend",
  };
}

export function listenBatch(
  level: CEFR,
  words: string[],
  mode: ListenMode,
  n: number,
  exclude: string[] = [],
  salt: string | number = "",
): ListenItem[] {
  const size = mode === "dictate-word" ? words.length : listenSentenceCount();
  const out: ListenItem[] = [];
  if (size === 0 || n <= 0) return out;
  const rng = mulberry32(hashStr(`listenbatch|${level}|${mode}|${salt}`));
  const order = shuffled(Array.from({ length: size }, (_, i) => i), rng);
  const banned = new Set(exclude);
  const used = new Set<string>();
  const make = (k: number): ListenItem =>
    mode === "dictate-word"
      ? listenWordItem(level, words, k, salt)
      : mode === "dictate-sent"
        ? listenSentenceItem(k, salt)
        : listenComprehensionItem(k, salt);
  for (const k of order) {
    if (out.length >= n) break;
    const item = make(k);
    if (banned.has(item.id) || used.has(item.id)) continue;
    used.add(item.id);
    out.push(item);
  }
  if (out.length < n) {
    for (const k of order) {
      if (out.length >= n) break;
      const item = make(k);
      if (used.has(item.id)) continue;
      used.add(item.id);
      out.push(item);
    }
  }
  return out;
}
