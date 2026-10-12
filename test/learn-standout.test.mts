import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addCard,
  buildMatchRound,
  emptyCards,
  extractWordsFromText,
  gradeWrite,
  removeCard,
} from "../lib/learn-flash.ts";
import {
  analyzeStyle,
  buildStyleCoachPrompt,
  styleFindings,
} from "../lib/learn-feedback.ts";
import {
  PATHS,
  loadPath,
  orderIdiomsForPath,
  pathById,
  weeklyTarget,
} from "../lib/learn-path.ts";
import {
  addEntry,
  buildShareCard,
  exportPortfolioMd,
  leagueRank,
  leagueTable,
  removeEntry,
} from "../lib/learn-portfolio.ts";
import { awardXP, emptyState } from "../lib/learn-store.ts";

describe("flashcards + vocab builder", () => {
  it("adds/dedupes/removes custom cards", () => {
    let cards = emptyCards();
    cards = addCard(cards, "serendipity", "happy accident");
    assert.equal(cards.length, 1);
    cards = addCard(cards, "serendipity", "happy accident");
    assert.equal(cards.length, 1); // dupe ignored
    cards = addCard(cards, "  ", "nope");
    assert.equal(cards.length, 1); // blank ignored
    cards = removeCard(cards, cards[0].id);
    assert.equal(cards.length, 0);
  });
  it("mines study words from file text", () => {
    const found = extractWordsFromText(
      "The meeting was postponed because the renovation delayed everything. The renovation team sent a detailed explanation.",
      5,
    );
    const words = found.map((f) => f.word);
    assert.ok(words.includes("renovation"));
    assert.ok(!words.includes("the") && !words.includes("was"));
    assert.ok(found[0].count >= 1);
    assert.deepEqual(extractWordsFromText("a an the and", 5), []);
  });
  it("builds deterministic match rounds + grades writing", () => {
    let cards = emptyCards();
    cards = addCard(cards, "ubiquitous", "found everywhere");
    cards = addCard(cards, "candid", "frank");
    cards = addCard(cards, "thrive", "grow well");
    cards = addCard(cards, "vivid", "bright and clear");
    cards = addCard(cards, "pragmatic", "practical");
    const r1 = buildMatchRound(cards, "wk1", 3);
    const r2 = buildMatchRound(cards, "wk1", 3);
    assert.deepEqual(r1, r2);
    assert.equal(r1.length, 3);
    for (const q of r1) {
      assert.equal(q.choices[q.answerIndex], cards.find((c) => c.id === q.cardId)!.meaning);
      assert.ok(q.choices.length <= 4);
    }
    assert.ok(gradeWrite("Ubiquitous!", "ubiquitous"));
    assert.ok(!gradeWrite("", "ubiquitous"));
    assert.ok(!gradeWrite("candid", "ubiquitous"));
    assert.deepEqual(buildMatchRound([], "x"), []);
  });
});

describe("style feedback", () => {
  it("measures sentences, passive, fillers, tone", () => {
    const m = analyzeStyle("Hey gonna grab coffee. It was done by the team. Very very good stuff, yeah!");
    assert.ok(m.sentences >= 2);
    assert.ok(m.passiveHits >= 1);
    assert.ok(m.fillerHits.includes("very"));
    assert.equal(m.tone, "casual");
    const empty = analyzeStyle("");
    assert.equal(empty.words, 0);
  });
  it("gives level- and goal-aware tips", () => {
    const m = analyzeStyle("This was written by the manager. It was approved by the director. It was sent by the team. Hey cool stuff, very awesome yeah!");
    const biz = styleFindings(m, "B1", "business");
    assert.ok(biz.some((f) => f.tip.includes("Business") || f.tip.includes("passive") || f.tip.includes("Fillers")));
    const acad = styleFindings(m, "C1", "academic");
    assert.ok(acad.length > 0 && acad.length <= 5);
    const clean = styleFindings(analyzeStyle("The team finished the report. However, the data needs review."), "B2", "general");
    assert.ok(clean.length > 0);
    const prompt = buildStyleCoachPrompt("Hello world. This is my text.", "B1", "business", m, biz);
    assert.ok(prompt.includes("business") && prompt.includes("Hello world"));
  });
});

describe("paths + portfolio + league", () => {
  it("paths resolve, order idioms, set targets", () => {
    assert.equal(PATHS.length, 5);
    assert.equal(pathById("business").register, "work-safe");
    assert.equal(pathById("nope").id, "general");
    assert.equal(loadPath(), "general"); // no localStorage under node
    const items = [{ register: "casual" }, { register: "work-safe" }, { register: "neutral" }];
    const ordered = orderIdiomsForPath(items, "business");
    assert.equal(ordered[0].register, "work-safe");
    assert.ok(weeklyTarget("exam") > weeklyTarget("travel"));
  });
  it("portfolio adds/exports/shares", () => {
    let folio = addEntry([], "essay", "Remote work", "Remote work is great. However, focus matters.", "88/100");
    assert.equal(folio.length, 1);
    folio = addEntry(folio, "sentence", "Idiom", "The test was a piece of cake.");
    const md = exportPortfolioMd(folio, "B1", 120);
    assert.ok(md.includes("Remote work") && md.includes("120 XP"));
    const card = buildShareCard("My essay", "Hello.", "B1");
    assert.ok(card.includes("Feedback please") && card.includes("Hello."));
    folio = removeEntry(folio, folio[0].id);
    assert.equal(folio.length, 1);
    assert.ok(exportPortfolioMd([], null, 0).includes("Nothing yet"));
  });
  it("league is deterministic with the learner in it", () => {
    const a = leagueTable(120, "2026-W41");
    const b = leagueTable(120, "2026-W41");
    assert.deepEqual(a, b);
    assert.equal(a.length, 8);
    assert.ok(a.some((r) => r.me && r.xp === 120));
    assert.ok(a[0].xp >= a[a.length - 1].xp); // sorted
    assert.ok(leagueRank(0, "2026-W41") >= 1 && leagueRank(0, "2026-W41") <= 8);
    assert.ok(leagueRank(9999, "2026-W41") === 1);
  });
  it("awardXP adds bonus without lessons/skills", () => {
    const s0 = emptyState();
    const s1 = awardXP(s0, 5, "2026-10-12");
    assert.equal(s1.xp, 5);
    assert.equal(s1.lessons, 0);
    assert.equal(s1.days["2026-10-12"].xp, 5);
    assert.equal(awardXP(s0, 0, "2026-10-12"), s0);
    assert.equal(awardXP(s0, 999, "2026-10-12").xp, 50); // capped
  });
});
