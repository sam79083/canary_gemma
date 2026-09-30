// Learning progress store — localStorage-first (free-tier safe).
//
// Guests AND members share the same local core: level, XP, per-skill stats,
// per-day aggregates, and SRS card states. Members may later sync the tiny
// `days` aggregate to Supabase (1 row/user/day); nothing here requires it,
// so Render/Supabase free tiers stay at ~zero extra cost.
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
  /** Multiplier applied on pass. Starts 2.5, -0.2 on fail, min 1.3. */
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

/** Apply one review. pass=true → interval grows; false → reset to 1 day. */
export function reviewCard(prev: CardState, pass: boolean, today: string): CardState {
  if (pass) {
    const interval =
      prev.passes === 0 ? 1 : prev.passes === 1 ? 6 : Math.max(1, Math.round(prev.interval * prev.ease));
    return {
      ease: prev.ease,
      interval,
      due: addDays(today, interval),
      fails: prev.fails,
      passes: prev.passes + 1,
    };
  }
  return {
    ease: Math.max(1.3, Math.round((prev.ease - 0.2) * 100) / 100),
    interval: 1,
    due: addDays(today, 1),
    fails: prev.fails + 1,
    passes: prev.passes,
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
    },
    days: {},
    cards: {},
  };
}

export interface AnswerResult {
  item: BankItem;
  correct: boolean;
}

/**
 * Record one finished session (placement, lesson, or review). Returns a NEW
 * state (no mutation): +10 XP per correct, +2 per attempt, per-skill + per-day
 * aggregates, and SRS card updates for vocab items.
 */
export function recordAnswers(
  prev: LearnState,
  results: AnswerResult[],
  day: string,
): LearnState {
  const next: LearnState = {
    version: 1,
    level: prev.level,
    xp: prev.xp,
    lessons: prev.lessons + (results.length > 0 ? 1 : 0),
    skills: {
      vocab: { ...prev.skills.vocab },
      grammar: { ...prev.skills.grammar },
      reading: { ...prev.skills.reading },
      writing: { ...prev.skills.writing },
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
      next.cards[r.item.word] = reviewCard(before, r.correct, day);
    }
  }
  next.xp += gained;
  const d = next.days[day] ?? { day, xp: 0, lessons: 0, correct: 0, asked: 0 };
  d.xp += gained;
  d.lessons += results.length > 0 ? 1 : 0;
  d.correct += correct;
  d.asked += results.length;
  next.days[day] = d;
  return next;
}

export function setLevel(prev: LearnState, level: CEFR): LearnState {
  if (prev.level === level) return prev;
  return { ...prev, level };
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

/** Word ids due for review today (only tracked cards). */
export function dueWords(state: LearnState, today: string): string[] {
  return Object.keys(state.cards)
    .filter((w) => state.cards[w].due <= today)
    .sort();
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
        ease: typeof cc.ease === "number" ? Math.min(2.5, Math.max(1.3, cc.ease)) : 2.5,
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
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(LEARN_KEY, JSON.stringify(state));
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

/**
 * Pick the winning state. Remote wins when local is empty (new device) or
 * when the server copy is strictly newer than our last local save.
 * Otherwise local wins (offline-first). Never throws.
 */
export function chooseState(
  local: LearnState,
  localSavedAt: number,
  remote: RemoteLearn | null,
): { state: LearnState; from: "local" | "remote" } {
  if (!remote) return { state: local, from: "local" };
  if (isEmptyState(local)) return { state: remote.state, from: "remote" };
  const remoteTs = Date.parse(remote.updated_at);
  if (Number.isFinite(remoteTs) && remoteTs > localSavedAt) {
    return { state: remote.state, from: "remote" };
  }
  return { state: local, from: "local" };
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

/** PUT /api/learn-state — false for visitors, errors, or oversized blobs. */
export async function pushRemote(state: LearnState): Promise<boolean> {
  try {
    const res = await fetch("/api/learn-state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
