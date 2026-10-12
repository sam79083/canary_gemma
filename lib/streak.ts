// Daily visit streak (localStorage only — no server involved).
// Consecutive UTC-midnight-crossings... no: local calendar days.
// Same day -> keep, yesterday -> +1, otherwise -> reset to 1.
//
// Streak freeze (Duolingo-style forgiveness): one token per calendar month,
// auto-spent when exactly ONE day is missed (yesterday-but-one -> today).
// touchStreak() keeps its legacy behavior; touchStreakWithFreeze() is the
// forgiving entry point used by the app shell.

const KEY = "canary-streak";
const FREEZE_KEY = "canary-streak-freeze";

function dayStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function parseDay(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Record today's visit; returns the current streak count. */
export function touchStreak(now = new Date()): number {
  return touchStreakWithFreeze(now).count;
}

function monthStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Freezes left this calendar month (1 per month, resets monthly). */
export function freezeLeft(now = new Date()): number {
  try {
    if (typeof localStorage === "undefined") return 1;
    const raw = localStorage.getItem(FREEZE_KEY);
    if (!raw) return 1;
    const obj = JSON.parse(raw) as { month?: string; used?: boolean };
    if (obj.month !== monthStr(now)) return 1;
    return obj.used ? 0 : 1;
  } catch {
    return 1;
  }
}

/**
 * Forgiving visit recorder. Returns { count, froze }: froze is true only
 * when exactly one day was missed and the monthly freeze covered it.
 * Pure date math + guarded storage — safe under node --test with a stub.
 */
export function touchStreakWithFreeze(now = new Date()): { count: number; froze: boolean } {
  const today = dayStr(now);
  const finish = (count: number, froze: boolean): { count: number; froze: boolean } => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ last: today, count }));
    } catch {
      // ignore
    }
    return { count, froze };
  };
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (raw) {
      const obj = JSON.parse(raw) as { last?: string; count?: number };
      const last = typeof obj.last === "string" ? parseDay(obj.last) : null;
      const count = typeof obj.count === "number" && obj.count > 0 ? Math.floor(obj.count) : 1;
      if (obj.last === today) return { count, froze: false };
      if (last) {
        const diffDays = Math.round(
          (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
            new Date(last.getFullYear(), last.getMonth(), last.getDate()).getTime()) /
            86400000,
        );
        if (diffDays === 1) return finish(count + 1, false);
        if (diffDays === 2 && typeof localStorage !== "undefined") {
          // One missed day: spend the monthly freeze if available.
          const m = monthStr(now);
          let used = false;
          try {
            const fraw = localStorage.getItem(FREEZE_KEY);
            const fobj = fraw ? (JSON.parse(fraw) as { month?: string; used?: boolean }) : null;
            used = !!fobj && fobj.month === m && !!fobj.used;
            if (!used) localStorage.setItem(FREEZE_KEY, JSON.stringify({ month: m, used: true }));
          } catch {
            used = true; // storage broken: don't pretend a freeze was spent
          }
          if (!used) return finish(count + 1, true);
        }
        return finish(1, false);
      }
    }
    return finish(1, false);
  } catch {
    return { count: 1, froze: false };
  }
}
