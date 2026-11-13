// buildWeakSkillDrill — the "Today's repair" 5-item set (weakest skill first,
// grammar slips leading via seed, ladder-sweep fallback, seeded per day+salt).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ALL_ITEMS, buildWeakSkillDrill } from "../lib/learn-bank.ts";
import type { BankItem } from "../lib/learn-bank.ts";

const seedItem: BankItem = {
  id: "err:article:cat",
  skill: "grammar",
  level: "A1",
  kind: "choice",
  prompt: 'Choose: "I saw ___ cat."',
  choices: ["a", "an"],
  answerIndex: 0,
  explain: "a cat — consonant sound.",
};

describe("buildWeakSkillDrill", () => {
  it("returns at most 5 items, all from the requested skill, no duplicates", () => {
    const out = buildWeakSkillDrill("vocab", "2026-11-13", "B1");
    assert.ok(out.length > 0 && out.length <= 5);
    assert.ok(out.every((i) => i.skill === "vocab"));
    assert.equal(new Set(out.map((i) => i.id)).size, out.length);
  });

  it("prefers at-level items when the band is stocked", () => {
    const out = buildWeakSkillDrill("vocab", "2026-11-13", "B1");
    assert.equal(out.length, 5);
    assert.ok(out.every((i) => i.level === "B1"));
  });

  it("is deterministic per (day, salt) and rotates with a different salt", () => {
    const a = buildWeakSkillDrill("vocab", "2026-11-13", "B1", [], "");
    const b = buildWeakSkillDrill("vocab", "2026-11-13", "B1", [], "");
    const c = buildWeakSkillDrill("vocab", "2026-11-13", "B1", [], "1");
    assert.deepEqual(a.map((i) => i.id), b.map((i) => i.id));
    assert.notDeepEqual(a.map((i) => i.id), c.map((i) => i.id));
  });

  it("honors the exclude list and sweeps outward when the band is exhausted", () => {
    const b1Vocab = ALL_ITEMS.filter((i) => i.skill === "vocab" && i.level === "B1").map((i) => i.id);
    const out = buildWeakSkillDrill("vocab", "2026-11-13", "B1", b1Vocab);
    assert.ok(out.length > 0);
    assert.ok(out.every((i) => !b1Vocab.includes(i.id)));
    assert.ok(out.every((i) => i.skill === "vocab"));
  });

  it("leads with same-skill seeds and caps the set at 5", () => {
    const out = buildWeakSkillDrill("grammar", "2026-11-13", "A1", [], "", [seedItem, seedItem]);
    assert.equal(out[0].id, "err:article:cat");
    assert.equal(out.length, 5);
    assert.equal(new Set(out.map((i) => i.id)).size, out.length);
  });

  it("drops seeds from a different skill — slips never pad a mismatched drill", () => {
    const foreign: BankItem = { ...seedItem, id: "err:foreign", skill: "reading" };
    const out = buildWeakSkillDrill("grammar", "2026-11-13", "A1", [], "", [foreign]);
    assert.ok(!out.some((i) => i.id === "err:foreign"));
  });

  it("returns [] for skills with no bank material", () => {
    assert.deepEqual(buildWeakSkillDrill("writing", "2026-11-13", "B1"), []);
    assert.deepEqual(buildWeakSkillDrill("listening", "2026-11-13", "B1"), []);
  });

  it("returns [] when every same-skill item is excluded", () => {
    const everything = ALL_ITEMS.filter((i) => i.skill === "grammar").map((i) => i.id);
    assert.deepEqual(buildWeakSkillDrill("grammar", "2026-11-13", "A2", everything), []);
  });
});
