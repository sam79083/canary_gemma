// Daily visit streak (localStorage only — no server involved).
// Consecutive UTC-midnight-crossings... no: local calendar days.
// Same day -> keep, yesterday -> +1, otherwise -> reset to 1.

const KEY = "canary-streak";

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
  const today = dayStr(now);
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const obj = JSON.parse(raw) as { last?: string; count?: number };
      const last = typeof obj.last === "string" ? parseDay(obj.last) : null;
      const count = typeof obj.count === "number" && obj.count > 0 ? Math.floor(obj.count) : 1;
      if (obj.last === today) return count;
      if (last) {
        const diffDays = Math.round(
          (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
            new Date(last.getFullYear(), last.getMonth(), last.getDate()).getTime()) /
            86400000,
        );
        const next = diffDays === 1 ? count + 1 : 1;
        localStorage.setItem(KEY, JSON.stringify({ last: today, count: next }));
        return next;
      }
    }
    localStorage.setItem(KEY, JSON.stringify({ last: today, count: 1 }));
    return 1;
  } catch {
    return 1;
  }
}
