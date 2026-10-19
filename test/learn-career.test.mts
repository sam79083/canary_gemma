import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CAREER_TRACKS,
  buildCareerChatPrompt,
  careerById,
  pickCareerQuestions,
} from "../lib/learn-career.ts";

describe("career track data", () => {
  it("has five complete, unique tracks", () => {
    assert.equal(CAREER_TRACKS.length, 5);
    const ids = new Set(CAREER_TRACKS.map((t) => t.id));
    assert.equal(ids.size, CAREER_TRACKS.length);
    for (const t of CAREER_TRACKS) {
      assert.ok(t.name && t.ko && t.icon && t.blurb && t.tip, t.id);
      assert.ok(t.phrases.length >= 6, `${t.id} phrases`);
      assert.ok(t.questions.length >= 5, `${t.id} questions`);
      for (const p of t.phrases) {
        assert.ok(p.en && p.ko && p.when, `${t.id} phrase fields`);
        assert.ok(["A1", "A2", "B1", "B2", "C1", "C2"].includes(p.level), p.en);
        assert.match(p.ko, /[가-힣]/, `${p.en} has Korean`);
      }
      for (const q of t.questions) {
        assert.ok(q.q && q.ko && q.skeleton.length >= 3, `${t.id} question`);
        assert.match(q.ko, /[가-힣]/, `${q.q} has Korean`);
        assert.ok(["A1", "A2", "B1", "B2", "C1", "C2"].includes(q.level), q.q);
      }
    }
  });
  it("looks tracks up by id", () => {
    assert.equal(careerById("software")?.name, "Software / IT");
    assert.equal(careerById("nope"), null);
    assert.equal(careerById(null), null);
  });
});

describe("career question dealing", () => {
  it("is deterministic per seed and respects the level band", () => {
    const track = careerById("support");
    assert.ok(track);
    const a = pickCareerQuestions(track, "A2", "2026-10-19");
    const b = pickCareerQuestions(track, "A2", "2026-10-19");
    assert.deepEqual(a.map((q) => q.q), b.map((q) => q.q));
    assert.equal(a.length, 3);
    assert.ok(a.every((q) => ["A1", "A2", "B1"].includes(q.level)), a.map((q) => q.level).join(","));
    assert.equal(new Set(a.map((q) => q.q)).size, a.length, "no duplicates");
  });
  it("caps n and still returns something for tiny n", () => {
    const track = careerById("marketing");
    assert.ok(track);
    assert.equal(pickCareerQuestions(track, "C2", "s", 99).length, 5);
    assert.equal(pickCareerQuestions(track, "C2", "s", 1).length, 1);
    assert.equal(pickCareerQuestions(track, "C2", "s", 0).length, 0);
  });
});

describe("career chat handoff", () => {
  it("names the job and the exact question without inventing a persona", () => {
    const track = careerById("software");
    assert.ok(track);
    const q = track.questions[0];
    const prompt = buildCareerChatPrompt(track, q);
    assert.match(prompt, /Software \/ IT/);
    assert.match(prompt, new RegExp(q.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(prompt, /one question at a time/);
    assert.ok(!/you are a/i.test(prompt), "no persona prompt");
  });
});
