import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BULK_IDIOMS } from "../lib/idioms-bulk.ts";
import { BULK_WORDS } from "../lib/words-bulk.ts";
import { dialogueFor } from "../lib/learn-idioms.ts";
import { ALL_ITEMS, gradeChoice } from "../lib/learn-bank.ts";
import { genPoolSize } from "../lib/learn-gen.ts";
import { misspellings, spellBatch, spellItem } from "../lib/learn-spell.ts";
import { gradeIdiom } from "../scripts/build-bulk.mts";
import type { CEFR } from "../lib/learn-bank.ts";

const LEVELS: CEFR[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9' ]/g, " ").replace(/\s+/g, " ").trim();
}

describe("bulk idioms (public-domain CSV)", () => {
  it("keeps hundreds, graded across B1/B2/C1, no junk, no dupes", () => {
    assert.ok(BULK_IDIOMS.length >= 800, `only ${BULK_IDIOMS.length}`);
    const byLevel = new Map<CEFR, number>();
    for (const it of BULK_IDIOMS) {
      assert.ok(it.term.length > 1 && it.meaning.length >= 2);
      assert.ok(it.keywords.length > 0);
      assert.ok(it.unlock === "B1" || it.unlock === "B2" || it.unlock === "C1");
      assert.ok(it.register === "neutral" && it.kind === "idiom");
      byLevel.set(it.unlock, (byLevel.get(it.unlock) ?? 0) + 1);
    }
    assert.ok((byLevel.get("B1") ?? 0) > 100);
    assert.ok((byLevel.get("B2") ?? 0) > 50);
    assert.ok((byLevel.get("C1") ?? 0) > 0);
    const keys = BULK_IDIOMS.map((i) => norm(i.term));
    assert.equal(new Set(keys).size, keys.length); // deduped
    // curated overlaps + literal junk excluded
    assert.ok(!keys.includes("break the ice"));
    assert.ok(!keys.includes("cost an arm and a leg"));
    assert.ok(!keys.includes("fine wine"));
    assert.ok(!keys.includes("new moon"));
  });
  it("grades easy/common terms B1 and hard ones up", () => {
    assert.equal(gradeIdiom("Break a leg"), "B1");
    assert.equal(gradeIdiom("Bite the bullet"), "B1");
    assert.equal(gradeIdiom("By the skin of your teeth"), "B1"); // short common words
    assert.equal(gradeIdiom("Don't count your chickens before they hatch"), "B2"); // 7 words + long word
    assert.equal(gradeIdiom("Don't stop and kick at every dog that barks at you"), "C1"); // 11 words
    assert.equal(gradeIdiom("Alas, poor Yorick"), "C1"); // archaic
  });
  it("dialogue falls back cleanly without an example", () => {
    const it = BULK_IDIOMS[0];
    assert.equal(it.example, "");
    const [a, b] = dialogueFor(it);
    assert.ok(a.includes(it.term) && b.includes(it.meaning));
  });
});

describe("bulk words (frequency bands)", () => {
  it("holds ~10k words across all levels", () => {
    const total = LEVELS.reduce((a, l) => a + BULK_WORDS[l].length, 0);
    assert.ok(total >= 9000, `only ${total}`);
    for (const l of LEVELS) assert.ok(BULK_WORDS[l].length >= 900, `${l} thin`);
    assert.ok(BULK_WORDS.A1.includes("dog") || BULK_WORDS.A1.includes("water"));
  });
});

describe("spelling questions", () => {
  it("every sampled item is valid: correct spelling exactly once", () => {
    for (const lv of LEVELS) {
      const words = BULK_WORDS[lv];
      const step = Math.max(1, Math.floor(words.length / 200));
      for (let k = 0; k < words.length; k += step) {
        const it = spellItem(lv, words, k, "t");
        assert.equal(it.kind, "choice");
        assert.equal(it.choices?.length, 4);
        assert.ok(it.answerIndex !== undefined && it.answerIndex >= 0 && it.answerIndex < 4);
        const ans = it.choices![it.answerIndex];
        assert.equal(ans, words[k]);
        assert.equal(it.choices!.filter((c) => c === ans).length, 1);
        assert.ok(gradeChoice(it.answerIndex, it.answerIndex));
        assert.ok(it.word?.startsWith("spell:"));
      }
    }
  });
  it("misspellings look like learner errors, never equal", () => {
    const rng = () => 0.5;
    for (const w of ["accommodate", "rhythm", "dog", "beautiful"]) {
      for (const m of misspellings(w, rng)) {
        assert.notEqual(m, w);
        assert.ok(m[0] === w[0]); // first letter preserved
      }
    }
  });
  it("batches are deterministic, unique, seen-skipping", () => {
    const words = BULK_WORDS.B1;
    const a = spellBatch("B1", words, 10, [], "s1");
    const b = spellBatch("B1", words, 10, [], "s1");
    assert.deepEqual(a.map((i) => i.id), b.map((i) => i.id));
    assert.equal(new Set(a.map((i) => i.id)).size, 10);
    const seen = a.map((i) => i.id);
    const c = spellBatch("B1", words, 10, seen, "s1");
    assert.ok(seen.every((id) => !c.map((i) => i.id).includes(id)));
  });
});

describe("1,000+ questions per level", () => {
  it("bank + generated + bulk idioms + spelling clears 1k everywhere", () => {
    for (const lv of LEVELS) {
      const total =
        ALL_ITEMS.filter((i) => i.level === lv).length +
        genPoolSize(lv) +
        BULK_IDIOMS.filter((i) => i.unlock === lv).length +
        BULK_WORDS[lv].length;
      assert.ok(total >= 1000, `${lv} only ${total}`);
    }
  });
});
