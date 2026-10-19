// Learning progress store — localStorage-first (free-tier safe).
//
// Guests AND members share the same local core: level, XP, per-skill stats,
// per-day aggregates, and SRS card states. Members sync the full state to
// Supabase (one small JSONB row/member) with an additive merge so two
// devices never lose each other's work (see mergeLearnState).
//
// Pure reducers (emptyState/recordAnswers/...) are runtime-free and covered
// by test/learn.test.mts. Only loadLearn/saveLearn touch localStorage.

import type { BankItem, CEFR, Skill } from "./learn-bank";

// --- SRS core (simplified SM-2), kept here so this module has no runtime
// cross-imports: extensionless lib-to-lib value imports resolve in the Next
// bundler but NOT under plain `node --test`, so anything covered by tests
// must be self-contained (repo precedent: only type-only cross-imports).
// lib/learn-srs.ts re-exports these for UI convenience.
export interface CardState {
  /** SM-2 easiness factor. Starts 2.5, moves ±per grade, clamped [1.3, 3.0]. */
  ease: number;
  /** Days until next review. */
  interval: number;
  /** Next due day YYYY-MM-DD. */
  due: string;
  fails: number;
  passes: number;
}

export function dayStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(base: string, n: number): string {
  const m = base.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date();
  d.setDate(d.getDate() + n);
  return dayStr(d);
}

export function initCard(today: string): CardState {
  return { ease: 2.5, interval: 1, due: today, fails: 0, passes: 0 };
}

/** Self-rated SRS grades: 0 again, 1 hard, 2 good, 3 easy (SM-2 q 2–5). */
export type CardGrade = 0 | 1 | 2 | 3;

const SRS_MAX_INTERVAL = 365; // days — past this, a word is effectively known
const SRS_EASE_MAX = 3.0;

/**
 * Apply one review SM-2 style. Accepts a boolean for legacy callers
 * (true = good, false = again) or an explicit CardGrade from the Review
 * tab's self-rating. EF follows the SM-2 formula; a lapse resets the
 * repetition count (passes = 0) so re-learning restarts at 1 day.
 */
export function reviewCard(prev: CardState, grade: boolean | CardGrade, today: string): CardState {
  const g: CardGrade = grade === true ? 2 : grade === false ? 0 : grade;
  const q = g + 2; // 2, 3, 4, 5
  const ease = Math.min(
    SRS_EASE_MAX,
    Math.max(1.3, Math.round((prev.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))) * 100) / 100),
  );
  if (g === 0) {
    return {
      ease,
      interval: 1,
      due: addDays(today, 1),
      fails: prev.fails + 1,
      passes: 0,
    };
  }
  const interval =
    prev.passes === 0
      ? 1
      : prev.passes === 1
        ? 6
        : Math.min(SRS_MAX_INTERVAL, Math.max(1, Math.round(prev.interval * ease)));
  return {
    ease,
    interval,
    due: addDays(today, interval),
    fails: prev.fails,
    passes: prev.passes + 1,
  };
}

export function isDue(card: CardState, today: string): boolean {
  return card.due <= today;
}

/** Words failed 3+ times — the "keep forgetting" list. */
export function isLeech(card: CardState): boolean {
  return card.fails >= 3;
}

export interface SkillStat {
  asked: number;
  correct: number;
}

export interface DayEntry {
  day: string;
  xp: number;
  lessons: number;
  correct: number;
  asked: number;
}

export interface LearnState {
  version: 1;
  level: CEFR | null;
  xp: number;
  lessons: number;
  skills: Record<Skill, SkillStat>;
  days: Record<string, DayEntry>;
  cards: Record<string, CardState>;
}

export const LEARN_KEY = "canary-learn-v1";
export const XP_CORRECT = 10;
export const XP_TRY = 2;

export function emptyState(): LearnState {
  return {
    version: 1,
    level: null,
    xp: 0,
    lessons: 0,
    skills: {
      vocab: { asked: 0, correct: 0 },
      grammar: { asked: 0, correct: 0 },
      reading: { asked: 0, correct: 0 },
      writing: { asked: 0, correct: 0 },
      listening: { asked: 0, correct: 0 },
    },
    days: {},
    cards: {},
  };
}

