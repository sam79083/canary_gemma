import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildDailyLesson,
  getPlacementTest,
  gradeChoice,
  gradeFill,
  levelRank,
  normalizeAnswer,
  scoreToCEFR,
  SELF_CHECK,
  suggestLevelFromChecks,
} from "../lib/learn-bank.ts";
import { addDays, initCard, isDue, isLeech, reviewCard } from "../lib/learn-store.ts";
import {
  IDIOMS,
  nextLocked,
  pickOfDay,
  tryCheck,
  unlockedFor,
} from "../lib/learn-idioms.ts";
import {
  dueWords,
  emptyState,
  leechWords,
  recordAnswers,
  weakestSkill,
  weekSeries,
} from "../lib/learn-store.ts";

describe("learn-bank grading", () => {
  it("normalizes fill answers (case/space/punct blind)", () => {
    assert.equal(normalizeAnswer("  By. "), "by");
    assert.equal(normalizeAnswer("Children"), "children");
    assert.ok(gradeFill("by", ["by"]));
    assert.ok(gradeFill("BY!", ["by"]));
    assert.ok(gradeFill("whether", ["if", "whether"]));
    assert.ok(!gradeFill("", ["by"]));
    assert.ok(!gradeFill("buy", ["by"]));
  });
  it("grades choices", () => {
    assert.ok(gradeChoice(1, 1));
    assert.ok(!gradeChoice(0, 1));
  });
  it("placement is fixed 12qs and maps score to CEFR", () => {
    assert.equal(getPlacementTest().length, 12);
    assert.equal(scoreToCEFR(0, 12), "A1");
    assert.equal(scoreToCEFR(4, 12), "A2");
    assert.equal(scoreToCEFR(7, 12), "B1");
    assert.equal(scoreToCEFR(11, 12), "B2");
  });
  it("daily lesson is deterministic and mixed", () => {
    const a = buildDailyLesson("2026-09-30", "A1").map((i) => i.id);
    const b = buildDailyLesson("2026-09-30", "A1").map((i) => i.id);
    assert.deepEqual(a, b);
    assert.equal(a.length, 10);
    assert.equal(new Set(a).size, 10);
  });
  it("self-check maps checked count to CEFR", () => {
    assert.equal(SELF_CHECK.length, 8);
    assert.equal(suggestLevelFromChecks(0), "A1");
    assert.equal(suggestLevelFromChecks(2), "A1");
    assert.equal(suggestLevelFromChecks(3), "A2");
    assert.equal(suggestLevelFromChecks(5), "B1");
    assert.equal(suggestLevelFromChecks(8), "B2");
    assert.equal(suggestLevelFromChecks(99), "B2");
  });
  it("lessons are leveled: nothing above level+1, core majority at/below", () => {
    for (const lv of ["A1", "A2", "B1", "B2"] as const) {
      const lesson = buildDailyLesson("2026-09-30", lv);
      assert.equal(lesson.length, 10);
      for (const item of lesson)
        assert.ok(
          levelRank(item.level) <= levelRank(lv) + 1,
          `${lv} lesson leaked ${item.id}`,
        );
      const core = lesson.filter((i) => levelRank(i.level) <= levelRank(lv));
      assert.ok(core.length >= 6, `${lv} lesson has only ${core.length} core items`);
    }
    // Unplaced learners get the A1-shaped lesson.
    assert.deepEqual(
      buildDailyLesson("2026-09-30", null).map((i) => i.id),
      buildDailyLesson("2026-09-30", "A1").map((i) => i.id),
    );
  });
});

describe("learn-idioms", () => {
  it("gates idioms at B1 and slang at B2, teasers for locked", () => {
    assert.ok(unlockedFor(IDIOMS, null).length === 0);
    assert.ok(unlockedFor(IDIOMS, "A2").length === 0);
    const b1 = unlockedFor(IDIOMS, "B1");
    assert.ok(b1.length === 12 && b1.every((i) => i.kind !== "slang"));
    assert.equal(unlockedFor(IDIOMS, "B2").length, 20);
    const teaser = nextLocked(IDIOMS, "A1");
    assert.ok(teaser.length > 0 && teaser.every((i) => i.unlock === "B1"));
    assert.deepEqual(nextLocked(IDIOMS, "B2"), []);
  });
  it("pick-of-the-day is deterministic", () => {
    const pool = unlockedFor(IDIOMS, "B2");
    assert.equal(pickOfDay("2026-09-30", pool)?.id, pickOfDay("2026-09-30", pool)?.id);
    assert.equal(pickOfDay("2026-09-30", []), null);
  });
  it("try-it checker needs every keyword, order-free, punct-blind", () => {
    assert.ok(tryCheck("He told a joke to break the ICE!", ["break", "ice"]));
    assert.ok(tryCheck("ice break", ["break", "ice"]));
    assert.ok(!tryCheck("he broke something", ["break", "ice"]));
    assert.ok(!tryCheck("", ["cap"]));
    assert.ok(tryCheck("no cap, that was great", ["cap"]));
  });
});

describe("learn-srs", () => {  it("pass grows interval, fail resets", () => {
    const t = "2026-09-30";
    let c = initCard(t);
    c = reviewCard(c, true, t);
    assert.equal(c.passes, 1);
    c = reviewCard(c, true, addDays(t, 1));
    assert.equal(c.interval, 6);
    const failed = reviewCard(c, false, addDays(t, 2));
    assert.equal(failed.interval, 1);
    assert.ok(failed.ease < c.ease);
  });
  it("due + leech detection", () => {
    const t = "2026-09-30";
    const c = initCard(t);
    assert.ok(isDue(c, t));
    assert.ok(!isLeech(c));
    let bad = c;
    for (let i = 0; i < 3; i++) bad = reviewCard(bad, false, t);
    assert.ok(isLeech(bad));
  });
});

describe("learn-store", () => {
  it("records xp + skills + cards without mutating", () => {
    const s0 = emptyState();
    const items = getPlacementTest().slice(0, 2);
    const s1 = recordAnswers(
      s0,
      [
        { item: items[0], correct: true },
        { item: items[1], correct: false },
      ],
      "2026-09-30",
    );
    assert.equal(s0.xp, 0);
    assert.equal(s1.xp, 12); // 10 + 2
    assert.equal(s1.lessons, 1);
    assert.equal(s1.days["2026-09-30"].asked, 2);
  });
  it("weakest skill needs 5+ attempts", () => {
    const s = emptyState();
    assert.equal(weakestSkill(s), null);
    const vocab = buildDailyLesson("2026-09-30", "B2").filter((i) => i.skill === "vocab")[0];
    const grammar = buildDailyLesson("2026-09-30", "B2").filter((i) => i.skill === "grammar")[0];
    let cur = s;
    for (let i = 0; i < 5; i++)
      cur = recordAnswers(cur, [{ item: vocab, correct: true }], "2026-09-30");
    for (let i = 0; i < 5; i++)
      cur = recordAnswers(cur, [{ item: grammar, correct: false }], "2026-09-30");
    assert.equal(weakestSkill(cur), "grammar");
    assert.ok(leechWords(cur).length >= 0);
    assert.ok(dueWords(cur, "2026-10-10").length >= 0);
    assert.equal(weekSeries(cur, "2026-09-30").length, 7);
  });
});
