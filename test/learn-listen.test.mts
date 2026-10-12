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
    const s = listenSentenceItem(7, "s");
    assert.ok(s.audio.endsWith(".") && gradeHeard(s.audio, s.accept!));
    const c1 = listenComprehensionItem(7, "s");
    const c2 = listenComprehensionItem(7, "s");
    assert.deepEqual(c1, c2);
    assert.equal(c1.choices?.length, 4);
    assert.ok(c1.answerIndex! >= 0 && c1.answerIndex! < 4);
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
