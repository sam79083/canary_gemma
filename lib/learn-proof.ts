// Proof sheet — one honest, shareable snapshot of what the learner has done.
//
// Built from local stats (no AI): level, XP, lessons, streak, per-skill
// accuracy, pronunciation drills and portfolio pieces. The disclaimer is
// explicit that this is a self-study summary, not an official certificate, so
// it can be shown to a tutor/employer without overpromising.

import type { CEFR, Skill } from "./learn-bank";
import type { LearnState } from "./learn-store";
import { portfolioKindLabel, type PortfolioEntry } from "./learn-portfolio.ts";
import type { PronounceStats } from "./learn-pronounce.ts";

const SKILL_LABEL: Record<Skill, string> = {
  vocab: "Vocabulary",
  grammar: "Grammar",
  reading: "Reading",
  writing: "Writing",
  listening: "Listening",
};

const SKILL_ORDER: Skill[] = ["vocab", "grammar", "reading", "writing", "listening"];

function pct(correct: number, asked: number): number {
  return asked > 0 ? Math.round((correct / asked) * 100) : 0;
}

function isDay(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + delta * 86_400_000).toISOString().slice(0, 10);
}

/** Current + best run of consecutive `days` keys (ISO dates). Pure. */
export function streakFromDays(days: Record<string, unknown>, today: string): { current: number; best: number } {
  if (!isDay(today)) return { current: 0, best: 0 };
  const keys = Object.keys(days).filter(isDay).sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of keys) {
    run = prev && shiftDay(prev, 1) === day ? run + 1 : 1;
    if (run > best) best = run;
    prev = day;
  }
  let current = 0;
  const has = new Set(keys);
  let cursor = has.has(today) ? today : shiftDay(today, -1);
  while (has.has(cursor)) {
    current += 1;
    cursor = shiftDay(cursor, -1);
  }
  return { current, best };
}

export interface ProofSkill {
  skill: Skill;
  label: string;
  asked: number;
  correct: number;
  accuracy: number;
}

export interface ProofPiece {
  kind: string;
  label: string;
  title: string;
  at: string;
}

export interface ProofEvidence {
  date: string;
  level: CEFR | null;
  xp: number;
  lessons: number;
  streak: number;
  bestStreak: number;
  totalAsked: number;
  totalCorrect: number;
  accuracy: number;
  skills: ProofSkill[];
  pieces: Record<string, number>;
  pieceTotal: number;
  recent: ProofPiece[];
  pronounce: { pairs: number; attempts: number; correct: number; accuracy: number };
}

export function buildProofEvidence(
  state: LearnState,
  folio: PortfolioEntry[],
  pronounce: PronounceStats,
  today: string,
): ProofEvidence {
  const skills: ProofSkill[] = SKILL_ORDER.map((skill) => {
    const s = state.skills[skill] ?? { asked: 0, correct: 0 };
    return {
      skill,
      label: SKILL_LABEL[skill],
      asked: s.asked,
      correct: s.correct,
      accuracy: pct(s.correct, s.asked),
    };
  });
  const totalAsked = skills.reduce((a, s) => a + s.asked, 0);
  const totalCorrect = skills.reduce((a, s) => a + s.correct, 0);
  const pieces: Record<string, number> = {};
  for (const e of folio) pieces[e.kind] = (pieces[e.kind] ?? 0) + 1;
  let attempts = 0;
  let correct = 0;
  let pronouncePairs = 0;
  for (const v of Object.values(pronounce)) {
    if (!v || v.total <= 0) continue;
    pronouncePairs += 1;
    attempts += v.total;
    correct += Math.min(v.ok, v.total);
  }
  const { current, best } = streakFromDays(state.days, today);
  return {
    date: today,
    level: state.level,
    xp: state.xp,
    lessons: state.lessons,
    streak: current,
    bestStreak: best,
    totalAsked,
    totalCorrect,
    accuracy: pct(totalCorrect, totalAsked),
    skills,
    pieces,
    pieceTotal: folio.length,
    recent: folio.slice(0, 6).map((e) => ({
      kind: e.kind,
      label: portfolioKindLabel(e.kind),
      title: e.title,
      at: e.at.slice(0, 10),
    })),
    pronounce: {
      pairs: pronouncePairs,
      attempts,
      correct,
      accuracy: pct(correct, attempts),
    },
  };
}

/** Markdown proof sheet — copy, download, send to a tutor or interviewer. */
export function exportProofSheet(e: ProofEvidence): string {
  const level = e.level ? `CEFR ${e.level} (self-placed)` : "not placed yet";
  const practice = [
    `- Level: **${level}**`,
    `- XP: **${e.xp.toLocaleString("en-US")}** · Lessons: **${e.lessons}**`,
    `- Streak: **${e.streak} day${e.streak === 1 ? "" : "s"}** current · best **${e.bestStreak}**`,
  ];
  if (e.totalAsked > 0) {
    practice.push(
      `- Quiz accuracy: **${e.accuracy}%** over **${e.totalAsked.toLocaleString("en-US")}** answers`,
    );
  }
  const skillLines = e.skills
    .filter((s) => s.asked > 0)
    .map((s) => `  - ${s.label}: ${s.accuracy}% (${s.correct}/${s.asked})`);
  const pron =
    e.pronounce.attempts > 0
      ? `- Pronunciation: **${e.pronounce.accuracy}%** word-level accuracy over ${e.pronounce.attempts} attempts (${e.pronounce.pairs} minimal pair${e.pronounce.pairs === 1 ? "" : "s"})`
      : null;
  const kinds = Object.entries(e.pieces)
    .sort((a, b) => b[1] - a[1])
    .map(([kind, n]) => `${portfolioKindLabel(kind)} ×${n}`)
    .join(" · ");
  const recent = e.recent.length
    ? e.recent.map((p) => `- ${p.label} — _${p.title}_ (${p.at})`).join("\n")
    : "_No saved pieces yet._";

  return [
    "# 🎓 English Proof Sheet",
    ``,
    `Generated: ${e.date} · Canary self-study snapshot`,
    ``,
    `> This summarizes practice done inside Canary on this device. It is **not** an official certificate — ask the learner to write or speak on the spot to verify.`,
    ``,
    `## Level & practice`,
    ``,
    ...practice,
    ...(skillLines.length ? [``, `## Skill profile`, ``, ...skillLines] : []),
    ...(pron ? [``, `## Speaking`, ``, pron] : []),
    ``,
    `## Portfolio (${e.pieceTotal} piece${e.pieceTotal === 1 ? "" : "s"})`,
    ``,
    ...(kinds ? [`${kinds}`, ``] : []),
    recent,
    ``,
    `---`,
    ``,
    `_Built from local practice stats at canary — no account required._`,
    ``,
  ].join("\n");
}
