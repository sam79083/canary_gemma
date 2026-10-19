import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectErrors,
  drillItemFor,
  emptyErrorProfile,
  errorDrills,
  recordErrors,
  thirdPerson,
  topErrorKinds,
  type DetectedError,
} from "../lib/learn-errors.ts";

describe("learn-errors detection", () => {
  it("catches a/an slips with the right fix and drill key", () => {
    const errs = detectErrors("I waited a hour for the bus");
    const art = errs.find((e) => e.kind === "article");
    assert.ok(art, "article slip found");
    assert.equal(art.subject, "hour");
    assert.equal(art.correct, "an");
    assert.equal(art.word, "err:article:hour");
    assert.match(art.fix, /an hour/);
  });
  it("does not flag uni/hour exceptions wrongly", () => {
    assert.equal(
      detectErrors("It was a university. It took an hour.").length,
      0,
      "a university + an hour are correct",
    );
  });
  it("catches stacked conjunctions, doubled words, punctuation, capital I", () => {
    const errs = detectErrors("i went home because unless it was very very cold");
    const kinds = errs.map((e) => e.kind);
    assert.ok(kinds.includes("conjunction"));
    assert.ok(kinds.includes("duplicate"));
    assert.ok(kinds.includes("capital"));
    assert.ok(kinds.includes("punctuation"), "no end punctuation");
  });
  it("catches be-verb agreement and missing third-person -s", () => {
    const agree = detectErrors("They is happy today.");
    const a = agree.find((e) => e.kind === "agreement");
    assert.ok(a);
    assert.equal(a.word, "err:agree:they-is");

    const third = detectErrors("He go to school every morning.");
    const t = third.find((e) => e.kind === "third-person");
    assert.ok(t);
    assert.equal(t.correct, "goes");
    assert.equal(t.word, "err:3rd:go");
  });
  it("does not flag third-person -s in question/negation contexts", () => {
    assert.equal(detectErrors("Does he go to school?").filter((e) => e.kind === "third-person").length, 0);
    assert.equal(detectErrors("He does not go there.").filter((e) => e.kind === "third-person").length, 0);
  });
  it("thirdPerson handles irregulars and -y/-o endings", () => {
    assert.equal(thirdPerson("go"), "goes");
    assert.equal(thirdPerson("have"), "has");
    assert.equal(thirdPerson("study"), "studies");
    assert.equal(thirdPerson("watch"), "watches");
    assert.equal(thirdPerson("play"), "plays");
  });
});

describe("learn-errors profile", () => {
  const err = (over: Partial<DetectedError> = {}): DetectedError => ({
    kind: "article",
    found: "a hour",
    fix: '"an hour"',
    word: "err:article:hour",
    ...over,
  });

  it("recordErrors counts kinds and keeps newest first, without mutation", () => {
    const p0 = emptyErrorProfile();
    const p1 = recordErrors(p0, [err(), err({ kind: "punctuation", found: "bus", fix: "add .", word: undefined })], "2026-10-01");
    assert.deepEqual(p0.counts, {}, "no mutation");
    assert.equal(p1.counts.article, 1);
    assert.equal(p1.counts.punctuation, 1);
    assert.equal(p1.recent.length, 2);
    assert.equal(p1.recent[0].found, "bus", "newest first");
  });
  it("dedupes the same finding on the same day but counts across days", () => {
    const p1 = recordErrors(emptyErrorProfile(), [err()], "2026-10-01");
    const again = recordErrors(p1, [err()], "2026-10-01");
    assert.equal(again, p1, "same-day duplicate is a no-op (same object)");
    const nextDay = recordErrors(p1, [err()], "2026-10-02");
    assert.equal(nextDay.counts.article, 2);
  });
  it("topErrorKinds orders by count", () => {
    let p = emptyErrorProfile();
    p = recordErrors(p, [err(), err({ found: "an university", word: "err:article:university" })], "2026-10-01");
    p = recordErrors(p, [err({ kind: "third-person", found: "he go", fix: '"he goes"', word: "err:3rd:go" })], "2026-10-01");
    const top = topErrorKinds(p, 2);
    assert.equal(top[0].kind, "article");
    assert.equal(top[0].count, 2);
    assert.equal(top[1].kind, "third-person");
  });
  it("repairs an article drill prompt's blank", () => {
    const item = drillItemFor(err(), "B1");
    assert.ok(item);
    assert.equal(item.kind, "choice");
    assert.equal(item.choices?.[item.answerIndex ?? -1], "an");
    assert.equal(item.word, "err:article:hour");
  });
  it("builds agreement and third-person drills, skips non-drillable kinds", () => {
    const agree = drillItemFor({ kind: "agreement", found: "they is", fix: "", word: "err:agree:they-is" }, null);
    assert.ok(agree);
    assert.equal(agree.choices?.[agree.answerIndex ?? -1], "are");
    const third = drillItemFor({ kind: "third-person", found: "he go", fix: "", word: "err:3rd:go" }, null);
    assert.ok(third);
    assert.deepEqual(third.accept, ["goes"]);
    assert.equal(drillItemFor({ kind: "punctuation", found: "bus", fix: "" }, null), null);
  });
  it("errorDrills dedupes by word key and caps the list", () => {
    const entries = Array.from({ length: 14 }, (_, i) => ({
      kind: "article" as const,
      found: `a ${i}`,
      fix: "x",
      day: "2026-10-01",
      word: `err:article:word${i}`,
    }));
    entries.push(entries[0]);
    const p = { counts: { article: 15 }, recent: entries };
    const drills = errorDrills(p, "A2");
    assert.equal(drills.length, 10, "capped");
    assert.equal(new Set(drills.map((d) => d.word)).size, drills.length, "deduped");
  });
});