export interface AnswerResult {
  item: BankItem;
  correct: boolean;
  /** Optional self-rating for SRS cards (Review tab). Defaults to
   *  good (2) on correct, again (0) on wrong. */
  grade?: CardGrade;
}

/**
 * Record finished answers. Returns a NEW state (no mutation): +10 XP per
 * correct, +2 per attempt, per-skill + per-day aggregates, and SRS card
 * updates for vocab items.
 *
 * `lesson: false` records the answers without incrementing the lesson
 * counter — used by per-item commits (one listening question, one idiom
 * try) so "lessons" counts sessions, not taps. Callers that batch a whole
 * session (quiz Done, review, placement, essay) keep the default.
 * `addLesson` counts a session completed outside recordAnswers (a full
 * listening round).
 */
export function recordAnswers(
  prev: LearnState,
  results: AnswerResult[],
  day: string,
  opts?: { lesson?: boolean },
): LearnState {
  const countsLesson = (opts?.lesson ?? true) && results.length > 0;
  const next: LearnState = {
    version: 1,
    level: prev.level,
    xp: prev.xp,
    lessons: prev.lessons + (countsLesson ? 1 : 0),
    skills: {
      vocab: { ...prev.skills.vocab },
      grammar: { ...prev.skills.grammar },
      reading: { ...prev.skills.reading },
      writing: { ...prev.skills.writing },
      listening: { ...prev.skills.listening },
    },
    days: { ...prev.days },
    cards: { ...prev.cards },
  };
  let gained = 0;
  let correct = 0;
  for (const r of results) {
    gained += r.correct ? XP_CORRECT : XP_TRY;
    if (r.correct) correct++;
    const s = next.skills[r.item.skill];
    s.asked += 1;
    if (r.correct) s.correct += 1;
    if (r.item.word) {
      const before = next.cards[r.item.word] ?? initCard(day);
      const grade: CardGrade = r.grade ?? (r.correct ? 2 : 0);
      next.cards[r.item.word] = reviewCard(before, grade, day);
    }
  }
  next.xp += gained;
  const d = next.days[day] ?? { day, xp: 0, lessons: 0, correct: 0, asked: 0 };
  d.xp += gained;
  d.lessons += countsLesson ? 1 : 0;
  d.correct += correct;
  d.asked += results.length;
  next.days[day] = d;
  return next;
}

/** Count one completed session (e.g. a finished listening round) without
 *  touching XP or skills. Pure. */
export function addLesson(prev: LearnState, day: string): LearnState {
  const days = { ...prev.days };
  const d = days[day] ?? { day, xp: 0, lessons: 0, correct: 0, asked: 0 };
  days[day] = { ...d, lessons: d.lessons + 1 };
  return { ...prev, days, lessons: prev.lessons + 1 };
}

/** Bonus-XP gate keys paid once per calendar day, nested day → key. */
export type BonusGates = Record<string, Record<string, 1>>;

/**
 * Anti-farming rule for repeatable bonus XP: each key pays once per day.
 * Pure and additive — other days are preserved; callers persist `next`
 * (typically in localStorage) and award XP only when `fresh`. Keeps XP a
 * learning signal instead of a tap counter.
 */
export function gateBonusOnce(
  gates: BonusGates,
  day: string,
  key: string,
): { fresh: boolean; next: BonusGates } {
  const today = gates[day] ?? {};
  if (today[key]) return { fresh: false, next: gates };
  return { fresh: true, next: { ...gates, [day]: { ...today, [key]: 1 } } };
}

export function setLevel(prev: LearnState, level: CEFR): LearnState {
  if (prev.level === level) return prev;
  return { ...prev, level };
}

/**
 * Bonus XP outside quizzes (Duolingo-style builder rewards: creating a file,
 * saving a flashcard set, exporting the portfolio). Pure — same day
 * aggregation as recordAnswers, no lesson counted, no skill inflated.
 */
export function awardXP(prev: LearnState, n: number, day: string): LearnState {
  const gain = Math.max(0, Math.min(50, Math.floor(n)));
  if (gain === 0) return prev;
  const days = { ...prev.days };
  const d = days[day] ?? { day, xp: 0, lessons: 0, correct: 0, asked: 0 };
  days[day] = { ...d, xp: d.xp + gain };
  return { ...prev, xp: prev.xp + gain, days };
}

