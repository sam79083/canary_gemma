import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { neighborLevel, pushRecent, recentStats, suggestShift } from "../lib/learn-adaptive.ts";
import { buildWeeklyReport } from "../lib/learn-report.ts";
import { freezeLeft, touchStreak, touchStreakWithFreeze } from "../lib/streak.ts";

function stubStore(): Map<string, string> {
  const mem = new Map<string, string>();
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => (mem.has(k) ? (mem.get(k) as string) : null),
    setItem: (k: string, v: string) => { mem.set(k, String(v)); },
    removeItem: (k: string) => { mem.delete(k); },
    clear: () => mem.clear(),
    key: () => null,
    length: 0,
  };
  return mem;
}

function unstub() {
  Reflect.deleteProperty(globalThis, "localStorage");
}

describe("adaptive level tips", () => {
  it("needs 10 answers, then 85/45 thresholds with edge clamps", () => {
    assert.equal(suggestShift("B1", 9, 1), null);
    assert.equal(suggestShift("B1", 10, 0.9), "up");
    assert.equal(suggestShift("C2", 20, 1), null);
    assert.equal(suggestShift("B1", 12, 0.4), "down");
    assert.equal(suggestShift("A1", 20, 0), null);
    assert.equal(suggestShift("B2", 15, 0.7), null);
    assert.equal(neighborLevel("B1", "up"), "B2");
    assert.equal(neighborLevel("A1", "down"), "A1");
    assert.equal(neighborLevel(null, "up"), "A2");
  });
  it("rolling buffer keeps last 20 with accuracy", () => {
    stubStore();
    try {
      assert.deepEqual(recentStats(), { n: 0, acc: 0 });
      pushRecent(Array(10).fill(true));
      pushRecent(Array(10).fill(false));
      assert.deepEqual(recentStats(), { n: 20, acc: 0.5 });
      pushRecent([true, true]); // evicts two oldest (true)
      const s = recentStats();
      assert.equal(s.n, 20);
      assert.ok(Math.abs(s.acc - 0.5) < 0.001);
      pushRecent([]);
      assert.equal(recentStats().n, 20);
    } finally {
      unstub();
    }
  });
});

describe("weekly report", () => {
  it("words the week + target verdict", () => {
    const smashed = buildWeeklyReport({
      weekXp: 250, target: 200, lessons: 5, asked: 40, correct: 36,
      level: "B1", weakest: "grammar", streak: 6,
    });
    assert.ok(smashed.includes("250/200") && smashed.includes("90%") && smashed.includes("grammar"));
    assert.ok(smashed.includes("smashed") && smashed.includes("6-day"));
    const behind = buildWeeklyReport({
      weekXp: 30, target: 200, lessons: 1, asked: 0, correct: 0,
      level: null, weakest: null, streak: 1,
    });
    assert.ok(behind.includes("170 XP to go") && behind.includes("Day 1"));
  });
});

describe("streak freeze", () => {
  it("legacy behavior untouched (same day / next day)", () => {
    stubStore();
    try {
      assert.equal(touchStreak(new Date(2026, 9, 12)), 1);
      assert.equal(touchStreak(new Date(2026, 9, 12)), 1);
      assert.equal(touchStreak(new Date(2026, 9, 13)), 2);
    } finally {
      unstub();
    }
  });
  it("one missed day spends the monthly freeze, second miss resets", () => {
    stubStore();
    try {
      touchStreak(new Date(2026, 9, 10)); // count 1
      touchStreak(new Date(2026, 9, 11)); // count 2
      assert.equal(freezeLeft(new Date(2026, 9, 12)), 1);
      const r = touchStreakWithFreeze(new Date(2026, 9, 13)); // missed the 12th
      assert.deepEqual(r, { count: 3, froze: true });
      assert.equal(freezeLeft(new Date(2026, 9, 13)), 0);
      const r2 = touchStreakWithFreeze(new Date(2026, 9, 15)); // missed another
      assert.deepEqual(r2, { count: 1, froze: false });
      // new month: freeze renewed
      touchStreak(new Date(2026, 10, 5));
      assert.equal(freezeLeft(new Date(2026, 10, 5)), 1);
      const r3 = touchStreakWithFreeze(new Date(2026, 10, 7));
      assert.deepEqual(r3, { count: 2, froze: true });
    } finally {
      unstub();
    }
  });
});
