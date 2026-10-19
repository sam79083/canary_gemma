// Structured learner-error profile — "your mistakes become tomorrow's drills".
//
// Deterministic detectors (no AI, no tokens) classify the most common learner
// slips in the learner's OWN sentences. The profile persists on-device, shows
// up in the Me tab as an error radar, and drillable kinds (article, be-verb
// agreement, third-person -s) become SRS cards so tomorrow's review targets
// yesterday's actual mistakes.
//
// Self-contained (type-only cross-imports) so plain `node --test` covers it.

import type { BankItem, CEFR } from "./learn-bank";

export type ErrorKind =
  | "article"
  | "conjunction"
  | "duplicate"
  | "punctuation"
  | "capital"
  | "agreement"
  | "third-person";

/** Human labels for the error-radar UI. */
export const ERROR_KIND_LABEL: Record<ErrorKind, string> = {
  article: "a / an articles",
  conjunction: "stacked conjunctions",
  duplicate: "doubled words",
  punctuation: "end punctuation",
  capital: 'capital "I"',
  agreement: "be-verb agreement",
  "third-person": "-s on he/she/it verbs",
};

export interface DetectedError {
  kind: ErrorKind;
  /** What was wrong, shown verbatim-ish in quotes. */
  found: string;
  /** One-line plain-English fix. */
  fix: string;
  /** Drill subject (noun / verb / pronoun) when drillable. */
  subject?: string;
  /** Correct replacement when drillable (article → a|an, agreement → be form). */
  correct?: string;
  /** SRS card key when this error can become a review drill. */
  word?: string;
}

// --- detectors -------------------------------------------------------------

const CONJUNCTIONS = [
  "because", "since", "as", "although", "though", "while",
  "if", "unless", "until", "when", "before", "after", "but",
];

function startsWithVowelSound(word: string): boolean {
  const w = word.toLowerCase();
  if (["hour", "honest", "honor", "heir"].includes(w)) return true;
  if (/^(uni(vers|form|que|on)|use|user|euro|one|once)/.test(w)) return false;
  return /^[aeiou]/.test(w);
}

/** Base verbs checked for missing third-person -s (he go → he goes). */
const BASE_VERBS = [
  "go", "do", "have", "make", "take", "come", "watch", "play", "work",
  "like", "want", "need", "say", "get", "see", "know", "think", "eat",
  "live", "study", "read", "write", "run",
];

const IRREG_THIRD: Record<string, string> = {
  go: "goes",
  do: "does",
  have: "has",
};

export function thirdPerson(base: string): string {
  const v = base.toLowerCase();
  if (IRREG_THIRD[v]) return IRREG_THIRD[v];
  if (/[^aeiou]y$/.test(v)) return v.slice(0, -1) + "ies";
  if (/(s|sh|ch|x|o)$/.test(v)) return v + "es";
  return v + "s";
}

/** Be-verb mismatch table: [pronoun, wrong form] → correct form. */
function beFix(pronoun: string, wrong: string): string | null {
  const tense = wrong === "was" || wrong === "were" ? "past" : "present";
  if (pronoun === "i") return tense === "past" ? "was" : "am";
  if (pronoun === "he" || pronoun === "she" || pronoun === "it")
    return tense === "past" ? "was" : "is";
  if (pronoun === "you" || pronoun === "we" || pronoun === "they")
    return tense === "past" ? "were" : "are";
  return null;
}

const MAX_ERRORS = 5;

/**
 * Detect the most common learner slips in one piece of learner writing.
 * Heuristic and honest about it: each finding is a concrete quoted fix.
 */
