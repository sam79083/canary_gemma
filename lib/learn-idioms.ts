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
  return (["A1", "A2", "B1", "B2", "C1", "C2"] as CEFR[]).indexOf(l);
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
  { id: "i-b1-13", kind: "idiom", unlock: "B1", term: "spill the beans", meaning: "reveal a secret", ko: "비밀을 누설하다", example: "Who spilled the beans about the party?", register: "neutral", note: "Cousin of 'spill the tea' — beans is the older one.", keywords: ["spill", "beans"] },
  { id: "i-b1-14", kind: "idiom", unlock: "B1", term: "hit the sack", meaning: "go to bed", ko: "잠자리에 들다", example: "I'm beat. Time to hit the sack.", register: "casual", caution: "Casual — fine with friends, not in formal writing.", keywords: ["hit", "sack"] },
  { id: "i-b1-15", kind: "idiom", unlock: "B1", term: "miss the boat", meaning: "miss an opportunity", ko: "기회를 놓치다", example: "Apply now or you'll miss the boat.", register: "neutral", keywords: ["miss", "boat"] },
  { id: "i-b1-16", kind: "expression", unlock: "B1", term: "speak of the devil", meaning: "said when someone arrives just as you talk about them", ko: "호랑이도 제 말 하면 온다", example: "Speak of the devil — we were just talking about you!", register: "neutral", keywords: ["speak", "devil"] },
  // ---- B2: real-world slang (prize for Upper-intermediate)
  { id: "s-b2-01", kind: "slang", unlock: "B2", term: "no cap", meaning: "no lie — for real", ko: "뻥 안 치고, 진짜로", example: "That movie was amazing, no cap.", register: "casual", caution: "Friends & texting only — never at work.", keywords: ["cap"] },
  { id: "s-b2-02", kind: "slang", unlock: "B2", term: "sus", meaning: "suspicious, shady", ko: "수상쩍은", example: "That deal sounds sus.", register: "casual", caution: "Casual speech/texting — not for email.", keywords: ["sus"] },
  { id: "s-b2-03", kind: "slang", unlock: "B2", term: "ghost (verb)", meaning: "suddenly cut off contact", ko: "잠수 타다", example: "He ghosted me after two dates.", register: "casual", caution: "Dating/friend context — and don't DO it. 😅", keywords: ["ghost"] },
  { id: "s-b2-04", kind: "slang", unlock: "B2", term: "lowkey", meaning: "quietly, secretly, a little", ko: "남몰래, 살짝", example: "I'm lowkey nervous about tomorrow.", register: "casual", caution: "Casual only — opposite: highkey.", note: "Opposite: HIGHKEY = openly, very.", keywords: ["lowkey"] },
  { id: "s-b2-05", kind: "slang", unlock: "B2", term: "spill the tea", meaning: "share gossip", ko: "썰을 풀다", example: "Come on, spill the tea!", register: "casual", caution: "Playful gossip context only.", keywords: ["spill", "tea"] },
  { id: "s-b2-06", kind: "slang", unlock: "B2", term: "touch grass", meaning: "go outside, log off for a while", ko: "밖에 나가서 바람 쐬다", example: "You've gamed all day — go touch grass.", register: "casual", caution: "Joking tone — can sting if aimed at someone.", keywords: ["touch", "grass"] },
  { id: "s-b2-07", kind: "slang", unlock: "B2", term: "hits different", meaning: "feels special in this moment", ko: "유독 다르게 느껴지다", example: "Coffee on a rainy day hits different.", register: "casual", note: "'Hits' with a singular vibe — ungrammatical on purpose. That's the joke natives love.", keywords: ["hits", "different"] },
  { id: "s-b2-08", kind: "slang", unlock: "B2", term: "vibe check", meaning: "assessing the mood of a place/moment", ko: "분위기 파악", example: "This meeting needs a vibe check.", register: "casual", caution: "Casual — but sneaking into startup offices. 😄", keywords: ["vibe", "check"] },
  { id: "s-b2-09", kind: "slang", unlock: "B2", term: "rent-free", meaning: "stuck in someone's head", ko: "머릿속에 계속 맴돎", example: "That song is living rent-free in my head.", register: "casual", caution: "Texting/friends — never formal.", keywords: ["rent", "free"] },
  { id: "s-b2-10", kind: "slang", unlock: "B2", term: "delulu", meaning: "delusional, but playfully", ko: "망상 (장난스럽게)", example: "Thinking he'll text back? That's delulu.", register: "casual", caution: "Playful only — it can genuinely offend.", keywords: ["delulu"] },
  { id: "s-b2-11", kind: "slang", unlock: "B2", term: "based", meaning: "confidently being yourself", ko: "소신 있는", example: "Saying no to overtime? Based.", register: "casual", caution: "Internet praise — your boss won't get it.", keywords: ["based"] },
  { id: "s-b2-12", kind: "slang", unlock: "B2", term: "mid", meaning: "mediocre, underwhelming", ko: "별로인", example: "The movie was mid, honestly.", register: "casual", caution: "Dismissive — never say it to the creator!", keywords: ["mid"] },
  // ---- C1: advanced idioms (prize for Advanced)
  { id: "i-c1-01", kind: "idiom", unlock: "C1", term: "cut to the chase", meaning: "get directly to the point", ko: "본론으로 들어가다", example: "Let's cut to the chase — what's the price?", register: "work-safe", keywords: ["cut", "chase"] },
  { id: "i-c1-02", kind: "idiom", unlock: "C1", term: "bite the bullet", meaning: "face something unpleasant bravely", ko: "과감히 감수하다", example: "I bit the bullet and called the dentist.", register: "neutral", keywords: ["bite", "bullet"] },
  { id: "i-c1-03", kind: "idiom", unlock: "C1", term: "the elephant in the room", meaning: "an obvious problem nobody mentions", ko: "모두가 외면하는 명백한 문제", example: "The budget cuts were the elephant in the room.", register: "neutral", note: "Always THE room — never 'a room'.", keywords: ["elephant", "room"] },
  { id: "i-c1-04", kind: "idiom", unlock: "C1", term: "burn the midnight oil", meaning: "work or study late into the night", ko: "밤샘 작업하다", example: "She burned the midnight oil before the deadline.", register: "neutral", keywords: ["burn", "midnight", "oil"] },
  { id: "i-c1-05", kind: "idiom", unlock: "C1", term: "add insult to injury", meaning: "make a bad situation worse", ko: "엎친 데 덮친 격", example: "Rain added insult to injury on our camping trip.", register: "neutral", keywords: ["insult", "injury"] },
  { id: "i-c1-06", kind: "idiom", unlock: "C1", term: "jump on the bandwagon", meaning: "join something because it's popular", ko: "유행에 편승하다", example: "Every brand jumped on the AI bandwagon.", register: "neutral", keywords: ["jump", "bandwagon"] },
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
