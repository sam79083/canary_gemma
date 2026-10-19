import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LESSONS_PER_UNIT,
  UNITS,
  currentUnit,
  unitsForLevel,
} from "../lib/learn-curriculum.ts";
import {
  CEFR_ORDER,
  buildDailyLesson,
  scorePlacementDetailed,
  type CEFR,
} from "../lib/learn-bank.ts";

describe("learn-curriculum spine", () => {
  it("has five ordered units per CEFR level with unique ids", () => {
    const ids = new Set(UNITS.map((u) => u.id));
    assert.equal(ids.size, UNITS.length, "ids unique");
    for (const lv of CEFR_ORDER) {
      const pool = unitsForLevel(lv);
      assert.equal(pool.length, 5, `${lv} has 5 units`);
      assert.deepEqual(pool.map((u) => u.n), [1, 2, 3, 4, 5]);
      for (const u of pool) {
        assert.equal(u.level, lv);
        assert.ok(u.title && u.ko && u.focus && u.canDo, `${u.id} filled`);
      }
    }
  });
  it("currentUnit derives deterministically from lessons and cycles", () => {
    const first = currentUnit(0, "B1");
    assert.ok(first);
    assert.equal(first.index, 0);
    assert.equal(first.total, 5);
    assert.equal(currentUnit(0, "B1")?.unit.id, first.unit.id, "stable");
    assert.equal(currentUnit(LESSONS_PER_UNIT - 1, "B1")?.unit.id, first.unit.id);
    assert.equal(
      currentUnit(LESSONS_PER_UNIT, "B1")?.unit.id,
      unitsForLevel("B1")[1].id,
      "advances after LESSONS_PER_UNIT",
    );
    assert.equal(
      currentUnit(LESSONS_PER_UNIT * 5, "B1")?.unit.id,
      first.unit.id,
      "cycles after the last unit",
    );
    assert.equal(currentUnit(-3, "A1")?.index, 0, "negative lessons clamp");
    assert.equal(currentUnit(0, null)?.unit.level, "A1", "null level = A1");
  });
  it("null level defaults to the A1 path", () => {
    assert.equal(unitsForLevel(null).length, 5);
    assert.ok(unitsForLevel(null).every((u) => u.level === "A1"));
  });
});

describe("buildDailyLesson unit focus", () => {
  it("prefers the unit skill without breaking the 10-item shape", () => {
    const plain = buildDailyLesson("2026-10-19", "B1", [], "unit");
    const focused = buildDailyLesson("2026-10-19", "B1", [], "unit", "vocab");
    assert.equal(plain.length, 10);
    assert.equal(focused.length, 10);
    const vocab = focused.filter((i) => i.skill === "vocab").length;
    const grammar = focused.filter((i) => i.skill === "grammar").length;
    assert.ok(vocab > grammar, `vocab ${vocab} should lead grammar ${grammar}`);
    assert.deepEqual(
      focused.map((i) => i.id),
      buildDailyLesson("2026-10-19", "B1", [], "unit", "vocab").map((i) => i.id),
      "deterministic per seed",
    );
  });
});

describe("placement calibration", () => {
  it("places a clean staircase at the highest passing band", () => {
    const levels: CEFR[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
    const items = levels.flatMap((l) => Array.from({ length: 3 }, () => ({ level: l })));
    const correct = items.map((it) => {
      const rank = CEFR_ORDER.indexOf(it.level);
      return rank <= 2; // A1, A2, B1 pass; B2+ fail
    });
    const report = scorePlacementDetailed(items, correct);
    assert.equal(report.level, "B1");
    assert.equal(report.confident, true);
    assert.equal(report.total, 18);
    assert.equal(report.score, 9);
    assert.equal(report.bands.find((b) => b.level === "B1")?.passed, true);
    assert.equal(report.bands.find((b) => b.level === "B2")?.passed, false);
  });
  it("one lucky 3/3 band cannot lift the level without the band below", () => {
    const items = [
      ...Array.from({ length: 3 }, () => ({ level: "A1" as CEFR })),
      ...Array.from({ length: 3 }, () => ({ level: "A2" as CEFR })),
      ...Array.from({ length: 3 }, () => ({ level: "B1" as CEFR })),
    ];
    // A1 mixed (2/3 → passes), A2 1/3 (fails), B1 3/3 (passes)
    const correct = [true, true, false, true, false, false, true, true, true];
    const report = scorePlacementDetailed(items, correct);
    assert.equal(report.level, "B1", "highest passing band");
    assert.equal(report.confident, false, "a lower band failed → spiky profile");
  });
  it("falls back to A1 when nothing passes and reports confidence honestly", () => {
    const items = Array.from({ length: 6 }, (_, i) => ({
      level: CEFR_ORDER[Math.floor(i / 3)] as CEFR,
    }));
    const report = scorePlacementDetailed(items, [true, false, false, false, false, false]);
    assert.equal(report.level, "A1");
    assert.equal(report.confident, true, "A2 failed → A1 ceiling confirmed");
    const empty = scorePlacementDetailed([], []);
    assert.equal(empty.level, "A1");
    assert.equal(empty.confident, false, "no evidence ≠ confident");
  });
  it("single-attempt bands never pass (needs 2+ answers)", () => {
    const report = scorePlacementDetailed([{ level: "B2" }], [true]);
    assert.equal(report.bands[0].passed, false);
    assert.equal(report.level, "A1");
  });
});
