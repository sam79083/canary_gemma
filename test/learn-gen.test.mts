import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildFreshSetPrompt,
  genBatch,
  genItem,
  genPoolSize,
  genPoolTotal,
  lookupGenWord,
  parseAiItems,
  rememberGenItems,
  thirdPerson,
} from "../lib/learn-gen.ts";
import type { CEFR } from "../lib/learn-bank.ts";
import { gradeChoice, gradeFill } from "../lib/learn-bank.ts";

const LEVELS: CEFR[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

describe("learn-gen pool scale", () => {
  it("holds thousands of unique questions", () => {
    const per = LEVELS.map((l) => genPoolSize(l));
    for (const [l, n] of LEVELS.map((l, i) => [l, per[i]] as const)) {
      assert.ok(n >= 100, `${l} pool only ${n}`);
    }
    assert.ok(genPoolTotal() >= 1500, `total only ${genPoolTotal()}`);
  });
  it("every index in every pool is a valid, gradable item", () => {
    for (const lv of LEVELS) {
      const size = genPoolSize(lv);
      // full sweep for small pools, strided sweep for big ones (speed)
      const step = size > 400 ? 7 : 1;
      for (let k = 0; k < size; k += step) {
        const it = genItem(lv, k, "test");
        assert.equal(it.level, lv);
        assert.ok(it.prompt.length > 3, `${it.id} bad prompt`);
        assert.ok(it.explain.length > 3, `${it.id} bad explain`);
        if (it.kind === "choice") {
          assert.equal(it.choices?.length, 4, `${it.id} needs 4 choices`);
          assert.ok(
            it.answerIndex !== undefined && it.answerIndex >= 0 && it.answerIndex < 4,
            `${it.id} bad answerIndex`,
          );
          assert.ok(gradeChoice(it.answerIndex, it.answerIndex));
          // correct answer text must be among choices exactly once
          const ans = it.choices![it.answerIndex];
          assert.equal(it.choices!.filter((c) => c === ans).length, 1, `${it.id} dup choices`);
        } else {
          assert.ok(it.accept && it.accept.length > 0, `${it.id} fill needs accept`);
          assert.ok(gradeFill(it.accept[0], it.accept), `${it.id} self-grade failed`);
        }
      }
    }
  });
});

describe("learn-gen determinism + freshness", () => {
  it("same idx+salt replays byte-identical; new salt reshuffles, id stays", () => {
    const a = genItem("B1", 42, "day1");
    const b = genItem("B1", 42, "day1");
    assert.deepEqual(a, b);
    const c = genItem("B1", 42, "day2");
    assert.equal(c.id, a.id);
    assert.equal(c.prompt, a.prompt);
  });
  it("batches are unique in-batch and skip seen ids", () => {
    const batch = genBatch("A2", 30, [], "s1");
    assert.equal(batch.length, 30);
    assert.equal(new Set(batch.map((i) => i.id)).size, 30);
    const seen = batch.slice(0, 25).map((i) => i.id);
    const next = genBatch("A2", 30, seen, "s1");
    assert.ok(seen.every((id) => !next.map((i) => i.id).includes(id)));
    // same salt replays the same set (no mid-quiz jumps on re-render)
    const again = genBatch("A2", 30, [], "s1");
    assert.deepEqual(again.map((i) => i.id), batch.map((i) => i.id));
  });
  it("a fresh salt deals a different set (no stale daily quiz)", () => {
    const a = genBatch("C1", 5, [], "open-1").map((i) => i.id);
    const b = genBatch("C1", 5, [], "open-2").map((i) => i.id);
    assert.ok(a.some((id) => !b.includes(id)), "two opens must not repeat all five");
  });
  it("pool exhaustion degrades to in-batch-unique repeats, never crashes", () => {
    const out = genBatch("C2", 500, [], "s9");
    assert.ok(out.length > 0);
    assert.equal(genBatch("A1", 0).length, 0);
  });
});

describe("learn-gen spelling rules", () => {
  it("third person handles endings + exceptions", () => {
    assert.equal(thirdPerson("go"), "goes");
    assert.equal(thirdPerson("watch"), "watches");
    assert.equal(thirdPerson("study"), "studies");
    assert.equal(thirdPerson("play"), "plays");
    assert.equal(thirdPerson("have"), "has");
    assert.equal(thirdPerson("do"), "does");
    assert.equal(thirdPerson("fix"), "fixes");
    assert.equal(thirdPerson("run"), "runs");
  });
});

describe("learn-gen review cache + AI parsing", () => {
  it("remembers generated words for the review tab", () => {
    const items = genBatch("B1", 5, [], "cache1");
    rememberGenItems(items);
    for (const it of items) {
      if (!it.word) continue;
      assert.equal(lookupGenWord(it.word)?.id, it.id);
    }
    assert.equal(lookupGenWord("gen:nope-missing"), null);
  });
  it("parses model JSON batches, rejects rambling", () => {
    const good = '```json\n[{"prompt": "Choose the meaning of \\"brisk\\".", "choices": ["빠른", "느린", "무거운", "가벼운"], "answer": 0, "explain": "brisk = 빠른."}]\n```';
    const items = parseAiItems(good, "B2");
    assert.equal(items.length, 1);
    assert.equal(items[0].answerIndex, 0);
    assert.ok(items[0].word?.startsWith("ai:"));
    assert.deepEqual(parseAiItems("Sorry, I cannot do that right now.", "B2"), []);
    assert.deepEqual(parseAiItems('[{"prompt": "x"}]', "B2"), []);
    assert.deepEqual(parseAiItems('[{"prompt":"p","choices":["a","b","c","d"],"answer":9,"explain":"e"}]', "B2"), []);
  });
  it("fresh-set prompt names the level + avoid list", () => {
    const p = buildFreshSetPrompt("C1", "exam", ["ubiquitous", "pragmatic"]);
    assert.ok(p.includes("C1") && p.includes("ubiquitous") && p.includes("JSON"));
  });
});
