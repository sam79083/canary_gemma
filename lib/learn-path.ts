// Personalized learning paths (differentiation: goals shape the lesson).
//
// A path is a tiny profile stored under its own key — LearnState is
// untouched. It biases (never restricts): quiz composition, idiom picks,
// and coaching prompts lean toward the goal's register and skills.

import type { CEFR } from "./learn-bank";
import type { Goal } from "./learn-feedback";

export interface PathDef {
  id: Goal;
  name: string;
  ko: string;
  blurb: string;
  /** Skills to weight up in lessons. */
  skills: string[];
  /** Prefer this register in idiom picks. */
  register: "work-safe" | "neutral" | "casual" | "any";
  /** Extra prompt line for AI coaching. */
  coachLine: string;
}

export const PATHS: PathDef[] = [
  {
    id: "general", name: "Everyday", ko: "일상 회화", blurb: "Chat, travel, daily life.",
    skills: ["vocab", "grammar"], register: "any",
    coachLine: "Keep examples everyday and friendly.",
  },
  {
    id: "business", name: "Business", ko: "비즈니스", blurb: "Meetings, emails, interviews.",
    skills: ["vocab", "writing"], register: "work-safe",
    coachLine: "Prefer formal, work-safe phrasing; flag anything too casual for email.",
  },
  {
    id: "academic", name: "Academic", ko: "학술", blurb: "Lectures, papers, IELTS/TOEFL writing.",
    skills: ["reading", "writing"], register: "any",
    coachLine: "Prefer precise academic vocabulary and formal connectors.",
  },
  {
    id: "travel", name: "Travel", ko: "여행", blurb: "Airports, hotels, small talk.",
    skills: ["vocab", "reading"], register: "neutral",
    coachLine: "Keep it short, friendly, and practical for travel situations.",
  },
  {
    id: "exam", name: "Exam", ko: "시험", blurb: "TOEIC / TOEFL / IELTS drills.",
    skills: ["reading", "grammar"], register: "any",
    coachLine: "Be strict like an examiner; point out the exact tested pattern.",
  },
];

const PATH_KEY = "canary-learn-path-v1";

export function pathById(id: string | null | undefined): PathDef {
  return PATHS.find((p) => p.id === id) ?? PATHS[0];
}

export function loadPath(): Goal {
  try {
    if (typeof localStorage === "undefined") return "general";
    const raw = localStorage.getItem(PATH_KEY);
    if (raw && (PATHS as PathDef[]).some((p) => p.id === raw)) return raw as Goal;
    return "general";
  } catch {
    return "general";
  }
}

export function savePath(id: Goal): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(PATH_KEY, id);
  } catch {
    // best-effort
  }
}

/** Reorder idioms for a goal: preferred register first (stable, no RNG). */
export function orderIdiomsForPath<T extends { register: string }>(items: T[], goal: Goal): T[] {
  const pref = pathById(goal).register;
  if (pref === "any") return items;
  return [...items].sort((a, b) => (b.register === pref ? 1 : 0) - (a.register === pref ? 1 : 0));
}

/** Weekly target per goal (XP) — Duolingo-style gentle pressure. */
export function weeklyTarget(goal: Goal): number {
  switch (goal) {
    case "exam": return 300;
    case "business": return 250;
    case "academic": return 250;
    case "travel": return 150;
    default: return 200;
  }
}

export type { CEFR };
