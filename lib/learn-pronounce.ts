// Pronunciation track — minimal-pair drills tuned for Korean speakers.
//
// Pure data + scoring so plain `node --test` covers it. The UI (PronounceBox)
// adds TTS playback, MediaRecorder playback and Web-Speech scoring on top.

import type { CEFR } from "./learn-bank";

export interface MinimalPair {
  id: string;
  a: string;
  b: string;
  ipaA: string;
  ipaB: string;
  koA: string;
  koB: string;
  /** One-line coaching tip in Korean. */
  tip: string;
  sentenceA: string;
  sentenceB: string;
  level: CEFR;
}

// Ordered easiest → hardest. All pairs are single-word contrasts that change
// meaning (true minimal pairs), not just spelling.
export const MINIMAL_PAIRS: MinimalPair[] = [
  {
    id: "ship-sheep",
    a: "ship",
    b: "sheep",
    ipaA: "/ʃɪp/",
    ipaB: "/ʃiːp/",
    koA: "배",
    koB: "양",
    tip: "ship은 짧게 '쉽', sheep은 길게 '쉬이프'. 모음 길이가 뜻을 바꿔요.",
    sentenceA: "The ship left the port at dawn.",
    sentenceB: "The sheep ate grass on the hill.",
    level: "A1",
  },
  {
    id: "cat-cut",
    a: "cat",
    b: "cut",
    ipaA: "/kæt/",
    ipaB: "/kʌt/",
    koA: "고양이",
    koB: "자르다",
    tip: "cat은 입을 옆으로 넓게 '캐', cut은 짧고 가운데로 '커'.",
    sentenceA: "The cat slept on the sofa.",
    sentenceB: "Please cut the cake in half.",
    level: "A1",
  },
  {
    id: "pen-pan",
    a: "pen",
    b: "pan",
    ipaA: "/pen/",
    ipaB: "/pæn/",
    koA: "펜",
    koB: "프라이팬",
    tip: "pen은 '펜', pan은 입을 크게 벌려 '팬'.",
    sentenceA: "Can I borrow your pen?",
    sentenceB: "Heat the oil in the pan.",
    level: "A1",
  },
  {
    id: "fan-pan",
    a: "fan",
    b: "pan",
    ipaA: "/fæn/",
    ipaB: "/pæn/",
    koA: "선풍기·팬",
    koB: "프라이팬",
    tip: "f는 윗니로 아랫입술을 살짝 물고 바람을 내보내요. p는 두 입술을 터뜨려요.",
    sentenceA: "Turn on the fan — it's hot.",
    sentenceB: "The pan is still hot.",
    level: "A1",
  },
  {
    id: "walk-work",
    a: "walk",
    b: "work",
    ipaA: "/wɔːk/",
    ipaB: "/wɜːrk/",
    koA: "걷다",
    koB: "일하다",
    tip: "walk는 '워크', work는 혀를 말아 '월크'에 가깝게. r 소리를 꼭 넣으세요.",
    sentenceA: "I walk to the station every day.",
    sentenceB: "I work from home on Fridays.",
    level: "A1",
  },
  {
    id: "bit-beat",
    a: "bit",
    b: "beat",
    ipaA: "/bɪt/",
    ipaB: "/biːt/",
    koA: "조금",
    koB: "두드리다",
    tip: "bit은 짧게 '비트', beat은 길게 '비이트'. 길이만 다르게 연습하세요.",
    sentenceA: "I'm a bit tired today.",
    sentenceB: "Beat the eggs with a fork.",
    level: "A2",
  },
  {
    id: "bed-bad",
    a: "bed",
    b: "bad",
    ipaA: "/bed/",
    ipaB: "/bæd/",
    koA: "침대",
    koB: "나쁜",
    tip: "bed는 '베드', bad는 입을 더 크게 벌려 '배드'.",
    sentenceA: "The bed is by the window.",
    sentenceB: "That was a bad idea.",
    level: "A2",
  },
  {
    id: "thin-sin",
    a: "thin",
    b: "sin",
    ipaA: "/θɪn/",
    ipaB: "/sɪn/",
    koA: "얇은",
    koB: "죄",
    tip: "thin은 혀끝을 윗니·아랫니 사이에 두고 바람을 내보내요. sin은 'ㅅ'.",
    sentenceA: "The ice on the lake is thin.",
    sentenceB: "He confessed his sin.",
    level: "A2",
  },
  {
    id: "right-light",
    a: "right",
    b: "light",
    ipaA: "/raɪt/",
    ipaB: "/laɪt/",
    koA: "오른쪽·맞는",
    koB: "빛",
    tip: "right는 혀를 뒤로 말아 r, light는 혀끝을 윗잇몸에 붙여 l.",
    sentenceA: "Turn right at the corner.",
    sentenceB: "Please turn on the light.",
    level: "A2",
  },
  {
    id: "very-berry",
    a: "very",
    b: "berry",
    ipaA: "/ˈveri/",
    ipaB: "/ˈberi/",
    koA: "매우",
    koB: "베리",
    tip: "very는 윗니로 아랫입술을 물고 v (성대 울림), berry는 두 입술을 붙여 b.",
    sentenceA: "This soup is very hot.",
    sentenceB: "She picked a red berry.",
    level: "A2",
  },
  {
    id: "cheap-jeep",
    a: "cheap",
    b: "jeep",
    ipaA: "/tʃiːp/",
    ipaB: "/dʒiːp/",
    koA: "싼",
    koB: "지프차",
    tip: "cheap은 'ㅊ'처럼 숨을 내보내며, jeep은 'ㅈ'처럼 성대를 울려요.",
    sentenceA: "The tickets were cheap.",
    sentenceB: "They drove a jeep up the hill.",
    level: "A2",
  },
  {
    id: "think-sink",
    a: "think",
    b: "sink",
    ipaA: "/θɪŋk/",
    ipaB: "/sɪŋk/",
    koA: "생각하다",
    koB: "싱크대·가라앉다",
    tip: "think는 혀를 이 사이에 (th), sink는 'ㅅ'. '씽크'가 아니라 '띵크'에 가깝게 숨을.",
    sentenceA: "I think it will rain.",
    sentenceB: "The dishes are in the sink.",
    level: "B1",
  },
  {
    id: "three-tree",
    a: "three",
    b: "tree",
    ipaA: "/θriː/",
    ipaB: "/triː/",
    koA: "셋",
    koB: "나무",
    tip: "three는 혀를 이 사이에 두고 시작, tree는 혀끝을 윗잇몸에 붙여 t.",
    sentenceA: "I have three sisters.",
    sentenceB: "A tall tree shades the yard.",
    level: "B1",
  },
  {
    id: "vest-west",
    a: "vest",
    b: "west",
    ipaA: "/vest/",
    ipaB: "/west/",
    koA: "조끼",
    koB: "서쪽",
    tip: "vest는 v (윗니+아랫입술, 성대 울림), west는 w (입술을 둥글게).",
    sentenceA: "He wore a vest under his jacket.",
    sentenceB: "The sun sets in the west.",
    level: "B1",
  },
  {
    id: "coat-caught",
    a: "coat",
    b: "caught",
    ipaA: "/koʊt/",
    ipaB: "/kɔːt/",
    koA: "코트",
    koB: "잡았다",
    tip: "coat은 입술을 둥글게 '코우트', caught는 입을 더 크게 벌려 '코트'.",
    sentenceA: "Wear your coat — it's cold.",
    sentenceB: "The cat caught a mouse.",
    level: "B1",
  },
  {
    id: "mouse-mouth",
    a: "mouse",
    b: "mouth",
    ipaA: "/maʊs/",
    ipaB: "/maʊθ/",
    koA: "쥐",
    koB: "입",
    tip: "mouse는 끝이 s, mouth는 혀끝을 이 사이에 두고 th.",
    sentenceA: "The mouse ran under the desk.",
    sentenceB: "Open your mouth and say ah.",
    level: "B1",
  },
  {
    id: "clown-crown",
    a: "clown",
    b: "crown",
    ipaA: "/klaʊn/",
    ipaB: "/kraʊn/",
    koA: "광대",
    koB: "왕관",
    tip: "clown은 혀끝을 윗잇몸에 대는 l, crown은 혀를 말아 r.",
    sentenceA: "The clown made the children laugh.",
    sentenceB: "The queen wore a gold crown.",
    level: "B1",
  },
  {
    id: "rock-lock",
    a: "rock",
    b: "lock",
    ipaA: "/rɒk/",
    ipaB: "/lɒk/",
    koA: "바위·록",
    koB: "자물쇠",
    tip: "rock은 혀를 말아 r, lock은 혀끝을 윗잇몸에 붙여 l.",
    sentenceA: "They sat on a rock by the sea.",
    sentenceB: "Did you lock the door?",
    level: "A2",
  },
];

