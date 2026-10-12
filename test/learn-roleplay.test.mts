import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkGoals,
  loadRoleplay,
  roleplayLine,
  scenarioById,
  SCENARIOS,
} from "../lib/learn-roleplay.ts";

describe("learn-roleplay scenarios", () => {
  it("ships six playable scenes with 3 goals each", () => {
    assert.equal(SCENARIOS.length, 6);
    const ids = new Set(SCENARIOS.map((s) => s.id));
    assert.equal(ids.size, 6);
    for (const s of SCENARIOS) {
      assert.ok(s.name && s.opener.length > 10 && s.setting.length > 10);
      assert.equal(s.goals.length, 3);
      for (const g of s.goals) {
        assert.ok(g.label.length > 2 && g.keywords.length > 0);
      }
    }
    assert.ok(scenarioById("cafe")?.opener.includes("Coco Cafe"));
    assert.equal(scenarioById("nope"), null);
    assert.equal(loadRoleplay(), null); // no localStorage under node
  });
  it("checks goals whole-word, any-keyword, ?-aware", () => {
    const cafe = scenarioById("cafe")!;
    const [order, size, thanks] = checkGoals("One coffee please, medium size. Thanks!", cafe.goals);
    assert.ok(order && size && thanks);
    assert.deepEqual(checkGoals("hello there", cafe.goals), [false, false, false]);
    assert.deepEqual(checkGoals("", cafe.goals), [false, false, false]);
    // suffixes count (thanks), unrelated words don't (peas)
    const [o2] = checkGoals("I want peas.", cafe.goals);
    assert.equal(o2, false);
    const interview = scenarioById("interview")!;
    const [, , askBack] = checkGoals("What time do we start?", interview.goals);
    assert.equal(askBack, true);
  });
  it("persona prompt names the scene, level, language", () => {
    const sc = scenarioById("airport")!;
    const p = roleplayLine(sc, "A2", "Korean");
    assert.ok(p.includes("Airport") && p.includes("A2") && p.includes("Korean"));
    assert.ok(p.toLowerCase().includes("one step at a time"));
  });
});