export function accuracy(stat: SkillStat): number {
  return stat.asked === 0 ? 0 : stat.correct / stat.asked;
}

/** Lowest-accuracy skill with >= 5 attempts — the "what to improve" hint. */
export function weakestSkill(state: LearnState): Skill | null {
  const entries = (Object.keys(state.skills) as Skill[])
    .map((k) => ({ k, ...state.skills[k] }))
    .filter((s) => s.asked >= 5);
  if (entries.length === 0) return null;
  entries.sort((a, b) => accuracy(a) - accuracy(b));
  return entries[0].k;
}

/** Last 7 days (oldest → newest) for the progress chart. */
export function weekSeries(state: LearnState, today: string): DayEntry[] {
  const out: DayEntry[] = [];
  for (let i = 6; i >= 0; i--) {
    // walk back from today; addDays handles month boundaries
    const day = addDays(today, -i);
    out.push(state.days[day] ?? { day, xp: 0, lessons: 0, correct: 0, asked: 0 });
  }
  return out;
}

/** Word ids due for review today (only tracked cards), most overdue first. */
export function dueWords(state: LearnState, today: string): string[] {
  return Object.keys(state.cards)
    .filter((w) => state.cards[w].due <= today)
    .sort((a, b) => {
      const da = state.cards[a].due;
      const db = state.cards[b].due;
      if (da !== db) return da < db ? -1 : 1;
      return a < b ? -1 : a > b ? 1 : 0;
    });
}

/** Word ids failed 3+ times — "vocabs you keep forgetting". */
export function leechWords(state: LearnState): string[] {
  return Object.keys(state.cards)
    .filter((w) => state.cards[w].fails >= 3)
    .sort((a, b) => state.cards[b].fails - state.cards[a].fails);
}

// --- localStorage wrappers (client only; silent no-op on server) -------------

/** Validate/coerce unknown data (localStorage, server) into a LearnState. */
export function sanitizeLearnState(p: Partial<LearnState>): LearnState {
  const base = emptyState();
  const cleanCards: Record<string, CardState> = {};
  if (p.cards && typeof p.cards === "object") {
    for (const [w, c] of Object.entries(p.cards)) {
      if (typeof w !== "string" || !w || typeof c !== "object" || !c) continue;
      const cc = c as Partial<CardState>;
      if (typeof cc.due !== "string") continue;
      cleanCards[w.slice(0, 60)] = {
        ease: typeof cc.ease === "number" ? Math.min(3.0, Math.max(1.3, cc.ease)) : 2.5,
        interval: typeof cc.interval === "number" ? Math.min(3650, Math.max(1, Math.floor(cc.interval))) : 1,
        due: cc.due.slice(0, 10),
        fails: typeof cc.fails === "number" ? Math.min(1000, Math.max(0, Math.floor(cc.fails))) : 0,
        passes: typeof cc.passes === "number" ? Math.min(1000, Math.max(0, Math.floor(cc.passes))) : 0,
      };
      if (Object.keys(cleanCards).length >= 5000) break;
    }
  }
  const cleanDays: Record<string, DayEntry> = {};
  if (p.days && typeof p.days === "object") {
    for (const [d, e] of Object.entries(p.days)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || typeof e !== "object" || !e) continue;
      const ee = e as Partial<DayEntry>;
      cleanDays[d] = {
        day: d,
        xp: num(ee.xp),
        lessons: num(ee.lessons),
        correct: num(ee.correct),
        asked: num(ee.asked),
      };
      if (Object.keys(cleanDays).length >= 370) break;
    }
  }
  return {
    version: 1,
    level:
      p.level === "A1" ||
      p.level === "A2" ||
      p.level === "B1" ||
      p.level === "B2" ||
      p.level === "C1" ||
      p.level === "C2"
        ? p.level
        : null,
    xp: num(p.xp),
    lessons: num(p.lessons),
    skills: {
      vocab: {
        asked: num(p.skills?.vocab?.asked),
        correct: num(p.skills?.vocab?.correct),
      },
      grammar: {
        asked: num(p.skills?.grammar?.asked),
        correct: num(p.skills?.grammar?.correct),
      },
      reading: {
        asked: num(p.skills?.reading?.asked),
        correct: num(p.skills?.reading?.correct),
      },
      writing: {
        asked: num(p.skills?.writing?.asked),
        correct: num(p.skills?.writing?.correct),
      },
      // Added later than the other four: old saves simply start at 0.
      listening: {
        asked: num(p.skills?.listening?.asked),
        correct: num(p.skills?.listening?.correct),
      },
    },
    days: cleanDays,
    cards: cleanCards,
  };
}

