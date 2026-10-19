// Mock IELTS Task 2 — deterministic, zero-token band estimate.
//
// This is a practice heuristic based on length/structure/lexical variety and
// the same rule-based error detector used elsewhere. It is NOT an examiner and
// the UI says so; the point is fast, private feedback before human review.

import { detectErrors } from "./learn-errors.ts";

export interface IeltTask {
  id: string;
  category: string;
  icon: string;
  prompt: string;
  ko: string;
  tips: string[];
}

export const IELTS_TASKS: IeltTask[] = [
  {
    id: "free-university",
    category: "Education",
    icon: "🎓",
    prompt:
      "Some people believe that university education should be free for everyone. To what extent do you agree or disagree?",
    ko: "대학 교육은 모든 사람에게 무료여야 한다는 의견에 어느 정도 동의하나요?",
    tips: [
      "State your position in the introduction.",
      "Use one body paragraph for your main reason and one for the counter-argument.",
      "Give a concrete example (country, policy, personal experience).",
    ],
  },
  {
    id: "automation",
    category: "Technology",
    icon: "🤖",
    prompt:
      "Many jobs are being automated by machines and AI. Is this a positive or negative development?",
    ko: "기계와 AI로 많은 일자리가 자동화되는 것은 긍정적일까요, 부정적일까요?",
    tips: [
      "Pick one side, then acknowledge the other in a short paragraph.",
      "Name specific jobs or industries.",
      "Discuss both workers and companies.",
    ],
  },
  {
    id: "environment",
    category: "Environment",
    icon: "🌱",
    prompt:
      "Individuals can do little to improve the environment; only governments and large companies can make a difference. Discuss both views and give your own opinion.",
    ko: "환경 개선은 개인보다 정부와 대기업이 해야 한다는 두 관점을 논하고 의견을 주세요.",
    tips: [
      "Discuss both views before giving your opinion.",
      "Use one clean example per side.",
      "A concession sentence makes your opinion stronger.",
    ],
  },
  {
    id: "remote-work",
    category: "Work",
    icon: "🏠",
    prompt:
      "Working from home is better than working in an office. To what extent do you agree or disagree?",
    ko: "재택근무가 사무실 근무보다 낫다는 의견에 어느 정도 동의하나요?",
    tips: [
      "Define what 'better' means (time, focus, teamwork).",
      "Use a real or plausible scenario.",
      "End with a qualified position, not a slogan.",
    ],
  },
  {
    id: "city-country",
    category: "Society",
    icon: "🏙️",
    prompt:
      "Some people think it is better to live in a city, while others prefer the countryside. Discuss both views and give your own opinion.",
    ko: "도시 생활과 시골 생활 중 어느 쪽이 좋은지 두 관점을 논하고 의견을 주세요.",
    tips: [
      "Compare the same dimensions for both (cost, jobs, health).",
      "Avoid listing; explain causes.",
      "Your opinion can be conditional ('for families with children…').",
    ],
  },
];

export function ieltsTaskById(id: string | null | undefined): IeltTask | null {
  return IELTS_TASKS.find((t) => t.id === id) ?? null;
}

export interface IeltsCriterion {
  name: string;
  score: number;
  note: string;
}

export interface IeltsEstimate {
  /** Overall practice band (0.5 steps, 1–9). */
  band: number;
  words: number;
  paragraphs: number;
  sentences: number;
  errors: number;
  criteria: IeltsCriterion[];
  verdict: string;
}

const LINKERS =
  /\b(however|therefore|moreover|furthermore|in addition|although|whereas|consequently|for instance|for example|on the other hand|in conclusion|to conclude|firstly|secondly|finally|because|while|despite|nevertheless|as a result)\b/gi;

function clampBand(n: number): number {
  return Math.min(9, Math.max(1, Math.round(n * 2) / 2));
}

