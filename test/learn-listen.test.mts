import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  contentWords,
  gradeHeard,
  listenBatch,
  listenComprehensionItem,
  listenSentenceCount,
  listenSentenceItem,
  listenWordItem,
  normHeard,
  wordHitRate,
} from "../lib/learn-listen.ts";
import { BULK_WORDS } from "../lib/words-bulk.ts";
import { emptyState, recordAnswers } from "../lib/learn-store.ts";

describe("learn-listen grading", () => {
  it("dictation is case/punct blind, rejects blanks", () => {
    assert.ok(gradeHeard("The cat is big!", ["the cat is big"]));
    assert.ok(!gradeHeard("", ["the cat is big"]));
    assert.ok(!gradeHeard("the dog is big", ["the cat is big"]));
    assert.equal(normHeard("  Hello,  WORLD! "), "hello world");
  });
  it("apostrophes are forgiving in both directions", () => {
    assert.ok(gradeHeard("ive been waiting", ["I've been waiting"]));
    assert.ok(gradeHeard("I've been waiting", ["Ive been waiting"]));
    assert.ok(gradeHeard("dont forget your coat", ["Don't forget your coat."]));
  });
  it("shadowing scores content-word hits, ignores glue", () => {
    assert.equal(wordHitRate("The cat is big.", "the cat is big"), 1);
    assert.ok(wordHitRate("The cat is big.", "cat big") >= 0.66);
    assert.equal(wordHitRate("The cat is big.", "hello there friend"), 0);
    assert.equal(wordHitRate("!!!", "hello"), 0);
    assert.ok(contentWords("I like apples.").includes("apples"));
    assert.ok(!contentWords("I like it.").includes("i"));
  });
});

describe("learn-listen batches", () => {
  it("word/sentence/comprehension items are valid + deterministic", () => {
    const words = BULK_WORDS.A1;
    const w1 = listenWordItem("A1", words, 3, "s");
    const w2 = listenWordItem("A1", words, 3, "s");
    assert.deepEqual(w1, w2);
    assert.equal(w1.skill, "listening");
    assert.ok(w1.audio.length >= 2 && w1.accept!.length > 0);
    assert.ok(gradeHeard(w1.audio, w1.accept!));
    assert.ok(w1.word?.startsWith("listen:"));
    const s = listenSentenceItem("A1", 7, "s");
    assert.ok(s.audio.endsWith(".") && gradeHeard(s.audio, s.accept!));
    const c1 = listenComprehensionItem("B1", 1, "s");
    const c2 = listenComprehensionItem("B1", 1, "s");
    assert.deepEqual(c1, c2);
    assert.equal(c1.choices?.length, 4);
    assert.ok(c1.answerIndex! >= 0 && c1.answerIndex! < 4);
  });

  it("content is level-graded, not all A1/A2", () => {
    for (const lv of ["A1", "A2", "B1", "B2", "C1", "C2"] as const) {
      const s = listenSentenceItem(lv, 0);
      assert.equal(s.level, lv);
      const c = listenComprehensionItem(lv, 0);
      assert.equal(c.level, lv);
      // Longer, harder script at higher levels (curated sets).
      assert.ok(c.audio.length > 20, `${lv} comprehension too thin`);
    }
    const c2 = listenComprehensionItem("C2", 0);
    const a1 = listenComprehensionItem("A1", 0);
    assert.ok(c2.audio.length > a1.audio.length, "C2 clip should outgrow A1");
  });

  it("generated clips are diverse and questions are coherent", () => {
    const audios = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const s = listenSentenceItem("A1", 100000 + i);
      audios.add(s.audio);
    }
    // Regression guard: the old pool had 16 unique audios behind 576 ids.
    assert.ok(audios.size > 200, `only ${audios.size} unique of 400`);
    // Generator comprehension: the correct choice must be in the audio.
    for (let i = 0; i < 60; i++) {
      const c = listenComprehensionItem("B1", 99999 + i);
      const correct = c.choices![c.answerIndex!];
      const words = contentWords(correct).filter((w) => w.length > 3);
      const heard = contentWords(c.audio);
      assert.ok(
        words.length === 0 || words.some((w) => heard.includes(w)),
        `answer "${correct}" not in audio "${c.audio}"`,
      );
    }
    // Answer positions must vary (not always the first choice).
    const positions = new Set<number>();
    for (let i = 0; i < 40; i++)
      positions.add(listenComprehensionItem("B1", 99999 + i).answerIndex!);
    assert.ok(positions.size >= 3, `answer index only took ${positions.size} positions`);
    // Curated comprehension answers are within range for every level.
    for (const lv of ["A1", "A2", "B1", "B2", "C1", "C2"] as const) {
      for (let k = 0; k < 6; k++) {
        const c = listenComprehensionItem(lv, k);
        assert.ok(c.id.includes("-c"), `curated id expected at index ${k}`);
        assert.ok(c.answerIndex! >= 0 && c.answerIndex! < 4);
        assert.equal(new Set(c.choices!.map((x) => x.toLowerCase())).size, 4);
      }
    }
  });

  it("batches are unique, seen-skipping, replayable", () => {
    const a = listenBatch("B1", BULK_WORDS.B1, "dictate-word", 5, [], "r1");
    assert.equal(a.length, 5);
    assert.equal(new Set(a.map((i) => i.id)).size, 5);
    const b = listenBatch("B1", BULK_WORDS.B1, "dictate-word", 5, [], "r1");
    assert.deepEqual(a.map((i) => i.id), b.map((i) => i.id));
    const seen = a.map((i) => i.id);
    const c = listenBatch("B1", BULK_WORDS.B1, "dictate-word", 5, seen, "r1");
    assert.ok(seen.every((id) => !c.map((i) => i.id).includes(id)));
    const s = listenBatch("A1", [], "dictate-sent", 5, [], "r1");
    assert.equal(s.length, 5);
    assert.ok(listenSentenceCount() > 500);
    const comp = listenBatch("C1", [], "comprehend", 5, [], "r1");
    assert.equal(comp.length, 5);
    assert.ok(comp.every((i) => i.answerIndex! >= 0));
  });
  it("listening answers feed the listening stat (extended Skill)", () => {
    const s0 = emptyState();
    assert.equal(s0.skills.listening.asked, 0);
    const item = listenWordItem("A1", ["apple"], 0, "t");
    const s1 = recordAnswers(s0, [{ item, correct: true }], "2026-10-13");
    assert.equal(s1.skills.listening.correct, 1);
    assert.equal(s1.skills.vocab.asked, 0);
    assert.equal(s1.xp, 10);
  });
});
