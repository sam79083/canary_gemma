// Flashcards (Quizlet-style) + vocabulary builder (Memrise-style input).
//
// Self-contained (no runtime cross-imports) so plain `node --test` covers it.
// Custom cards live in their own localStorage key — the LearnState shape is
// untouched. Three study modes share one card list:
//   flip  — classic front/back drill
//   match — pick the meaning for a term (4 options, deterministic)
//   write — type the term from its meaning (normalized compare)

export interface FlashCard {
  id: string;
  term: string;
  meaning: string;
  /** Optional source, e.g. file name or "idiom:…". Shown as context. */
  source?: string;
  createdAt: string;
}

const FLASH_KEY = "canary-flash-v1";
const MAX_CARDS = 500;

function uid(): string {
  try {
    // @ts-ignore — crypto.randomUUID exists in browsers + node 19+
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    // fall through
  }
  return `c-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function emptyCards(): FlashCard[] {
  return [];
}

export function addCard(cards: FlashCard[], term: string, meaning: string, source?: string): FlashCard[] {
  const t = term.trim().slice(0, 80);
  const m = meaning.trim().slice(0, 160);
  if (!t || !m) return cards;
  const dup = cards.some(
    (c) => c.term.toLowerCase() === t.toLowerCase() && c.meaning.toLowerCase() === m.toLowerCase(),
  );
  if (dup) return cards;
  const next = [
    { id: uid(), term: t, meaning: m, source: source?.slice(0, 80), createdAt: new Date().toISOString() },
    ...cards,
  ];
  return next.slice(0, MAX_CARDS);
}

export function removeCard(cards: FlashCard[], id: string): FlashCard[] {
  return cards.filter((c) => c.id !== id);
}

export function loadCards(): FlashCard[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(FLASH_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (x): x is FlashCard =>
          !!x && typeof x === "object" &&
          typeof (x as FlashCard).term === "string" &&
          typeof (x as FlashCard).meaning === "string" &&
          (x as FlashCard).term.trim() !== "",
      )
      .map((x) => ({
        id: typeof (x as FlashCard).id === "string" ? (x as FlashCard).id : uid(),
        term: (x as FlashCard).term.slice(0, 80),
        meaning: (x as FlashCard).meaning.slice(0, 160),
        source: typeof (x as FlashCard).source === "string" ? (x as FlashCard).source?.slice(0, 80) : undefined,
        createdAt: typeof (x as FlashCard).createdAt === "string" ? (x as FlashCard).createdAt : "",
      }))
      .slice(0, MAX_CARDS);
  } catch {
    return [];
  }
}

export function saveCards(cards: FlashCard[]): void {
  // Quota guard: shrink once (newest 100) and retry. Inline, no imports.
  const put = (list: FlashCard[]): boolean => {
    try {
      if (typeof localStorage === "undefined") return false;
      localStorage.setItem(FLASH_KEY, JSON.stringify(list));
      return true;
    } catch {
      return false;
    }
  };
  const full = cards.slice(0, MAX_CARDS);
  if (!put(full)) put(full.slice(0, 100));
}

// --- vocabulary builder: mine candidate words from pasted/file text --------

const STOP = new Set(
  "a,an,the,and,or,but,if,then,else,for,to,of,in,on,at,by,with,from,as,is,are,was,were,be,been,being,have,has,had,do,does,did,will,would,can,could,should,may,might,must,this,that,these,those,it,its,they,them,their,you,your,we,our,he,she,his,her,i,me,my,not,no,yes,so,very,just,about,into,over,after,before,between,through,also,than,too,only,own,same,such,more,most,other,some,any,each,when,where,which,who,whom,what,how,why,because,while,although,though,however,therefore,thus,hence,per,via".split(","),
);

/** Mine candidate study words from free text: lowercase alpha words ≥5 chars,
 * not stopwords, ordered by frequency then first-seen. Deterministic. */
export function extractWordsFromText(text: string, limit = 12): { word: string; count: number }[] {
  const words = (text.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? [])
    .map((w) => w.replace(/^['-]+|['-]+$/g, ""))
    .filter((w) => w.length >= 5 && !STOP.has(w) && !/--/.test(w));
  const freq = new Map<string, { count: number; first: number }>();
  words.forEach((w, i) => {
    const e = freq.get(w);
    if (e) e.count++;
    else freq.set(w, { count: 1, first: i });
  });
  return [...freq.entries()]
    .map(([word, v]) => ({ word, count: v.count, first: v.first }))
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .slice(0, Math.max(1, Math.min(30, limit)))
    .map(({ word, count }) => ({ word, count }));
}

// --- study modes ------------------------------------------------------------

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

export interface MatchQ {
  cardId: string;
  term: string;
  choices: string[];
  answerIndex: number;
}

/** Deterministic 4-option match round over the card list (seeded shuffle). */
export function buildMatchRound(cards: FlashCard[], seed: string | number = "", n = 6): MatchQ[] {
  if (cards.length === 0) return [];
  const rng = mulberry32(hashStr(`match|${seed}`));
  const order = [...cards];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.slice(0, Math.max(1, Math.min(20, n))).map((c) => {
    const distract = cards.filter((x) => x.id !== c.id).map((x) => x.meaning);
    for (let i = distract.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [distract[i], distract[j]] = [distract[j], distract[i]];
    }
    const opts = [c.meaning, ...distract.slice(0, 3)];
    // shuffle options, track answer
    const idx = [...opts.keys()];
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    const choices = idx.map((k) => opts[k]);
    return { cardId: c.id, term: c.term, choices, answerIndex: choices.indexOf(c.meaning) };
  });
}

export function normalizeMeaning(s: string): string {
  return (s || "").toLowerCase().trim().replace(/[.!?,'"“”‘’]+/g, "").replace(/\s+/g, " ");
}

/** Write mode: type the term (or meaning) — punctuation/case blind. */
export function gradeWrite(input: string, expected: string): boolean {
  const n = normalizeMeaning(input);
  if (!n) return false;
  return normalizeMeaning(expected) === n;
}
