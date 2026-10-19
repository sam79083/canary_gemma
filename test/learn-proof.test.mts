import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emptyState } from "../lib/learn-store.ts";
import type { PortfolioEntry } from "../lib/learn-portfolio.ts";
import type { PronounceStats } from "../lib/learn-pronounce.ts";
import {
  buildProofEvidence,
  exportProofSheet,
  streakFromDays,
} from "../lib/learn-proof.ts";

describe("streakFromDays", () => {
  it("counts a current run ending today", () => {
    const days = { "2026-10-17": {}, "2026-10-18": {}, "2026-10-19": {} };
    assert.deepEqual(streakFromDays(days, "2026-10-19"), { current: 3, best: 3 });
  });

  it("keeps yesterday's streak alive until the day ends", () => {
    const days = { "2026-10-16": {}, "2026-10-17": {}, "2026-10-18": {} };
    assert.deepEqual(streakFromDays(days, "2026-10-19"), { current: 3, best: 3 });
  });

  it("breaks on a missed day", () => {
    const days = { "2026-10-15": {}, "2026-10-16": {}, "2026-10-18": {}, "2026-10-19": {} };
    assert.deepEqual(streakFromDays(days, "2026-10-19"), { current: 2, best: 2 });
  });

  it("remembers the best run from the past", () => {
    const days = {
      "2026-10-01": {}, "2026-10-02": {}, "2026-10-03": {}, "2026-10-04": {},
      "2026-10-10": {}, "2026-10-11": {},
    };
    assert.deepEqual(streakFromDays(days, "2026-10-11"), { current: 2, best: 4 });
  });

  it("crosses month boundaries and ignores junk keys", () => {
    const days = { "2026-09-30": {}, "2026-10-01": {}, nope: {}, "2026-13-99": {} };
    assert.deepEqual(streakFromDays(days, "2026-10-01"), { current: 2, best: 2 });
  });

  it("returns zero for empty or invalid input", () => {
    assert.deepEqual(streakFromDays({}, "2026-10-19"), { current: 0, best: 0 });
    assert.deepEqual(streakFromDays({ "2026-10-19": {} }, "today"), { current: 0, best: 0 });
  });
});

function sample() {
  const state = emptyState();
  state.level = "B1";
  state.xp = 1234;
  state.lessons = 12;
  state.skills.vocab = { asked: 20, correct: 18 };
  state.skills.grammar = { asked: 5, correct: 3 };
  state.days = {
    "2026-10-18": { day: "2026-10-18", xp: 10, lessons: 0, correct: 1, asked: 1 },
    "2026-10-19": { day: "2026-10-19", xp: 10, lessons: 0, correct: 1, asked: 1 },
  };
  const folio: PortfolioEntry[] = [
    { id: "1", kind: "ielts", title: "Free university", body: "Essay body", at: "2026-10-19T10:00:00.000Z" },
    { id: "2", kind: "essay", title: "My week", body: "Essay body", at: "2026-10-18T10:00:00.000Z" },
    { id: "3", kind: "milestone", title: "B1 placed", body: "Level B1", at: "2026-10-17T10:00:00.000Z" },
  ];
  const pronounce: PronounceStats = {
    "ship-sheep": { ok: 7, total: 10 },
    bogus: { ok: 5, total: 0 },
  };
  return { state, folio, pronounce };
}

describe("proof evidence", () => {
  it("summarizes practice, skills, pronunciation and pieces", () => {
    const { state, folio, pronounce } = sample();
    const e = buildProofEvidence(state, folio, pronounce, "2026-10-19");
    assert.equal(e.level, "B1");
    assert.equal(e.totalAsked, 25);
    assert.equal(e.totalCorrect, 21);
    assert.equal(e.accuracy, 84);
    assert.equal(e.streak, 2);
    assert.equal(e.bestStreak, 2);
    assert.equal(e.pieceTotal, 3);
    assert.deepEqual(e.pieces, { ielts: 1, essay: 1, milestone: 1 });
    assert.equal(e.pronounce.pairs, 1);
    assert.equal(e.pronounce.attempts, 10);
    assert.equal(e.pronounce.correct, 7);
    assert.equal(e.pronounce.accuracy, 70);
    assert.equal(e.recent[0].label, "🎓 IELTS practice");
  });

  it("handles a brand-new learner", () => {
    const e = buildProofEvidence(emptyState(), [], {}, "2026-10-19");
    assert.equal(e.level, null);
    assert.equal(e.totalAsked, 0);
    assert.equal(e.accuracy, 0);
    assert.equal(e.pronounce.accuracy, 0);
    assert.equal(e.pieceTotal, 0);
    const md = exportProofSheet(e);
    assert.match(md, /not placed yet/);
    assert.match(md, /No saved pieces yet/);
  });

  it("renders unknown kinds and empty dates without crashing", () => {
    const { state, folio } = sample();
    const weird: PortfolioEntry[] = [
      { id: "x", kind: "unknown" as never, title: "Pipe | title", body: "b", at: "" },
      ...folio,
    ];
    const md = exportProofSheet(buildProofEvidence(state, weird, {}, "2026-10-19"));
    assert.match(md, /unknown/);
    assert.match(md, /\(\)/);
  });
});

describe("exportProofSheet", () => {
  it("includes the honest disclaimer and core numbers", () => {
    const { state, folio, pronounce } = sample();
    const md = exportProofSheet(buildProofEvidence(state, folio, pronounce, "2026-10-19"));
    assert.match(md, /^# 🎓 English Proof Sheet/m);
    assert.match(md, /CEFR B1 \(self-placed\)/);
    assert.match(md, /1,234/);
    assert.match(md, /84%\*\* over \*\*25/);
    assert.match(md, /70%/);
    assert.match(md, /not\*\* an official certificate/);
    assert.match(md, /Vocabulary: 90% \(18\/20\)/);
    assert.match(md, /Grammar: 60% \(3\/5\)/);
    assert.match(md, /🎓 IELTS practice ×1/);
    assert.match(md, /Free university/);
    assert.doesNotMatch(md, /undefined/);
  });

  it("is deterministic for the same evidence", () => {
    const { state, folio, pronounce } = sample();
    const a = exportProofSheet(buildProofEvidence(state, folio, pronounce, "2026-10-19"));
    const b = exportProofSheet(buildProofEvidence(state, folio, pronounce, "2026-10-19"));
    assert.equal(a, b);
  });
});
