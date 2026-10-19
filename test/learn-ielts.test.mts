import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  IELTS_TASKS,
  countIeltsWords,
  estimateIeltsBand,
  ieltsTaskById,
} from "../lib/learn-ielts.ts";

const STRONG = `University education is often presented as a private investment, yet the benefits of a well-educated population are shared by everyone. The question is not whether education is valuable, but who should pay for it. I largely agree that tuition should be free, provided that access is managed fairly and quality does not collapse.

First, removing fees widens opportunity. Talented students from low-income families currently choose courses based on cost rather than aptitude, which wastes potential and deepens inequality. For instance, several European countries charge little or nothing and still produce strong graduates. When finance stops being the deciding factor, universities can select on merit.

Opponents reply that free tuition mainly subsidises middle-class families, yet that is an argument for targeted support, not permanent fees. However, free education is expensive. Governments must fund it through taxation, and in practice this can mean larger classes or outdated equipment. Therefore, "free" should not mean "unlimited": a sensible policy combines public funding with competitive entry and a modest contribution from those who can afford it. A predictable national framework also helps employers, who need graduates with reliable skills rather than uneven local provision.

In conclusion, I support free university education because the social returns are substantial, but the policy needs safeguards. Funding, quality and fairness must be designed together rather than treated as separate promises. If the state treats universities as a long-term investment, the money returns through higher productivity and lower inequality. A graduate who pays nothing but learns little is no victory for anyone.`;

function plainEssay(wordTarget: number): string {
  const sentence =
    "Students learn useful skills when teachers explain ideas clearly and give helpful practice in class.";
  const parts: string[] = [];
  let words = 0;
  while (words < wordTarget) {
    parts.push(sentence);
    words += sentence.split(/\s+/).length;
  }
  return parts.join(" ");
}

describe("IELTS task bank", () => {
  it("has unique, complete prompts", () => {
    const ids = new Set(IELTS_TASKS.map((t) => t.id));
    assert.equal(ids.size, IELTS_TASKS.length);
    assert.ok(IELTS_TASKS.length >= 4);
    for (const t of IELTS_TASKS) {
      assert.ok(t.prompt.length > 40, t.id);
      assert.ok(t.ko && t.icon && t.category, t.id);
      assert.ok(t.tips.length >= 2, t.id);
    }
  });
  it("looks tasks up by id safely", () => {
    assert.equal(ieltsTaskById(IELTS_TASKS[0].id)?.id, IELTS_TASKS[0].id);
    assert.equal(ieltsTaskById("nope"), null);
    assert.equal(ieltsTaskById(null), null);
  });
});

describe("IELTS band estimate", () => {
  it("counts words for the live editor", () => {
    assert.equal(countIeltsWords("Hello, world! It's fine — 2 things."), 5);
    assert.equal(countIeltsWords(""), 0);
    assert.equal(countIeltsWords("  123 456 "), 0);
  });

  it("keeps empty text honest and in range", () => {
    const e = estimateIeltsBand("   ");
    assert.equal(e.words, 0);
    assert.ok(e.band >= 1 && e.band <= 5, `band ${e.band}`);
    assert.equal(e.criteria.length, 4);
  });

  it("scores a developed four-paragraph essay as competent or better", () => {
    const e = estimateIeltsBand(STRONG);
    assert.ok(e.words >= 250, `words ${e.words}`);
    assert.equal(e.paragraphs, 4);
    assert.ok(e.band >= 6.5, `band ${e.band}`);
    assert.ok(e.band <= 8.5, `band ${e.band}`);
    assert.ok(e.sentences >= 8);
    assert.deepEqual(
      e.criteria.map((c) => c.name),
      [
        "Task Response",
        "Coherence & Cohesion",
        "Lexical Resource",
        "Grammatical Range & Accuracy",
      ],
    );
  });

  it("penalizes short, unstructured text", () => {
    const e = estimateIeltsBand(plainEssay(60));
    assert.ok(e.band <= 5, `band ${e.band}`);
    assert.ok(e.words >= 60);
  });

  it("penalizes repeated vocabulary and missing paragraphs", () => {
    const repeated = Array(12).fill("I think it is good because it is good").join(" ");
    const e = estimateIeltsBand(repeated);
    assert.equal(e.paragraphs, 1);
    assert.ok(e.band < 6);
  });

  it("flags grammar patterns and lowers the band versus clean text", () => {
    const clean = plainEssay(120);
    const messy =
      clean +
      " I has a apple. They is go to school yesterday. She don't likes it.";
    const a = estimateIeltsBand(clean);
    const b = estimateIeltsBand(messy);
    assert.equal(a.errors, 0);
    assert.ok(b.errors > 0);
    assert.ok(b.band <= a.band);
  });

  it("returns half-point bands only", () => {
    for (const text of ["", STRONG, plainEssay(200)]) {
      const b = estimateIeltsBand(text).band;
      assert.equal(Math.round(b * 2), b * 2, `band ${b}`);
    }
  });

  it("is deterministic", () => {
    assert.deepEqual(estimateIeltsBand(STRONG), estimateIeltsBand(STRONG));
  });
});
