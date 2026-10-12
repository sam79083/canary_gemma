// Adaptive difficulty — the level that moves with you.
//
// A rolling last-20 answer buffer (own localStorage key; LearnState is
// untouched) drives one honest suggestion: consistently ≥85% → try a level
// up; ≤45% → drop a band for comfort. Never auto-changes anything — the
// learner taps once in the Me tab. Pure + storage-guarded for node --test.

import type { CEFR } from "./learn-bank";

const KEY = "canary-learn-recent";
const CAP = 20;

export function pushRecent(results: boolean[]): void {
  if (results.length === 0) return;
  try {
    if (typeof localStorage === "undefined") return;
    let prev: boolean[] = [];
    try {
      const raw = localStorage.getItem(KEY);
      const arr = raw ? (JSON.parse(raw) as unknown) : [];
      if (Array.isArray(arr)) prev = arr.filter((x): x is boolean => typeof x === "boolean");
    } catch {
      prev = [];
    }
    localStorage.setItem(KEY, JSON.stringify([...prev, ...results].slice(-CAP)));
  } catch {
    // best-effort
  }
}

export function recentStats(): { n: number; acc: number } {
  try {
    if (typeof localStorage === "undefined") return { n: 0, acc: 0 };
    const raw = localStorage.getItem(KEY);
    if (!raw) return { n: 0, acc: 0 };
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return { n: 0, acc: 0 };
    const list = arr.filter((x): x is boolean => typeof x === "boolean").slice(-CAP);
    if (list.length === 0) return { n: 0, acc: 0 };
    return { n: list.length, acc: list.filter(Boolean).length / list.length };
  } catch {
    return { n: 0, acc: 0 };
  }
}

const ORDER: CEFR[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

/** "up" (offer next level), "down" (offer comfort band), or null (steady). */
export function suggestShift(level: CEFR | null, n: number, acc: number): "up" | "down" | null {
  if (n < 10) return null; // not enough evidence
  const rank = level ? ORDER.indexOf(level) : 0;
  if (acc >= 0.85 && rank < ORDER.length - 1) return "up";
  if (acc <= 0.45 && rank > 0) return "down";
  return null;
}

export function neighborLevel(level: CEFR | null, dir: "up" | "down"): CEFR {
  const rank = level ? ORDER.indexOf(level) : 0;
  const next = Math.min(ORDER.length - 1, Math.max(0, rank + (dir === "up" ? 1 : -1)));
  return ORDER[next];
}
