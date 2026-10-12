import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_ITEMS,
  buildDailyLesson,
  getPlacementTest,
  gradeChoice,
  gradeFill,
  levelRank,
  normalizeAnswer,
  scoreToCEFR,
  SELF_CHECK,
  suggestLevelFromChecks,
} from "../lib/learn-bank.ts";
import { addDays, initCard, isDue, isLeech, reviewCard } from "../lib/learn-store.ts";
import {
  IDIOMS,
  buildIdiomCoachPrompt,
  dialogueFor,
  idiomAiPrompt,
  idiomById,
  idiomToBankItem,
  nextLocked,
  pickOfDay,
  scanSentence,
  tryCheck,
  unlockedFor,
} from "../lib/learn-idioms.ts";
import { clearSeen, loadSeen, markSeen } from "../lib/learn-seen.ts";
import { chooseState, isEmptyState } from "../lib/learn-store.ts";
import {
  ESSAY_TOPICS,
  buildEssayCoachPrompt,
  essayModelShape,
  gradeEssay,
  loadEssayHistory,
  saveEssayAttempt,
} from "../lib/learn-essay.ts";
import {
  dueWords,
  emptyState,
  leechWords,
  recordAnswers,
  weakestSkill,
  weekSeries,
} from "../lib/learn-store.ts";

describe("learn-bank grading", () => {
  it("normalizes fill answers (case/space/punct blind)", () => {
    assert.equal(normalizeAnswer("  By. "), "by");
    assert.equal(normalizeAnswer("Children"), "children");
    assert.ok(gradeFill("by", ["by"]));
    assert.ok(gradeFill("BY!", ["by"]));
    assert.ok(gradeFill("whether", ["if", "whether"]));
    assert.ok(!gradeFill("", ["by"]));
    assert.ok(!gradeFill("buy", ["by"]));
  });
  it("grades choices", () => {
    assert.ok(gradeChoice(1, 1));
    assert.ok(!gradeChoice(0, 1));
  });
  it("placement is fixed 18qs and maps score to CEFR", () => {
    assert.equal(getPlacementTest().length, 18);
    assert.equal(scoreToCEFR(0, 18), "A1");
    assert.equal(scoreToCEFR(4, 18), "A2");
    assert.equal(scoreToCEFR(7, 18), "B1");
    assert.equal(scoreToCEFR(11, 18), "B2");
    assert.equal(scoreToCEFR(14, 18), "C1");
    assert.equal(scoreToCEFR(17, 18), "C2");
  });
  it("exam arena: C2 passages with reading skill, incl. True/False/Not Given", () => {
    const passages = ALL_ITEMS.filter((i) => i.passage);
    assert.ok(passages.length >= 10);
    assert.ok(passages.every((i) => i.skill === "reading" && i.level === "C2"));
    const tfng = passages.filter((i) => (i.choices ?? []).length === 3);
    assert.ok(tfng.length >= 3);
    // Reading answers feed the reading stat, not vocab/grammar.
    const s1 = recordAnswers(emptyState(), [{ item: passages[0], correct: true }], "2026-09-30");
    assert.equal(s1.skills.reading.correct, 1);
    assert.equal(s1.skills.vocab.asked, 0);
  });
  it("daily lesson is deterministic per seed and skips seen ids", () => {
    const a = buildDailyLesson("2026-09-30", "A1").map((i) => i.id);
    const b = buildDailyLesson("2026-09-30", "A1").map((i) => i.id);
    assert.deepEqual(a, b);
    assert.equal(a.length, 10);
    assert.equal(new Set(a).size, 10);
    // Same seed replays; a fresh salt reshuffles the pool.
    const s1 = buildDailyLesson("2026-09-30", "B2", [], 7).map((i) => i.id);
    const s2 = buildDailyLesson("2026-09-30", "B2", [], 7).map((i) => i.id);
    assert.deepEqual(s1, s2);
    // Seen ids never reappear while unseen items remain.
    const seen = a.slice(0, 8);
    const c = buildDailyLesson("2026-09-30", "A1", seen, 3).map((i) => i.id);
    assert.equal(c.length, 10);
    assert.ok(seen.every((id) => !c.includes(id)));
  });
  it("self-check maps checked count to CEFR", () => {
    assert.equal(SELF_CHECK.length, 12);
    assert.equal(suggestLevelFromChecks(0), "A1");
    assert.equal(suggestLevelFromChecks(2), "A1");
    assert.equal(suggestLevelFromChecks(3), "A2");
    assert.equal(suggestLevelFromChecks(5), "B1");
    assert.equal(suggestLevelFromChecks(8), "B2");
    assert.equal(suggestLevelFromChecks(10), "C1");
    assert.equal(suggestLevelFromChecks(12), "C2");
    assert.equal(suggestLevelFromChecks(99), "C2");
  });
  it("lessons center on the level: 3 warm-up, 5 at-level, 2 reach", () => {
    for (const lv of ["A1", "A2", "B1", "B2", "C1", "C2"] as const) {
      const lesson = buildDailyLesson("2026-09-30", lv);
      assert.equal(lesson.length, 10);
      const r = levelRank(lv);
      const lo = Math.max(0, r - 1);
      const hi = Math.min(5, r + 1);
      for (const item of lesson) {
        const ir = levelRank(item.level);
        assert.ok(ir >= lo && ir <= hi, `${lv} lesson leaked ${item.id}`);
      }
      const at = lesson.filter((i) => levelRank(i.level) === r).length;
      assert.ok(at >= 5, `${lv} lesson has only ${at} at-level items`);
    }
    // Unplaced learners get the A1-shaped lesson.
    assert.deepEqual(
      buildDailyLesson("2026-09-30", null).map((i) => i.id),
      buildDailyLesson("2026-09-30", "A1").map((i) => i.id),
    );
  });
});