function wordsOf(text: string): string[] {
  return text.match(/[A-Za-z][A-Za-z'’-]*/g) ?? [];
}

/** Live word count for the editor (cheap; no error detection). */
export function countIeltsWords(text: string): number {
  return wordsOf(text).length;
}

/** Rough practice band. Empty text still returns a valid band-1-ish estimate. */
export function estimateIeltsBand(text: string): IeltsEstimate {
  const clean = text.trim();
  const words = wordsOf(clean);
  const n = words.length;
  const sentenceCount = Math.max(1, (clean.match(/[.!?]+(?=\s|$)/g) ?? []).length);
  const paragraphs = clean ? clean.split(/\n\s*\n+/).filter((p) => p.trim()).length : 0;
  const errors = detectErrors(clean).length;
  const uniqueRatio = n > 0 ? new Set(words.map((w) => w.toLowerCase())).size / n : 0;
  const avgLen = n > 0 ? words.reduce((a, w) => a + w.length, 0) / n : 0;
  const linkers = (clean.match(LINKERS) ?? []).length;

  let tr = 4;
  if (n >= 300) tr = 7;
  else if (n >= 250) tr = 6.5;
  else if (n >= 220) tr = 6;
  else if (n >= 180) tr = 5.5;
  else if (n >= 150) tr = 5;
  else if (n >= 100) tr = 4.5;
  if (n < 140) tr = Math.max(3, tr - 0.5);

  let cc = paragraphs >= 4 ? 7 : paragraphs === 3 ? 6.5 : paragraphs === 2 ? 5.5 : 5;
  if (paragraphs <= 1) cc = 4.5;
  if (linkers >= 4 && paragraphs >= 3) cc += 0.5;

  let lr = 5;
  if (uniqueRatio >= 0.62 && avgLen >= 5.3) lr = 7;
  else if (uniqueRatio >= 0.55) lr = 6.5;
  else if (uniqueRatio >= 0.47) lr = 6;
  else if (uniqueRatio >= 0.4) lr = 5.5;
  if (avgLen >= 6) lr += 0.5;

  const per100 = n > 0 ? (errors / n) * 100 : 0;
  let gra = 7;
  if (per100 > 1) gra = 6.5;
  if (per100 > 2) gra = 6;
  if (per100 > 3.5) gra = 5.5;
  if (per100 > 5) gra = 5;
  if (per100 > 7) gra = 4.5;
  const avgSentence = n / sentenceCount;
  if (gra < 7 && avgSentence >= 10 && avgSentence <= 30) gra += 0.5;
  if (n < 100) gra = Math.min(gra, 5.5);

  const criteria: IeltsCriterion[] = [
    {
      name: "Task Response",
      score: clampBand(tr),
      note:
        n < 150
          ? "Under 150 words loses Task Response marks — aim for 250+."
          : n < 250
            ? "Add one more developed example to reach 250 words."
            : "Length is in range; make sure every paragraph answers the question.",
    },
    {
      name: "Coherence & Cohesion",
      score: clampBand(cc),
      note:
        paragraphs < 3
          ? "Use 3–4 clear paragraphs: intro, body, body, conclusion."
          : linkers < 3
            ? "Add linking phrases (however, therefore, for instance) between ideas."
            : "Structure looks clear; keep one main idea per paragraph.",
    },
    {
      name: "Lexical Resource",
      score: clampBand(lr),
      note:
        uniqueRatio < 0.5
          ? "Repeated words — paraphrase the prompt and vary verbs/adjectives."
          : avgLen < 4.8
            ? "Try a few precise longer words instead of general ones."
            : "Good variety; check collocations with a dictionary.",
    },
    {
      name: "Grammatical Range & Accuracy",
      score: clampBand(gra),
      note:
        errors > 0
          ? `${errors} pattern${errors === 1 ? "" : "s"} flagged (articles, agreement, punctuation…). Fix those first.`
          : "No common error patterns flagged — read it aloud for flow.",
    },
  ];

  const average = criteria.reduce((a, c) => a + c.score, 0) / criteria.length;
  const band = clampBand(average);
  const verdict =
    band >= 7.5
      ? "Strong: clear position, wide range, few errors."
      : band >= 6.5
        ? "Competent: answers the task; polish cohesion and accuracy for 7+."
        : band >= 5.5
          ? "Developing: ideas are there; deepen examples and link paragraphs."
          : "Needs work: plan 2–3 body paragraphs and write 250+ words.";

  return {
    band,
    words: n,
    paragraphs,
    sentences: sentenceCount,
    errors,
    criteria,
    verdict,
  };
}
