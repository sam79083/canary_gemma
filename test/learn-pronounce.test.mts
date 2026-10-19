import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MINIMAL_PAIRS,
  normalizeSpeech,
  pairAccuracy,
  pickPair,
  recordAttempt,
  sanitizePronounceStats,
  scoreMinimalPair,
  type PronounceStats,
} from "../lib/learn-pronounce.ts";

describe("minimal pair data", () => {
  it("is complete and unique", () => {
    const ids = new Set(MINIMAL_PAIRS.map((p) => p.id));
    assert.equal(ids.size, MINIMAL_PAIRS.length);
    const words = new Set<string>();
    for (const p of MINIMAL_PAIRS) {
      assert.ok(p.a && p.b && p.a !== p.b, p.id);
      assert.ok(p.ipaA.startsWith("/") && p.ipaB.startsWith("/"), `${p.id} ipa`);
      assert.ok(p.koA && p.koB && p.tip, `${p.id} ko/tip`);
      assert.ok(["A1", "A2", "B1", "B2", "C1", "C2"].includes(p.level), p.id);
      assert.ok(p.sentenceA.toLowerCase().includes(p.a), `${p.id} sentenceA`);
      assert.ok(p.sentenceB.toLowerCase().includes(p.b), `${p.id} sentenceB`);
      const key = [p.a, p.b].sort().join("|");
      assert.ok(!words.has(key), `duplicate contrast ${key}`);
      words.add(key);
    }
  });
});

describe("speech scoring", () => {
  const pair = MINIMAL_PAIRS.find((p) => p.id === "ship-sheep");
  assert.ok(pair, "ship/sheep exists");

  it("normalizes spoken text", () => {
    assert.equal(normalizeSpeech("  The SHIP, please! "), "the ship please");
    assert.equal(normalizeSpeech("It’s fine."), "it's fine");
  });
  it("scores the target word, ignoring case and punctuation", () => {
    const r = scoreMinimalPair(pair, "A big SHEEP.", "b");
    assert.equal(r.score, 1);
    assert.equal(r.heardWord, "sheep");
    assert.equal(r.confusedWith, null);
  });
  it("detects the classic confusion", () => {
    const r = scoreMinimalPair(pair, "I saw a sheep", "a");
    assert.equal(r.score, 0);
    assert.equal(r.confusedWith, "sheep");
  });
  it("gives partial credit for unrecognized speech", () => {
    const r = scoreMinimalPair(pair, "something else entirely", "a");
    assert.equal(r.score, 0.5);
    assert.equal(r.heardWord, "something");
    assert.equal(scoreMinimalPair(pair, "", "b").score, 0.5);
  });
});

describe("drill selection + progress", () => {
  it("picks deterministically and stays near the learner level", () => {
    const first = pickPair("2026-10-19|A1", "A1");
    assert.equal(first.id, pickPair("2026-10-19|A1", "A1").id);
    for (let seed = 0; seed < 60; seed++) {
      const p = pickPair(seed, "A1");
      assert.ok(["A1", "A2"].includes(p.level), `${seed}: ${p.level}`);
    }
    const high = pickPair(7, "C1");
    assert.ok(high);
  });
  it("honors excludeId when another pair exists", () => {
    const exclude = pickPair("x", "C1").id;
    for (let seed = 0; seed < 30; seed++) {
      assert.notEqual(pickPair(seed, "C1", exclude).id, exclude);
    }
  });
  it("tracks attempts and accuracy", () => {
    let stats: PronounceStats = {};
    stats = recordAttempt(stats, "ship-sheep", 1);
    stats = recordAttempt(stats, "ship-sheep", 0.5);
    stats = recordAttempt(stats, "ship-sheep", 0);
    stats = recordAttempt(stats, "cat-cut", 1);
    assert.deepEqual(stats["ship-sheep"], { ok: 1, total: 3 });
    assert.equal(pairAccuracy(stats["ship-sheep"]), 33);
    assert.equal(pairAccuracy(stats["cat-cut"]), 100);
    assert.equal(pairAccuracy(undefined), 0);
  });
  it("sanitizes saved stats", () => {
    const clean = sanitizePronounceStats({
      "ship-sheep": { ok: 4, total: 2 },
      "cat-cut": { ok: "1", total: "2" },
      bogus: { ok: 1, total: 1 },
      "pen-pan": { ok: 1, total: 0 },
      "fan-pan": "nope",
    });
    assert.deepEqual(clean, {
      "ship-sheep": { ok: 2, total: 2 },
      "cat-cut": { ok: 1, total: 2 },
    });
    assert.deepEqual(sanitizePronounceStats(null), {});
    assert.deepEqual(sanitizePronounceStats([1, 2]), {});
  });
});
