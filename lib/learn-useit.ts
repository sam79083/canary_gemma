// "Use it right away" — the production loop (using beats recognizing).
//
// A learner taps a word/phrase/idiom and immediately PRODUCES a sentence:
// inline in the Learn panel (fast verdict via the same AI session) or handed
// to main chat (full conversation + follow-ups). This module owns the shared
// pieces so all five entry points behave identically:
//   buildUseItPrompt() — inline verdict prompt (verdict + fix + reply)
//   buildHandoffMessage() — user message posted into main chat
//   buildTeachPrompt() — "teach me this selection" one-shot (chat selection)
//   practiceLine() — persona prefix for Practice chat mode
//   detectUsage() — which target terms appear in a text (XP + ✓ chips)
//   STARTERS — tap-to-assemble sentence openers (blank-page fear)
//   PracticeTarget load/save — targets shared Learn → Chat via localStorage
// Self-contained (no runtime cross-imports) so plain `node --test` covers it.

export interface PracticeTarget {
  term: string;
  meaning?: string;
}

const TARGETS_KEY = "canary-practice-targets";
const MAX_TARGETS = 12;

export const USEIT_DRAFT_KEY = "canary-useit-draft";

/** Inline verdict: judge MY sentence, fix it, then keep talking. */
export function buildUseItPrompt(
  term: string,
  meaning: string,
  example: string,
  sentence: string,
): string {
  return [
    "You are Coco, a friendly English conversation partner. I just learned a new expression and want to USE it right away.",
    `Expression: "${term}" = ${meaning}. Native example: "${example || "(none)"}"`,
    `My sentence: "${sentence.trim()}"`,
    "Reply with: 1) verdict (natural / almost / off) in 5 words or less, 2) a corrected native-sounding version of MY sentence, 3) one short follow-up question or reply that uses the expression again so I can keep practicing. Under 120 words. Be encouraging!",
  ].join("\n");
}

/** User message posted into main chat to start a practice exchange. */
export function buildHandoffMessage(term: string, meaning: string, sentence?: string): string {
  const base = `I just learned "${term}" (= ${meaning}). I want to practice using it!`;
  if (sentence && sentence.trim())
    return `${base}\nMy sentence: "${sentence.trim()}"\nPlease reply naturally (use it once yourself), then give me quick feedback: verdict + corrected version if needed.`;
  return `${base}\nPlease ask me a fun question that invites me to use it, then give feedback on my answer.`;
}

/** One-shot "teach me what I selected in chat". */
export function buildTeachPrompt(selection: string): string {
  const sel = selection.trim().slice(0, 200);
  return `Teach me "${sel}": what does it mean (simple English, one line), one everyday example sentence, then ask me ONE question that makes me use it. Wait for my answer before continuing.`;
}

/** Persona prefix for Practice chat mode (appended like personalityLine). */
export function practiceLine(targets: PracticeTarget[], replyLang: string): string {
  const list = targets.map((t) => `"${t.term}"${t.meaning ? ` (= ${t.meaning})` : ""}`).join(", ");
  return [
    "",
    "--- Practice Mode (Coco the conversation partner) ---",
    `The learner is practicing: ${list}.`,
    "Weave them into your replies naturally when fitting. When the learner uses one: praise briefly, correct gently ONLY if wrong, then keep chatting.",
    `Reply mostly in ${replyLang}, but keep the target words in English. Under 120 words per reply.`,
    "--- End Practice Mode ---",
    "",
  ].join("\n");
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Normalize like the quiz grader (case/space/punct blind). */
function normWords(text: string): string {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Which target terms appear in `text` (whole-word / whole-phrase match,
 * order-free for multi-word terms? No — phrase order required, word
 * boundaries required). Returns the matched targets.
 */
export function detectUsage(text: string, targets: PracticeTarget[]): PracticeTarget[] {
  const hay = ` ${normWords(text)} `;
  if (!hay.trim()) return [];
  return targets.filter((t) => {
    const needle = normWords(t.term);
    if (!needle) return false;
    // single word: boundary match; phrase: ordered word sequence match
    const re = new RegExp(`\\b${needle.split(" ").map(escapeReg).join("\\s+")}\\b`);
    return re.test(hay);
  });
}

/** Tap-to-assemble openers. ___ marks where the target word/phrase can go
 * (or just start typing after it). Beginner-safe, no grammar jargon. */
export const STARTERS: string[] = [
  "Yesterday, I ___ because…",
  "I felt ___ when…",
  "My friend always ___ and…",
  "At work today, ___ happened.",
  "If I could, I would ___ tomorrow.",
  "I was surprised that ___ because…",
  "Last weekend, my family and I ___.",
  "Honestly, I think ___ is…",
];

export function loadTargets(): PracticeTarget[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(TARGETS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (x): x is PracticeTarget =>
          !!x && typeof x === "object" && typeof (x as PracticeTarget).term === "string" &&
          (x as PracticeTarget).term.trim() !== "",
      )
      .map((x) => ({
        term: (x as PracticeTarget).term.trim().slice(0, 80),
        meaning: typeof (x as PracticeTarget).meaning === "string"
          ? (x as PracticeTarget).meaning?.slice(0, 160)
          : undefined,
      }))
      .slice(0, MAX_TARGETS);
  } catch {
    return [];
  }
}

export function saveTargets(targets: PracticeTarget[]): void {
  try {
    if (typeof localStorage !== "undefined")
      localStorage.setItem(TARGETS_KEY, JSON.stringify(targets.slice(0, MAX_TARGETS)));
  } catch {
    // best-effort
  }
}

/** Add (deduped by lowercase term). Returns the new list. */
export function addTarget(targets: PracticeTarget[], term: string, meaning?: string): PracticeTarget[] {
  const t = term.trim().slice(0, 80);
  if (!t) return targets;
  if (targets.some((x) => x.term.toLowerCase() === t.toLowerCase())) return targets;
  return [...targets, { term: t, meaning: meaning?.trim().slice(0, 160) }].slice(0, MAX_TARGETS);
}

export function removeTarget(targets: PracticeTarget[], term: string): PracticeTarget[] {
  return targets.filter((x) => x.term.toLowerCase() !== term.toLowerCase());
}
