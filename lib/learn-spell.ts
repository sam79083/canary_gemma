// Spelling questions from bare frequency word lists — English-only volume
// for levels where no EN definitions exist yet (no Korean needed: the task
// is "tap the correct spelling", pure English orthography).
//
// Self-contained (type-only cross-imports) so plain `node --test` covers it.
// Words are passed in by the caller (lib/words-bulk.ts via the panel), so
// this module never imports sibling values. IDs are salt-independent
// (`sp-<level>-<index>`) for learn-seen dedup; misspellings are seeded by
// (level, index, salt) so options reshuffle per session.

import type { BankItem, CEFR } from "./learn-bank";

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

/** Plausible misspellings: dropped/doubled/swapped interior letters + a
 * vowel swap. All preserve first/last letters (how learners actually err). */
export function misspellings(word: string, rng: () => number): string[] {
  const w = word.toLowerCase();
  const out: string[] = [];
  const push = (s: string) => {
    if (s !== w && s.length >= 2 && !out.includes(s)) out.push(s);
  };
  if (w.length >= 3) {
    // drop one interior letter
    const drop = 1 + Math.floor(rng() * (w.length - 2));
    push(w.slice(0, drop) + w.slice(drop + 1));
    // swap two adjacent interior letters
    const k = 1 + Math.floor(rng() * (w.length - 3 + 1));
    const arr = w.split("");
    [arr[k], arr[k + 1]] = [arr[k + 1], arr[k]];
    push(arr.join(""));
    // double a single interior letter
    const d = 1 + Math.floor(rng() * (w.length - 2));
    push(w.slice(0, d) + w[d] + w.slice(d));
    // vowel swap
    const vowels = "aeiou";
    const vi = [...w].findIndex((c, idx) => idx > 0 && idx < w.length - 1 && vowels.includes(c));
    if (vi >= 0) {
      const alt = vowels[(vowels.indexOf(w[vi]) + 1 + Math.floor(rng() * 4)) % vowels.length];
      push(w.slice(0, vi) + alt + w.slice(vi + 1));
    }
    // drop a doubled letter (accommodate -> acommodate)
    const dbl = w.match(/(.)\1/);
    if (dbl && dbl.index !== undefined && dbl.index > 0) push(w.slice(0, dbl.index) + w.slice(dbl.index + 1));
  } else {
    push(w + "e");
    push(w.split("").reverse().join(""));
    push(w + w[w.length - 1]);
  }
  return out;
}

function orderChoices(correct: string, distract: string[], rng: () => number): { choices: string[]; answerIndex: number } {
  const seen = new Set<string>([correct]);
  const uniq: string[] = [];
  for (const d of [...distract, "-", "..."]) {
    if (seen.has(d)) continue;
    seen.add(d);
    uniq.push(d);
    if (uniq.length === 3) break;
  }
  const all = shuffled([correct, ...uniq], rng);
  return { choices: all.slice(0, 4), answerIndex: all.indexOf(correct) };
}

export function spellPoolSize(words: string[]): number {
  return words.length;
}

export function spellItem(level: CEFR, words: string[], idx: number, salt: string | number = ""): BankItem {
  const size = words.length;
  const k = ((idx % size) + size) % size;
  const word = words[k];
  const rng = mulberry32(hashStr(`spell|${level}|${k}|${salt}`));
  const { choices, answerIndex } = orderChoices(word, shuffled(misspellings(word, rng), rng), rng);
  return {
    id: `sp-${level.toLowerCase()}-${k}`,
    skill: "vocab",
    level,
    kind: "choice",
    prompt: "Tap the correct spelling:",
    choices,
    answerIndex,
    explain: `"${word}" — say it aloud, then write it once.`,
    word: `spell:${word}`,
  };
}

export function spellBatch(
  level: CEFR,
  words: string[],
  n: number,
  exclude: string[] = [],
  salt: string | number = "",
): BankItem[] {
  const size = words.length;
  const out: BankItem[] = [];
  if (size === 0 || n <= 0) return out;
  const rng = mulberry32(hashStr(`spellbatch|${level}|${salt}`));
  const order = shuffled(Array.from({ length: size }, (_, i) => i), rng);
  const banned = new Set(exclude);
  const used = new Set<string>();
  for (const k of order) {
    if (out.length >= n) break;
    const item = spellItem(level, words, k, salt);
    if (banned.has(item.id) || used.has(item.id)) continue;
    used.add(item.id);
    out.push(item);
  }
  if (out.length < n) {
    for (const k of order) {
      if (out.length >= n) break;
      const item = spellItem(level, words, k, salt);
      if (used.has(item.id)) continue;
      used.add(item.id);
      out.push(item);
    }
  }
  return out;
}