describe("learn-idioms", () => {
  it("gates starters at A1/A2, idioms at B1, slang at B2, advanced at C1", () => {
    assert.equal(unlockedFor(IDIOMS, null).length, 5); // A1 day-one wins
    assert.equal(unlockedFor(IDIOMS, "A1").length, 5);
    assert.equal(unlockedFor(IDIOMS, "A2").length, 10);
    const b1 = unlockedFor(IDIOMS, "B1");
    assert.equal(b1.length, 26);
    assert.ok(b1.filter((i) => i.kind === "slang").length === 0);
    assert.equal(unlockedFor(IDIOMS, "B2").length, 38);
    assert.equal(unlockedFor(IDIOMS, "C1").length, 44);
    const teaser = nextLocked(IDIOMS, "A1");
    assert.ok(teaser.length > 0 && teaser.every((i) => i.unlock === "A2"));
    const teaser2 = nextLocked(IDIOMS, "B2");
    assert.ok(teaser2.length > 0 && teaser2.every((i) => i.unlock === "C1"));
    assert.deepEqual(nextLocked(IDIOMS, "C1"), []);
  });
  it("pick-of-the-day is deterministic", () => {
    const pool = unlockedFor(IDIOMS, "B2");
    assert.equal(pickOfDay("2026-09-30", pool)?.id, pickOfDay("2026-09-30", pool)?.id);
    assert.equal(pickOfDay("2026-09-30", []), null);
  });
  it("try-it checker needs every keyword, order-free, punct-blind", () => {
    assert.ok(tryCheck("He told a joke to break the ICE!", ["break", "ice"]));
    assert.ok(tryCheck("ice break", ["break", "ice"]));
    assert.ok(!tryCheck("he broke something", ["break", "ice"]));
    assert.ok(!tryCheck("", ["cap"]));
    assert.ok(tryCheck("no cap, that was great", ["cap"]));
  });
  it("sentence scan flags stacked conjunctions and article slips", () => {
    // The exact failure from the wild: keywords present, grammar broken.
    const bad = scanSentence(
      "I sincerely hope we are on the same page here because unless, there is no point in this discussion.",
      ["same", "page"],
    );
    assert.ok(bad.hasKeywords);
    assert.ok(bad.issues.some((i) => i.includes("because unless")));
    const art = scanSentence("I saw a elephant.", ["elephant"]);
    assert.ok(art.hasKeywords);
    assert.ok(art.issues.some((i) => i.includes("an elephant")));
    const clean = scanSentence("Let's meet so we're on the same page.", ["same", "page"]);
    assert.ok(clean.hasKeywords);
    assert.deepEqual(clean.issues, []);
    assert.deepEqual(scanSentence("", ["x"]).issues, []);
    const prompt = buildIdiomCoachPrompt("no cap", "for real", "It was great, no cap.", "It was great no cap", []);
    assert.ok(prompt.includes("no cap") && prompt.includes("It was great no cap"));
  });
  it("dialogues, bank-item conversion, and AI prompts", () => {
    const it1 = IDIOMS.find((i) => i.id === "e-a1-01")!;
    assert.deepEqual(dialogueFor(it1), ["Hey! How's it going?", "Pretty good! You?"]);
    const b1 = IDIOMS.find((i) => i.id === "i-b1-01")!;
    const [a, b] = dialogueFor(b1);
    assert.ok(a.length > 3 && b.includes(b1.term));
    const bank = idiomToBankItem(b1);
    assert.equal(bank.word, `idiom:${b1.id}`);
    assert.equal(bank.answerIndex, 0);
    assert.ok(idiomById(b1.id)?.term === b1.term);
    assert.equal(idiomById("nope"), null);
    assert.ok(idiomAiPrompt("explain", b1).includes(b1.term));
    assert.ok(idiomAiPrompt("examples", b1).includes("3 SHORT"));
    assert.ok(idiomAiPrompt("quiz", b1).includes("Quiz me"));
  });
});

