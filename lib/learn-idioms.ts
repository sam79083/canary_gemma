// Idioms, expressions & slang for B1+ learners — the "level-up prizes".
//
// Self-contained (no runtime cross-imports) so plain `node --test` covers it.
// Slang carries a register + caution: learners must know WHERE a word lives,
// not just what it means. Nothing here needs AI, tokens, or a server.

import type { CEFR } from "./learn-bank";

export type IdiomKind = "idiom" | "expression" | "slang";
export type Register = "work-safe" | "neutral" | "casual";

export interface Idiom {
  id: string;
  kind: IdiomKind;
  /** Minimum learner level that unlocks this item. */
  unlock: CEFR;
  term: string;
  meaning: string;
  ko: string;
  example: string;
  register: Register;
  /** e.g. "friends only — never in email to your boss". */
  caution?: string;
  /** Fun teaching nugget shown after a successful try. */
  note?: string;
  /** Normalized keywords the learner's try-it sentence must contain. */
  keywords: string[];
}

function rank(l: CEFR): number {
  return l === "A1" ? 0 : l === "A2" ? 1 : l === "B1" ? 2 : 3;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const IDIOMS: Idiom[] = [
  // ---- B1: everyday idioms & expressions (prize for reaching Intermediate)
  { id: "i-b1-01", kind: "idiom", unlock: "B1", term: "break the ice", meaning: "to start a friendly conversation", ko: "어색함을 깨고 말을 트다", example: "He told a joke to break the ice.", register: "neutral", keywords: ["break", "ice"] },
  { id: "i-b1-02", kind: "idiom", unlock: "B1", term: "a piece of cake", meaning: "very easy", ko: "식은 죽 먹기", example: "The test was a piece of cake.", register: "neutral", keywords: ["piece", "cake"] },
  { id: "i-b1-03", kind: "idiom", unlock: "B1", term: "under the weather", meaning: "feeling slightly sick", ko: "몸이 좀 안 좋다", example: "I'm feeling a bit under the weather today.", register: "neutral", keywords: ["under", "weather"] },
  { id: "i-b1-04", kind: "idiom", unlock: "B1", term: "cost an arm and a leg", meaning: "very expensive", ko: "눈물 나게 비싸다", example: "That apartment costs an arm and a leg.", register: "neutral", keywords: ["cost", "arm", "leg"] },
  { id: "i-b1-05", kind: "idiom", unlock: "B1", term: "once in a blue moon", meaning: "very rarely", ko: "가뭄에 콩 나듯", example: "We eat out once in a blue moon.", register: "neutral", keywords: ["blue", "moon"] },
  { id: "i-b1-06", kind: "expression", unlock: "B1", term: "the ball is in your court", meaning: "it's your turn to act now", ko: "이제 네가 할 차례다", example: "I've sent the offer — the ball is in your court.", register: "work-safe", keywords: ["ball", "court"] },
  { id: "i-b1-07", kind: "idiom", unlock: "B1", term: "beat around the bush", meaning: "avoid saying something directly", ko: "빙빙 돌려 말하다", example: "Stop beating around the bush and tell me!", register: "neutral", keywords: ["beat", "bush"] },
  { id: "i-b1-08", kind: "expression", unlock: "B1", term: "on the same page", meaning: "in agreement, sharing understanding", ko: "의견이 일치하다", example: "Let's meet so we're on the same page.", register: "work-safe", keywords: ["same", "page"] },
  { id: "i-b1-09", kind: "idiom", unlock: "B1", term: "hit the books", meaning: "study hard", ko: "열공하다", example: "Exams next week — time to hit the books.", register: "neutral", keywords: ["hit", "books"] },
  { id: "i-b1-10", kind: "idiom", unlock: "B1", term: "blow off steam", meaning: "release stress or energy", ko: "스트레스를 풀다", example: "I play football to blow off steam.", register: "casual", caution: "Casual — fine with friends, not in formal writing.", keywords: ["blow", "steam"] },
  { id: "i-b1-11", kind: "idiom", unlock: "B1", term: "pull yourself together", meaning: "calm down and act normally", ko: "정신 차리다", example: "Come on, pull yourself together!", register: "neutral", keywords: ["pull", "together"] },
  { id: "i-b1-12", kind: "idiom", unlock: "B1", term: "by the skin of your teeth", meaning: "only just barely succeed", ko: "간신히, 턱걸이로", example: "I passed by the skin of my teeth.", register: "neutral", note: "Natives swap your → my/his: 'by the skin of MY teeth'.", keywords: ["skin", "teeth"] },
  // ---- B2: real-world slang (prize for Upper-intermediate)
  { id: "s-b2-01", kind: "slang", unlock: "B2", term: "no cap", meaning: "no lie — for real", ko: "뻥 안 치고, 진짜로", example: "That movie was amazing, no cap.", register: "casual", caution: "Friends & texting only — never at work.", keywords: ["cap"] },
  { id: "s-b2-02", kind: "slang", unlock: "B2", term: "sus", meaning: "suspicious, shady", ko: "수상쩍은", example: "That deal sounds sus.", register: "casual", caution: "Casual speech/texting — not for email.", keywords: ["sus"] },
  { id: "s-b2-03", kind: "slang", unlock: "B2", term: "ghost (verb)", meaning: "suddenly cut off contact", ko: "잠수 타다", example: "He ghosted me after two dates.", register: "casual", caution: "Dating/friend context — and don't DO it. 😅", keywords: ["ghost"] },
  { id: "s-b2-04", kind: "slang", unlock: "B2", term: "lowkey", meaning: "quietly, secretly, a little", ko: "남몰래, 살짝", example: "I'm lowkey nervous about tomorrow.", register: "casual", caution: "Casual only — opposite: highkey.", note: "Opposite: HIGHKEY = openly, very.", keywords: ["lowkey"] },
  { id: "s-b2-05", kind: "slang", unlock: "B2", term: "spill the tea", meaning: "share gossip", ko: "썰을 풀다", example: "Come on, spill the tea!", register: "casual", caution: "Playful gossip context only.", keywords: ["spill", "tea"] },
  { id: "s-b2-06", kind: "slang", unlock: "B2", term: "touch grass", meaning: "go outside, log off for a while", ko: "밖에 나가서 바람 쐬다", example: "You've gamed all day — go touch grass.", register: "casual", caution: "Joking tone — can sting if aimed at someone.", keywords: ["touch", "grass"] },
  { id: "s-b2-07", kind: "slang", unlock: "B2", term: "hits different", meaning: "feels special in this moment", ko: "유독 다르게 느껴지다", example: "Coffee on a rainy day hits different.", register: "casual", note: "'Hits' with a singular vibe — ungrammatical on purpose. That's the joke natives love.", keywords: ["hits", "different"] },
  { id: "s-b2-08", kind: "slang", unlock: "B2", term: "vibe check", meaning: "assessing the mood of a place/moment", ko: "분위기 파악", example: "This meeting needs a vibe check.", register: "casual", caution: "Casual — but sneaking into startup offices. 😄", keywords: ["vibe", "check"] },
];

/** Items a learner at `level` (null = A1) has unlocked. */
export function unlockedFor(items: Idiom[], level: CEFR | null): Idiom[] {
  const r = rank(level ?? "A1");
  return items.filter((i) => rank(i.unlock) <= r);
}

/** Next locked band for teaser display ("Reach B1 to unlock 🎁"). */
export function nextLocked(items: Idiom[], level: CEFR | null): Idiom[] {
  const r = rank(level ?? "A1");
  const locked = items.filter((i) => rank(i.unlock) > r);
  if (locked.length === 0) return [];
  const min = Math.min(...locked.map((i) => rank(i.unlock)));
  return locked.filter((i) => rank(i.unlock) === min);
}

/** Deterministic pick-of-the-day from a pool (same pick all day). */
export function pickOfDay(dateStr: string, pool: Idiom[]): Idiom | null {
  if (pool.length === 0) return null;
  return pool[hashStr(`idiom|${dateStr}`) % pool.length];
}

/** Try-it checker: sentence must contain every keyword (order-free). */
export function tryCheck(input: string, keywords: string[]): boolean {
  const words = new Set(normalize(input).split(" ").filter(Boolean));
  if (words.size === 0) return false;
  return keywords.every((k) => words.has(normalize(k)));
}