function num(v: unknown): number {
  return typeof v === "number" && v >= 0 && Number.isFinite(v) ? Math.floor(v) : 0;
}

export function loadLearn(): LearnState {
  try {
    if (typeof localStorage === "undefined") return emptyState();
    const raw = localStorage.getItem(LEARN_KEY);
    if (!raw) return emptyState();
    return sanitizeLearnState(JSON.parse(raw) as Partial<LearnState>);
  } catch {
    return emptyState();
  }
}

export function saveLearn(state: LearnState): void {
  // Quota guard: on failure, retry once slimmed (last 90 days, 2000 cards).
  // Inline (no cross-imports) so plain node --test resolves this file.
  const put = (s: LearnState): boolean => {
    try {
      if (typeof localStorage === "undefined") return false;
      localStorage.setItem(LEARN_KEY, JSON.stringify(s));
      return true;
    } catch {
      return false;
    }
  };
  if (put(state)) return;
  try {
    const dayKeys = Object.keys(state.days).sort().slice(-90);
    const slimDays: Record<string, DayEntry> = {};
    for (const k of dayKeys) slimDays[k] = state.days[k];
    const cardKeys = Object.keys(state.cards).slice(-2000);
    const slimCards: Record<string, CardState> = {};
    for (const k of cardKeys) slimCards[k] = state.cards[k];
    put({ ...state, days: slimDays, cards: slimCards });
  } catch {
    // storage full/blocked — progress keeps working in memory this session
  }
}

// --- per-user cloud save (members only; guests stay local) -------------------
// One small JSONB row per member via /api/learn-state. Guests never call
// these. Free-tier safe: a handful of requests per day, ~KBs per member.

export interface RemoteLearn {
  state: LearnState;
  updated_at: string;
}

const META_KEY = "canary-learn-meta";

/** True when no learning has happened yet (fresh install / new account). */
export function isEmptyState(s: LearnState): boolean {
  return s.level === null && s.xp === 0 && s.lessons === 0;
}

const CEFR_RANK: Record<CEFR, number> = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5 };

/** Keep the card with more lifetime reviews; tie → the later due date.
 *  `fails` merges as max so leech status is never forgotten. */
function mergeCard(a: CardState, b: CardState): CardState {
  const ra = a.passes + a.fails;
  const rb = b.passes + b.fails;
  const win = ra !== rb ? (ra > rb ? a : b) : a.due >= b.due ? a : b;
  return { ...win, fails: Math.max(a.fails, b.fails) };
}

/**
 * Additive, lossless merge of local and remote progress (member sync).
 * Days and skill counters merge component-wise with max() — never
 * double-counts a shared history, never drops a device's session. Cards
 * keep the more-reviewed state per word. Totals are raised to at least the
 * merged day sums so XP/lessons never go backwards. Pure — covered by
 * test/learn.test.mts.
 */
