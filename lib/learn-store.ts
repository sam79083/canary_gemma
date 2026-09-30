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

export function loadLearn(): LearnState {
  try {
    if (typeof localStorage === "undefined") return emptyState();
    const raw = localStorage.getItem(LEARN_KEY);
    if (!raw) return emptyState();
    const p = JSON.parse(raw) as Partial<LearnState>;
    const base = emptyState();
    return {
      version: 1,
      level:
        p.level === "A1" || p.level === "A2" || p.level === "B1" || p.level === "B2"
          ? p.level
          : null,
      xp: typeof p.xp === "number" && p.xp >= 0 ? Math.floor(p.xp) : 0,
      lessons: typeof p.lessons === "number" && p.lessons >= 0 ? Math.floor(p.lessons) : 0,
      skills: {
        vocab: {
          asked: Math.max(0, Math.floor(p.skills?.vocab?.asked ?? 0)),
          correct: Math.max(0, Math.floor(p.skills?.vocab?.correct ?? 0)),
        },
        grammar: {
          asked: Math.max(0, Math.floor(p.skills?.grammar?.asked ?? 0)),
          correct: Math.max(0, Math.floor(p.skills?.grammar?.correct ?? 0)),
        },
      },
      days: p.days && typeof p.days === "object" ? p.days : base.days,
      cards: p.cards && typeof p.cards === "object" ? p.cards : base.cards,
    };
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