export function detectErrors(raw: string): DetectedError[] {
  const text = (raw || "").trim();
  if (!text) return [];
  const out: DetectedError[] = [];
  const lower = text.toLowerCase();

  // article a/an vowel-sound slips
  for (const m of text.matchAll(/\b(a|an)\s+([A-Za-z]+)/g)) {
    const noun = m[2];
    const wantAn = startsWithVowelSound(noun);
    const gotAn = m[1].toLowerCase() === "an";
    if (wantAn !== gotAn) {
      const right = wantAn ? "an" : "a";
      out.push({
        kind: "article",
        found: `${m[1]} ${noun}`,
        fix: `"${right} ${noun}"`,
        subject: noun.toLowerCase(),
        correct: right,
        word: `err:article:${noun.toLowerCase()}`,
      });
      break;
    }
  }

  // stacked conjunctions
  const words = lower.match(/[a-z']+/g) ?? [];
  for (let i = 0; i + 1 < words.length; i++) {
    if (CONJUNCTIONS.includes(words[i]) && CONJUNCTIONS.includes(words[i + 1])) {
      out.push({
        kind: "conjunction",
        found: `${words[i]} ${words[i + 1]}`,
        fix: `pick one conjunction — drop "${words[i]}" or rephrase`,
      });
      break;
    }
  }

  // be-verb agreement (I are, he are, they is …)
  const be = new RegExp(
    `\\b(i|he|she|it|you|we|they)\\s+(is|are|am|was|were)\\b`,
    "i",
  );
  const bm = lower.match(be);
  if (bm) {
    const pronoun = bm[1];
    const wrong = bm[2];
    const correct = beFix(pronoun, wrong);
    if (correct && correct !== wrong) {
      out.push({
        kind: "agreement",
        found: `${pronoun} ${wrong}`,
        fix: `"${pronoun} ${correct}"`,
        subject: pronoun,
        correct,
        word: `err:agree:${pronoun}-${wrong}`,
      });
    }
  }

  // third-person -s missing (he go) — skip question/negation contexts
  // (non-capturing lookbehind: a capturing group would shift the match indices)
  const tp = new RegExp(
    `(?<!\\b(?:do|does|did)\\s)\\b(he|she|it)\\s+(${BASE_VERBS.join("|")})\\b`,
    "i",
  );
  const tm = lower.match(tp);
  if (tm) {
    out.push({
      kind: "third-person",
      found: `${tm[1]} ${tm[2]}`,
      fix: `"${tm[1]} ${thirdPerson(tm[2])}"`,
      subject: tm[2],
      correct: thirdPerson(tm[2]),
      word: `err:3rd:${tm[2]}`,
    });
  }

  // doubled word
  const doubled = text.match(/\b([A-Za-z]+)\s+\1\b/i);
  if (doubled) {
    out.push({
      kind: "duplicate",
      found: doubled[0],
      fix: "delete one copy",
    });
  }

  // lowercase standalone "i"
  if (/(^|[\s("'])i([\s.,!?;:'")\]]|$)/.test(text)) {
    out.push({
      kind: "capital",
      found: "i",
      fix: 'the pronoun "I" is always capital',
    });
  }

  // missing end punctuation
  if (!/[.!?…]["'”’\s]*$/.test(text)) {
    out.push({
      kind: "punctuation",
      found: text.slice(-20),
      fix: "end your sentence with . ! or ?",
    });
  }

  return out.slice(0, MAX_ERRORS);
}

// --- profile (persisted) ----------------------------------------------------

export interface ErrorEntry {
  kind: ErrorKind;
  found: string;
  fix: string;
  day: string;
  word?: string;
}

export interface ErrorProfile {
  counts: Partial<Record<ErrorKind, number>>;
  /** Newest first, capped. */
  recent: ErrorEntry[];
}

export const ERROR_RECENT_CAP = 40;
const ERROR_DRILL_CAP = 10;

export function emptyErrorProfile(): ErrorProfile {
  return { counts: {}, recent: [] };
}

/**
 * Merge newly detected errors. A finding already recorded the same day
 * (same kind + same quoted text) is skipped — fixing the same slip five
 * times in one drill session shouldn't inflate the profile. Pure.
 */
export function recordErrors(
  profile: ErrorProfile,
  errors: DetectedError[],
  day: string,
): ErrorProfile {
  let counts = profile.counts;
  let recent = profile.recent;
  let changed = false;
  for (const e of errors) {
    if (recent.some((r) => r.day === day && r.found === e.found)) continue;
    counts = { ...counts, [e.kind]: (counts[e.kind] ?? 0) + 1 };
    recent = [{ kind: e.kind, found: e.found, fix: e.fix, day, word: e.word }, ...recent].slice(
      0,
      ERROR_RECENT_CAP,
    );
    changed = true;
  }
  return changed ? { counts, recent } : profile;
}

/** Most frequent error kinds, highest first. */
export function topErrorKinds(
  profile: ErrorProfile,
  n = 3,
): { kind: ErrorKind; count: number }[] {
  return (Object.entries(profile.counts) as [ErrorKind, number][])
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(0, n))
    .map(([kind, count]) => ({ kind, count }));
}

/**
 * One review drill for a drillable error, or null (punctuation, doubled
 * words … aren't single-card material). Works from the SRS word key alone,
 * so drills survive reload with only the persisted profile. Deterministic.
 * `level` only labels the item so review sorting stays sane.
 */
export function drillItemFor(e: DetectedError, level: CEFR | null): BankItem | null {
  const lv: CEFR = level ?? "A2";
  const word = e.word ?? "";
  if (e.kind === "article" && word.startsWith("err:article:")) {
    const noun = word.slice("err:article:".length);
    const right = startsWithVowelSound(noun) ? "an" : "a";
    return {
      id: word,
      skill: "grammar",
      level: lv,
      kind: "choice",
      prompt: `Choose the right article: "I waited ___ ${noun}."`,
      choices: ["a", "an"],
      answerIndex: right === "an" ? 1 : 0,
      explain: `"${right} ${noun}" — the first sound decides, not the letter.`,
      word,
    };
  }
  if (e.kind === "agreement" && word.startsWith("err:agree:")) {
    const rest = word.slice("err:agree:".length);
    const dash = rest.lastIndexOf("-");
    const pronoun = dash > 0 ? rest.slice(0, dash) : rest;
    const wrong = dash > 0 ? rest.slice(dash + 1) : "";
    const correct = beFix(pronoun, wrong);
    if (!correct || correct === wrong) return null;
    return {
      id: word,
      skill: "grammar",
      level: lv,
      kind: "choice",
      prompt: `Choose the right form: "${pronoun} ___ here."`,
      choices: [correct, wrong],
      answerIndex: 0,
      explain: `"${pronoun} ${correct}" — the be-verb must match the subject.`,
      word,
    };
  }
  if (e.kind === "third-person" && word.startsWith("err:3rd:")) {
    const verb = word.slice("err:3rd:".length);
    const correct = thirdPerson(verb);
    return {
      id: word,
      skill: "grammar",
      level: lv,
      kind: "fill",
      prompt: `He ___ (${verb}) every day — type the verb.`,
      accept: [correct],
      explain: `He/she/it takes -s: "${correct}".`,
      word,
    };
  }
  return null;
}

/** Review-ready drill items from the profile (newest mistakes first, deduped). */
export function errorDrills(profile: ErrorProfile, level: CEFR | null): BankItem[] {
  const seen = new Set<string>();
  const out: BankItem[] = [];
  for (const entry of profile.recent) {
    if (!entry.word || seen.has(entry.word)) continue;
    const item = drillItemFor(
      { kind: entry.kind, found: entry.found, fix: entry.fix, word: entry.word },
      level,
    );
    if (!item) continue;
    seen.add(entry.word);
    out.push(item);
    if (out.length >= ERROR_DRILL_CAP) break;
  }
  return out;
}

// --- persistence (storage-guarded, never throws) ----------------------------

const KEY = "canary-error-profile";

const KINDS: ErrorKind[] = [
  "article",
  "conjunction",
  "duplicate",
  "punctuation",
  "capital",
  "agreement",
  "third-person",
];

export function loadErrorProfile(): ErrorProfile {
  try {
    if (typeof localStorage === "undefined") return emptyErrorProfile();
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyErrorProfile();
    const obj = JSON.parse(raw) as unknown;
    const p = obj as ErrorProfile;
    if (!p || typeof p !== "object") return emptyErrorProfile();
    const counts: Partial<Record<ErrorKind, number>> = {};
    if (p.counts && typeof p.counts === "object") {
      for (const k of KINDS) {
        const v = (p.counts as Record<string, unknown>)[k];
        if (typeof v === "number" && Number.isFinite(v) && v > 0) counts[k] = Math.floor(v);
      }
    }
    const recent: ErrorEntry[] = Array.isArray(p.recent)
      ? p.recent
          .filter(
            (e): e is ErrorEntry =>
              !!e &&
              typeof e === "object" &&
              KINDS.includes((e as ErrorEntry).kind) &&
              typeof (e as ErrorEntry).found === "string" &&
              typeof (e as ErrorEntry).fix === "string" &&
              typeof (e as ErrorEntry).day === "string",
          )
          .slice(0, ERROR_RECENT_CAP)
      : [];
    return { counts, recent };
  } catch {
    return emptyErrorProfile();
  }
}

export function saveErrorProfile(p: ErrorProfile): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(
      KEY,
      JSON.stringify({ counts: p.counts, recent: p.recent.slice(0, ERROR_RECENT_CAP) }),
    );
  } catch {
    // best-effort
  }
}
