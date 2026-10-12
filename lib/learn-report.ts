// Weekly report card — plain-data in, shareable text out.
//
// The panel computes the numbers (learn-store stays the single source of
// truth); this module only words them. No imports at all: no store shape,
// no test-runner resolution issues, nothing to mock.

export interface WeekNumbers {
  weekXp: number;
  target: number;
  lessons: number;
  asked: number;
  correct: number;
  level: string | null;
  weakest: string | null;
  streak: number;
}

export function buildWeeklyReport(w: WeekNumbers): string {
  const acc = w.asked > 0 ? Math.round((w.correct / w.asked) * 100) : 0;
  const lines = [
    `🦜 My English week — Level ${w.level ?? "—"}`,
    `⚡ ${w.weekXp}/${w.target} XP · 🔥 ${w.lessons} lessons · 🎯 ${acc}% (${w.correct}/${w.asked})`,
    w.streak > 1 ? `🔥 ${w.streak}-day streak` : `Day 1 — streak starts today!`,
    w.weakest ? `Next focus: ${w.weakest} 💪` : `All skills warm ✨`,
    w.weekXp >= w.target ? `Target smashed. See you at the top. 🏆` : `${w.target - w.weekXp} XP to go!`,
  ];
  return lines.join("\n");
}