export function mergeLearnState(local: LearnState, remote: LearnState): LearnState {
  const days: Record<string, DayEntry> = { ...local.days };
  for (const [k, e] of Object.entries(remote.days)) {
    const prev = days[k];
    days[k] = prev
      ? {
          day: k,
          xp: Math.max(prev.xp, e.xp),
          lessons: Math.max(prev.lessons, e.lessons),
          correct: Math.max(prev.correct, e.correct),
          asked: Math.max(prev.asked, e.asked),
        }
      : { ...e, day: k };
  }
  const cards: Record<string, CardState> = { ...local.cards };
  for (const [k, c] of Object.entries(remote.cards)) {
    const prev = cards[k];
    if (!prev) {
      cards[k] = c;
      continue;
    }
    cards[k] = mergeCard(prev, c);
  }
  let sumXp = 0;
  let sumLessons = 0;
  for (const e of Object.values(days)) {
    sumXp += e.xp;
    sumLessons += e.lessons;
  }
  const level =
    local.level && remote.level
      ? CEFR_RANK[local.level] >= CEFR_RANK[remote.level]
        ? local.level
        : remote.level
      : local.level ?? remote.level;
  return sanitizeLearnState({
    version: 1,
    level,
    xp: Math.max(local.xp, remote.xp, sumXp),
    lessons: Math.max(local.lessons, remote.lessons, sumLessons),
    skills: {
      vocab: {
        asked: Math.max(local.skills.vocab.asked, remote.skills.vocab.asked),
        correct: Math.max(local.skills.vocab.correct, remote.skills.vocab.correct),
      },
      grammar: {
        asked: Math.max(local.skills.grammar.asked, remote.skills.grammar.asked),
        correct: Math.max(local.skills.grammar.correct, remote.skills.grammar.correct),
      },
      reading: {
        asked: Math.max(local.skills.reading.asked, remote.skills.reading.asked),
        correct: Math.max(local.skills.reading.correct, remote.skills.reading.correct),
      },
      writing: {
        asked: Math.max(local.skills.writing.asked, remote.skills.writing.asked),
        correct: Math.max(local.skills.writing.correct, remote.skills.writing.correct),
      },
      listening: {
        asked: Math.max(local.skills.listening.asked, remote.skills.listening.asked),
        correct: Math.max(local.skills.listening.correct, remote.skills.listening.correct),
      },
    },
    days,
    cards,
  });
}

/** Cloud-size fallback: keep the soonest-due 2,000 cards (leeches first),
 *  the last 120 days, and merge totals back in so the slimmer blob is still
 *  self-consistent. Used when the server rejects an oversized push. */
export function slimStateForCloud(state: LearnState): LearnState {
  const keys = Object.keys(state.cards);
  const leeches = keys.filter((w) => state.cards[w].fails >= 3);
  const rest = keys
    .filter((w) => state.cards[w].fails < 3)
    .sort((a, b) => (state.cards[a].due < state.cards[b].due ? -1 : 1));
  const keep = [...leeches, ...rest].slice(0, 2000);
  const cards: Record<string, CardState> = {};
  for (const w of keep) cards[w] = state.cards[w];
  const dayKeys = Object.keys(state.days).sort().slice(-120);
  const days: Record<string, DayEntry> = {};
  for (const k of dayKeys) days[k] = state.days[k];
  return { ...state, cards, days };
}

/** Last local save timestamp (ms). 0 = never saved on this device. */
export function loadMetaSavedAt(): number {
  try {
    if (typeof localStorage === "undefined") return 0;
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return 0;
    const v = (JSON.parse(raw) as { savedAt?: unknown }).savedAt;
    return typeof v === "number" && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

export function saveMetaSavedAt(ts: number): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(META_KEY, JSON.stringify({ savedAt: ts }));
  } catch {
    // best-effort
  }
}

/** GET /api/learn-state — null for visitors, errors, or no saved row. */
export async function fetchRemote(): Promise<RemoteLearn | null> {
  try {
    const res = await fetch("/api/learn-state", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { state?: unknown; updated_at?: unknown };
    if (!data.state || typeof data.state !== "object") return null;
    return {
      state: sanitizeLearnState(data.state as Partial<LearnState>),
      updated_at: typeof data.updated_at === "string" ? data.updated_at : "",
    };
  } catch {
    return null;
  }
}

const putState = async (state: LearnState): Promise<Response> =>
  fetch("/api/learn-state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
  });

/** PUT /api/learn-state — false for visitors or errors. On 413 (blob over
 *  the free-tier cap) retries once with a slimmed copy so heavy users still
 *  get cloud backup. */
export async function pushRemote(state: LearnState): Promise<boolean> {
  try {
    const res = await putState(state);
    if (res.ok) return true;
    if (res.status === 413) {
      const retry = await putState(slimStateForCloud(state));
      return retry.ok;
    }
    return false;
  } catch {
    return false;
  }
}