describe("learn-seen", () => {
  it("remembers asked ids, dedupes, and restores cleanly", () => {
    const mem = new Map<string, string>();
    const stub = {
      getItem: (k: string) => (mem.has(k) ? (mem.get(k) as string) : null),
      setItem: (k: string, v: string) => { mem.set(k, String(v)); },
      removeItem: (k: string) => { mem.delete(k); },
      clear: () => mem.clear(),
      key: () => null,
      length: 0,
    };
    (globalThis as unknown as { localStorage: unknown }).localStorage = stub;
    try {
      assert.deepEqual(loadSeen(), []);
      markSeen(["a", "b", "a"]);
      assert.deepEqual(loadSeen(), ["a", "b"]);
      markSeen(["c"]);
      assert.deepEqual(loadSeen(), ["c", "a", "b"]);
      clearSeen();
      assert.deepEqual(loadSeen(), []);
    } finally {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  });
});

describe("learn-sync merge", () => {
  it("picks remote for empty local, newer remote, else local", () => {
    const local = emptyState();
    assert.ok(isEmptyState(local));
    const progressed = { ...local, xp: 50, lessons: 2 };
    assert.ok(!isEmptyState(progressed));
    const remote = {
      state: { ...local, xp: 999, lessons: 9 },
      updated_at: "2026-09-29T00:00:00.000Z",
    };
    // Empty local adopts remote (new device).
    assert.equal(chooseState(local, 0, remote).from, "remote");
    // Progressed local beats older remote.
    const r1 = chooseState(progressed, Date.parse("2026-09-30T00:00:00.000Z"), remote);
    assert.equal(r1.from, "local");
    // Progressed local loses to newer remote.
    const r2 = chooseState(
      progressed,
      Date.parse("2026-09-28T00:00:00.000Z"),
      { ...remote, updated_at: "2026-09-29T12:00:00.000Z" },
    );
    assert.equal(r2.from, "remote");
    assert.equal(r2.state.xp, 999);
    // No remote, bad timestamp → local, never throws.
    assert.equal(chooseState(progressed, 0, null).from, "local");
    assert.equal(chooseState(progressed, 0, { ...remote, updated_at: "junk" }).from, "local");
  });
});

describe("learn-essay", () => {
  it("ships a real topic library across levels", () => {
    assert.ok(ESSAY_TOPICS.length >= 20);
    for (const lv of ["B1", "B2", "C1", "C2"]) {
      const n = ESSAY_TOPICS.filter((t) => t.level === lv).length;
      assert.ok(n >= 4, `${lv} has only ${n} topics`);
    }
    const ids = new Set(ESSAY_TOPICS.map((t) => t.id));
    assert.equal(ids.size, ESSAY_TOPICS.length);
    for (const t of ESSAY_TOPICS) {
      assert.ok(t.minWords < t.maxWords);
      assert.ok(t.keywords.length >= 3);
      assert.ok(t.topic.length > 10 && t.hint.length > 5);
    }
  });
  const topic = ESSAY_TOPICS.find((t) => t.id === "e-b2-1") ?? ESSAY_TOPICS[0];
  const strong = [
    "Remote work has changed modern life completely. Many people now work from home instead of commuting to an office every day. However, this new freedom comes with hidden costs that deserve attention.",
    "Firstly, remote workers often feel isolated and lonely. Although video calls help teams communicate, they cannot replace genuine conversation. For example, a developer in Seoul told me she misses lunch with her colleagues. Moreover, the boundary between professional duties and personal relaxation gradually disappears.",
    "Finally, companies must respond with practical solutions. Managers should organize regular in-person gatherings so distributed teams remain connected. In addition, workers themselves need discipline because the laptop is always within reach.",
    "In conclusion, remote work offers remarkable flexibility, but it demands conscious effort. I believe a balanced approach allows people to enjoy freedom without sacrificing their social wellbeing.",
  ].join("\n\n");
  const weak = "i like summer. it is hot. i go swim. summer is good i like it very much.";

  it("passes a strong essay at 80+, fails a weak one", () => {
    const good = gradeEssay(strong, topic);
    assert.ok(good.pass, `expected pass, got ${good.total}`);
    assert.ok(good.total >= 80 && good.total <= 100);
    assert.equal(good.axes.length, 5);
    const bad = gradeEssay(weak, ESSAY_TOPICS[0]);
    assert.ok(!bad.pass);
    assert.ok(bad.total < 80);
  });
  it("is deterministic and catches article errors with fixes", () => {
    const a = gradeEssay("I saw a elephant and an book.", ESSAY_TOPICS[0]);
    const b = gradeEssay("I saw a elephant and an book.", ESSAY_TOPICS[0]);
    assert.deepEqual(a, b);
    assert.ok(a.feedback.some((f) => f.includes("an elephant")));
    assert.ok(gradeEssay("", ESSAY_TOPICS[0]).total === 0);
  });
  it("model shape guides a rewrite", () => {
    const shape = essayModelShape(ESSAY_TOPICS[0]);
    assert.equal(shape.length, 4);
    assert.ok(shape[0].includes("Intro"));
    assert.ok(shape[3].includes("words"));
  });
  it("builds a chat coaching prompt and keeps history", () => {
    const score = gradeEssay(strong, topic);
    const prompt = buildEssayCoachPrompt(topic, strong, score);
    assert.ok(prompt.includes(topic.topic));
    assert.ok(prompt.includes(`${score.total}/100`));
    const mem = new Map<string, string>();
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => (mem.has(k) ? (mem.get(k) as string) : null),
      setItem: (k: string, v: string) => { mem.set(k, String(v)); },
      removeItem: (k: string) => { mem.delete(k); },
      clear: () => mem.clear(),
      key: () => null,
      length: 0,
    };
    try {
      assert.deepEqual(loadEssayHistory(), []);
      const next = saveEssayAttempt({
        id: "t1", topicId: topic.id, topic: topic.topic,
        words: score.wordCount, total: score.total, pass: score.pass, at: "2026-09-30",
      });
      assert.equal(next.length, 1);
      assert.equal(loadEssayHistory()[0].total, score.total);
    } finally {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  });
});

describe("learn-srs", () => {  it("pass grows interval, fail resets", () => {
    const t = "2026-09-30";
    let c = initCard(t);
    c = reviewCard(c, true, t);
    assert.equal(c.passes, 1);
    c = reviewCard(c, true, addDays(t, 1));
    assert.equal(c.interval, 6);
    const failed = reviewCard(c, false, addDays(t, 2));
    assert.equal(failed.interval, 1);
    assert.ok(failed.ease < c.ease);
  });
  it("due + leech detection", () => {
    const t = "2026-09-30";
    const c = initCard(t);
    assert.ok(isDue(c, t));
    assert.ok(!isLeech(c));
    let bad = c;
    for (let i = 0; i < 3; i++) bad = reviewCard(bad, false, t);
    assert.ok(isLeech(bad));
  });
});

describe("learn-store", () => {
  it("records xp + skills + cards without mutating", () => {
    const s0 = emptyState();
    const items = getPlacementTest().slice(0, 2);
    const s1 = recordAnswers(
      s0,
      [
        { item: items[0], correct: true },
        { item: items[1], correct: false },
      ],
      "2026-09-30",
    );
    assert.equal(s0.xp, 0);
    assert.equal(s1.xp, 12); // 10 + 2
    assert.equal(s1.lessons, 1);
    assert.equal(s1.days["2026-09-30"].asked, 2);
  });
  it("weakest skill needs 5+ attempts", () => {
    const s = emptyState();
    assert.equal(weakestSkill(s), null);
    const vocab = buildDailyLesson("2026-09-30", "B2").filter((i) => i.skill === "vocab")[0];
    const grammar = buildDailyLesson("2026-09-30", "B2").filter((i) => i.skill === "grammar")[0];
    let cur = s;
    for (let i = 0; i < 5; i++)
      cur = recordAnswers(cur, [{ item: vocab, correct: true }], "2026-09-30");
    for (let i = 0; i < 5; i++)
      cur = recordAnswers(cur, [{ item: grammar, correct: false }], "2026-09-30");
    assert.equal(weakestSkill(cur), "grammar");
    assert.ok(leechWords(cur).length >= 0);
    assert.ok(dueWords(cur, "2026-10-10").length >= 0);
    assert.equal(weekSeries(cur, "2026-09-30").length, 7);
  });
  it("tracks idiom try-it cards for review", () => {
    const idiom = IDIOMS[0];
    const bank = idiomToBankItem(idiom);
    const s1 = recordAnswers(
      emptyState(),
      [{ item: bank, correct: false }],
      "2026-09-30",
    );
    assert.ok(dueWords(s1, "2026-10-10").includes(`idiom:${idiom.id}`));
    assert.ok(idiomById(idiom.id)?.id === idiom.id);
  });
});