export type PairChoice = "a" | "b";

export interface PronounceResult {
  /** 1 = heard the target, 0.5 = heard something else, 0 = said the other word. */
  score: 0 | 0.5 | 1;
  heard: string;
  heardWord: string;
  confusedWith: string | null;
}

export function normalizeSpeech(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** STT is word-level only, so this checks the word — not phonemes. Honest by design. */
export function scoreMinimalPair(
  pair: MinimalPair,
  transcript: string,
  target: PairChoice,
): PronounceResult {
  const want = (target === "a" ? pair.a : pair.b).toLowerCase();
  const other = (target === "a" ? pair.b : pair.a).toLowerCase();
  const heard = normalizeSpeech(transcript);
  const words = heard.split(" ").filter(Boolean);
  if (words.includes(want)) {
    return { score: 1, heard: transcript.trim(), heardWord: want, confusedWith: null };
  }
  if (words.includes(other)) {
    return { score: 0, heard: transcript.trim(), heardWord: other, confusedWith: other };
  }
  return {
    score: 0.5,
    heard: transcript.trim(),
    heardWord: words[0] ?? "",
    confusedWith: null,
  };
}

function levelRank(level: CEFR | null | undefined): number {
  const order: CEFR[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
  const i = order.indexOf(level ?? "A1");
  return i < 0 ? 0 : i;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic pick from the learner's level band (never more than one above). */
export function pickPair(
  seed: string | number,
  level: CEFR | null,
  excludeId?: string,
): MinimalPair {
  const max = levelRank(level) + 1;
  const pool = MINIMAL_PAIRS.filter((p) => levelRank(p.level) <= max && p.id !== excludeId);
  if (pool.length === 0) return MINIMAL_PAIRS[0];
  return pool[hash(String(seed)) % pool.length];
}

export interface PairStat {
  ok: number;
  total: number;
}

export type PronounceStats = Record<string, PairStat>;

/** Add one attempt; correct only when STT heard the target word. Pure. */
export function recordAttempt(
  stats: PronounceStats,
  pairId: string,
  score: number,
): PronounceStats {
  const prev = stats[pairId] ?? { ok: 0, total: 0 };
  return {
    ...stats,
    [pairId]: {
      ok: prev.ok + (score >= 1 ? 1 : 0),
      total: prev.total + 1,
    },
  };
}

export function pairAccuracy(stat: PairStat | undefined): number {
  if (!stat || stat.total <= 0) return 0;
  return Math.round((stat.ok / stat.total) * 100);
}

/** Defensive parse for localStorage (drops unknown ids / corrupt numbers). */
export function sanitizePronounceStats(raw: unknown): PronounceStats {
  const out: PronounceStats = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const ids = new Set(MINIMAL_PAIRS.map((p) => p.id));
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!ids.has(id) || !v || typeof v !== "object") continue;
    const ok = Number((v as { ok?: unknown }).ok);
    const total = Number((v as { total?: unknown }).total);
    if (!Number.isFinite(ok) || !Number.isFinite(total) || total <= 0) continue;
    const t = Math.min(9999, Math.floor(total));
    out[id] = { ok: Math.max(0, Math.min(t, Math.floor(ok))), total: t };
  }
  return out;
}

const STATS_KEY = "canary-pronounce-v1";

export function loadPronounceStats(): PronounceStats {
  try {
    if (typeof localStorage === "undefined") return {};
    return sanitizePronounceStats(JSON.parse(localStorage.getItem(STATS_KEY) ?? "null"));
  } catch {
    return {};
  }
}

export function savePronounceStats(stats: PronounceStats): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    }
  } catch {
    // best-effort
  }
}
