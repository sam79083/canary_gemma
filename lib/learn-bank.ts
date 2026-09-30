// English Learning Mode — zero-token question banks + rule-based grading.
//
// Design constraints (free-tier safe):
// - No AI calls, no /api calls, no tokens. Everything is static + deterministic.
// - Placement test is FIXED (same 12 Qs) so scores are comparable across days.
// - Daily lesson is deterministic per (date, level) so refresh doesn't reshuffle.
// - Fill-in-the-blank grading is normalized string compare (case/space/punct blind).

export type CEFR = "A1" | "A2" | "B1" | "B2";
export type Skill = "vocab" | "grammar";

export interface BankItem {
  id: string;
  skill: Skill;
  level: CEFR;
  kind: "choice" | "fill";
  /** Question prompt (English). Choices rendered only for kind === "choice". */
  prompt: string;
  choices?: [string, string, string, string];
  answerIndex?: number;
  /** Accepted answers for fill (lowercase compare after normalize). */
  accept?: string[];
  /** Short teacher explanation shown after answering. */
  explain: string;
  /** Vocab word id for SRS tracking (vocab items only). */
  word?: string;
}

export const CEFR_ORDER: CEFR[] = ["A1", "A2", "B1", "B2"];

export function levelRank(l: CEFR): number {
  return CEFR_ORDER.indexOf(l);
}

/** Normalize free-typed answers: case/whitespace/punctuation blind. */
export function normalizeAnswer(s: string): string {
  return (s || "")
    .toLowerCase()
    .trim()
    .replace(/[.!?,'"“”‘’]+/g, "")
    .replace(/\s+/g, " ");
}

export function gradeFill(input: string, accept: string[]): boolean {
  const n = normalizeAnswer(input);
  if (!n) return false;
  return accept.some((a) => normalizeAnswer(a) === n);
}

export function gradeChoice(picked: number, answerIndex: number): boolean {
  return picked === answerIndex;
}

// ---------------------------------------------------------------------------
// Vocab bank: 24 words (6 per level). Meaning shown in prompt for EN→choice,
// distractors are same-level words so guessing is hard.
// ---------------------------------------------------------------------------

const VOCAB: BankItem[] = [
  // A1 — survival words
  { id: "v-a1-1", skill: "vocab", level: "A1", kind: "choice", word: "hungry", prompt: 'What does "hungry" mean?', choices: ["배고픈", "졸린", "아픈", "기쁜"], answerIndex: 0, explain: "hungry = 배고픈. I am hungry → 밥 먹고 싶어요." },
  { id: "v-a1-2", skill: "vocab", level: "A1", kind: "choice", word: "late", prompt: 'What does "late" mean?', choices: ["이른", "늦은", "빠른", "바쁜"], answerIndex: 1, explain: "late = 늦은. Sorry I'm late → 늦어서 미안해요." },
  { id: "v-a1-3", skill: "vocab", level: "A1", kind: "choice", word: "cheap", prompt: 'What does "cheap" mean?', choices: ["비싼", "무거운", "저렴한", "가벼운"], answerIndex: 2, explain: "cheap = 저렴한. Opposite of expensive." },
  { id: "v-a1-4", skill: "vocab", level: "A1", kind: "choice", word: "angry", prompt: 'What does "angry" mean?', choices: ["슬픈", "화난", "피곤한", "긴장한"], answerIndex: 1, explain: "angry = 화난. She was angry about the delay." },
  { id: "v-a1-5", skill: "vocab", level: "A1", kind: "choice", word: "clean", prompt: 'What does "clean" mean?', choices: ["깨끗한", "더러운", "시끄러운", "조용한"], answerIndex: 0, explain: "clean = 깨끗한. Opposite of dirty." },
  { id: "v-a1-6", skill: "vocab", level: "A1", kind: "choice", word: "often", prompt: 'What does "often" mean?', choices: ["절대", "가끔", "자주", "거의 ~않다"], answerIndex: 2, explain: "often = 자주. I often drink coffee." },
  // A2 — everyday words
  { id: "v-a2-1", skill: "vocab", level: "A2", kind: "choice", word: "borrow", prompt: 'Choose the meaning of "borrow".', choices: ["빌리다", "빌려주다", "잃어버리다", "찾다"], answerIndex: 0, explain: "borrow = (남에게서) 빌리다. lend = (남에게) 빌려주다. Pair to remember." },
  { id: "v-a2-2", skill: "vocab", level: "A2", kind: "choice", word: "weather", prompt: 'Choose the meaning of "weather".', choices: ["계절", "날씨", "기후 변화", "온도계"], answerIndex: 1, explain: "weather = 날씨. Whether (…인지 아닌지)와 발음이 같아 헷갈림 주의." },
  { id: "v-a2-3", skill: "vocab", level: "A2", kind: "choice", word: "invite", prompt: 'Choose the meaning of "invite".', choices: ["거절하다", "초대하다", "방문하다", "환영받다"], answerIndex: 1, explain: "invite = 초대하다. I invited her to dinner." },
  { id: "v-a2-4", skill: "vocab", level: "A2", kind: "choice", word: "crowded", prompt: 'Choose the meaning of "crowded".', choices: ["한적한", "붐비는", "넓은", "조용한"], answerIndex: 1, explain: "crowded = 붐비는. The subway was crowded." },
  { id: "v-a2-5", skill: "vocab", level: "A2", kind: "choice", word: "repair", prompt: 'Choose the meaning of "repair".', choices: ["고치다", "망가뜨리다", "교체하다", "청소하다"], answerIndex: 0, explain: "repair = 고치다. = fix." },
  { id: "v-a2-6", skill: "vocab", level: "A2", kind: "choice", word: "proud", prompt: 'Choose the meaning of "proud".', choices: ["부끄러운", "자랑스러운", "걱정되는", "만족한"], answerIndex: 1, explain: "proud = 자랑스러운. proud of ~." },
  // B1 — work/travel words
  { id: "v-b1-1", skill: "vocab", level: "B1", kind: "choice", word: "delay", prompt: 'Choose the meaning of "delay".', choices: ["지연", "취소", "출발", "도착"], answerIndex: 0, explain: "delay = 지연. The flight was delayed 2 hours." },
  { id: "v-b1-2", skill: "vocab", level: "B1", kind: "choice", word: "require", prompt: 'Choose the meaning of "require".', choices: ["요구하다", "거절하다", "제공하다", "허락하다"], answerIndex: 0, explain: "require = 요구하다/필요로 하다. = need (formal)." },
  { id: "v-b1-3", skill: "vocab", level: "B1", kind: "choice", word: "improve", prompt: 'Choose the meaning of "improve".', choices: ["악화시키다", "개선하다", "증명하다", "움직이다"], answerIndex: 1, explain: "improve = 개선하다. I want to improve my English." },
  { id: "v-b1-4", skill: "vocab", level: "B1", kind: "choice", word: "mention", prompt: 'Choose the meaning of "mention".', choices: ["언급하다", "무시하다", "주장하다", "약속하다"], answerIndex: 0, explain: "mention = 언급하다. He mentioned your name." },
  { id: "v-b1-5", skill: "vocab", level: "B1", kind: "choice", word: "ancient", prompt: 'Choose the meaning of "ancient".', choices: ["현대의", "고대의", "최근의", "미래의"], answerIndex: 1, explain: "ancient = 고대의. Ancient Rome." },
  { id: "v-b1-6", skill: "vocab", level: "B1", kind: "choice", word: "honest", prompt: 'Choose the meaning of "honest".', choices: ["정직한", "용감한", "친절한", "성실한"], answerIndex: 0, explain: "honest = 정직한. h가 묵음: /ˈɒnɪst/." },
  // B2 — abstract words
  { id: "v-b2-1", skill: "vocab", level: "B2", kind: "choice", word: "embarrass", prompt: 'Choose the meaning of "embarrass".', choices: ["당황하게 하다", "격려하다", "감동시키다", "놀라게 하다"], answerIndex: 0, explain: "embarrass = 당황/민망하게 하다. embarrassed = 민망한." },
  { id: "v-b2-2", skill: "vocab", level: "B2", kind: "choice", word: "reluctant", prompt: 'Choose the meaning of "reluctant".', choices: ["꺼리는", "열망하는", "확신하는", "만족한"], answerIndex: 0, explain: "reluctant = 꺼리는, 마지못한. reluctant to + 동사." },
  { id: "v-b2-3", skill: "vocab", level: "B2", kind: "choice", word: "precise", prompt: 'Choose the meaning of "precise".', choices: ["모호한", "정확한", "빠른", "값비싼"], answerIndex: 1, explain: "precise = 정확한. Be precise, please." },
  { id: "v-b2-4", skill: "vocab", level: "B2", kind: "choice", word: "tolerate", prompt: 'Choose the meaning of "tolerate".', choices: ["참다", "피하다", "비판하다", "칭찬하다"], answerIndex: 0, explain: "tolerate = 참다/용인하다. I can't tolerate noise." },
  { id: "v-b2-5", skill: "vocab", level: "B2", kind: "choice", word: "brilliant", prompt: 'Choose the meaning of "brilliant".', choices: ["훌륭한", "평범한", "어두운", "지루한"], answerIndex: 0, explain: "brilliant = 훌륭한/눈부신. Brilliant idea!" },
  { id: "v-b2-6", skill: "vocab", level: "B2", kind: "choice", word: "hesitate", prompt: 'Choose the meaning of "hesitate".', choices: ["망설이다", "결심하다", "서두르다", "포기하다"], answerIndex: 0, explain: "hesitate = 망설이다. Don't hesitate to ask." },
];

// ---------------------------------------------------------------------------
// Grammar bank — foreigner pain points: a/an/the, prepositions,
// singular/plural, tense, word order.
// ---------------------------------------------------------------------------

const GRAMMAR_CHOICE: BankItem[] = [
  { id: "g-a1-1", skill: "grammar", level: "A1", kind: "choice", prompt: "She ___ a student.", choices: ["is", "are", "am", "be"], answerIndex: 0, explain: "She (3인칭 단수) + is." },
  { id: "g-a1-2", skill: "grammar", level: "A1", kind: "choice", prompt: "I have ___ apple.", choices: ["a", "an", "the", "—"], answerIndex: 1, explain: "모음 소리 앞에서는 an: an apple." },
  { id: "g-a2-1", skill: "grammar", level: "A2", kind: "choice", prompt: "There ___ two books on the desk.", choices: ["is", "are", "was one", "be"], answerIndex: 1, explain: "주어가 복수(two books) → are." },
  { id: "g-a2-2", skill: "grammar", level: "A2", kind: "choice", prompt: "I have lived here ___ 2020.", choices: ["for", "since", "from now", "until"], answerIndex: 1, explain: "시점(since 2020) vs 기간(for 3 years)." },
  { id: "g-b1-1", skill: "grammar", level: "B1", kind: "choice", prompt: "If it rains, we ___ at home.", choices: ["stay", "will stay", "stayed", "would stay"], answerIndex: 1, explain: "If + 현재, 주절 will (1조건문)." },
  { id: "g-b1-2", skill: "grammar", level: "B1", kind: "choice", prompt: "The report ___ yesterday.", choices: ["finished", "was finished", "has finished", "finishes"], answerIndex: 1, explain: "보고서가 '완성된 것' → 수동태 was finished." },
  { id: "g-b2-1", skill: "grammar", level: "B2", kind: "choice", prompt: "She denied ___ the money.", choices: ["to take", "taking", "take", "taken"], answerIndex: 1, explain: "deny + 동명사(taking). to부정사 불가." },
  { id: "g-b2-2", skill: "grammar", level: "B2", kind: "choice", prompt: "Hardly ___ arrived when it started raining.", choices: ["we had", "had we", "we have", "did we"], answerIndex: 1, explain: "Hardly + 도치: Hardly had we arrived…" },
];

const GRAMMAR_FILL: BankItem[] = [
  { id: "g-a1-3", skill: "grammar", level: "A1", kind: "fill", prompt: "Fill in: I go to school ___ bus. (I go to school ___ bus.)", accept: ["by"], explain: "교통수단 by + 무관사: by bus / by subway." },
  { id: "g-a1-4", skill: "grammar", level: "A1", kind: "fill", prompt: "Fill in: She ___ (go) to work every day.", accept: ["goes"], explain: "3인칭 단수 현재: go → goes." },
  { id: "g-a2-3", skill: "grammar", level: "A2", kind: "fill", prompt: "Fill in: I am interested ___ music.", accept: ["in"], explain: "be interested in ~ (고정 전치사)." },
  { id: "g-a2-4", skill: "grammar", level: "A2", kind: "fill", prompt: "Fill in: There are many ___ (child) in the park.", accept: ["children"], explain: "child → children (불규칙 복수)." },
  { id: "g-b1-3", skill: "grammar", level: "B1", kind: "fill", prompt: "Fill in: I have ___ (never) seen snow.", accept: ["never"], explain: "현재완료 + never: have never seen." },
  { id: "g-b1-4", skill: "grammar", level: "B1", kind: "fill", prompt: "Fill in: He is good ___ cooking.", accept: ["at"], explain: "be good at ~ (고정 전치사)." },
  { id: "g-b2-3", skill: "grammar", level: "B2", kind: "fill", prompt: "Fill in: She asked me ___ I was tired. (…tired ___?)", accept: ["if", "whether"], explain: "간접의문문: if / whether." },
  { id: "g-b2-4", skill: "grammar", level: "B2", kind: "fill", prompt: "Fill in: It was ___ honor to meet you. (a / an)", accept: ["an"], explain: "honor는 h 묵음 → 모음 소리 → an honor." },
];

export const ALL_ITEMS: BankItem[] = [...VOCAB, ...GRAMMAR_CHOICE, ...GRAMMAR_FILL];

/** Fixed placement test: 12 Qs, 3 per level, easiest first. */
export const PLACEMENT_IDS = [
  "v-a1-1", "g-a1-1", "g-a1-3",
  "v-a2-1", "g-a2-1", "g-a2-3",
  "v-b1-1", "g-b1-1", "g-b1-3",
  "v-b2-2", "g-b2-1", "g-b2-3",
];

export function getPlacementTest(): BankItem[] {
  const byId = new Map(ALL_ITEMS.map((i) => [i.id, i]));
  return PLACEMENT_IDS.map((id) => byId.get(id)).filter(
    (x): x is BankItem => Boolean(x),
  );
}

export function scoreToCEFR(score: number, total: number): CEFR {
  const r = total <= 0 ? 0 : score / total;
  if (r >= 0.83) return "B2";
  if (r >= 0.58) return "B1";
  if (r >= 0.33) return "A2";
  return "A1";
}

// --- 30-second self-check ("not sure what my level is?") --------------------
// Ordered can-do statements, easiest first. Doubles as reading practice;
// Korean glosses keep true beginners unblocked. Count-based mapping keeps it
// honest for prefix-checkers and forgiving for spiky profiles.

export interface CanDo {
  id: string;
  level: CEFR;
  en: string;
  ko: string;
}

export const SELF_CHECK: CanDo[] = [
  { id: "s-a1-1", level: "A1", en: "I can introduce myself and say where I live.", ko: "자기소개와 사는 곳 말하기" },
  { id: "s-a1-2", level: "A1", en: "I can order food and ask how much it is.", ko: "음식 주문과 가격 묻기" },
  { id: "s-a2-1", level: "A2", en: "I can describe my weekend using past tense.", ko: "과거형으로 주말 이야기하기" },
  { id: "s-a2-2", level: "A2", en: "I can make plans with a friend.", ko: "친구와 약속 잡기" },
  { id: "s-b1-1", level: "B1", en: "I can explain why I am late and apologize.", ko: "지각 이유 설명과 사과하기" },
  { id: "s-b1-2", level: "B1", en: "I can understand the main points of a news article.", ko: "뉴스 기사의 요점 파악하기" },
  { id: "s-b2-1", level: "B2", en: "I can argue for and against an idea in a meeting.", ko: "회의에서 찬반 주장하기" },
  { id: "s-b2-2", level: "B2", en: "I can understand jokes and sarcasm in movies.", ko: "영화의 농담·빈정거림 알아듣기" },
];

/** Map checked count → CEFR. 0–2 A1, 3–4 A2, 5–6 B1, 7–8 B2. */
export function suggestLevelFromChecks(checkedCount: number): CEFR {
  const n = Math.max(0, Math.floor(checkedCount));
  if (n >= 7) return "B2";
  if (n >= 5) return "B1";
  if (n >= 3) return "A2";
  return "A1";
}

// --- deterministic daily lesson (hash date+level, no RNG state) --------------

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 10-item lesson leveled to the learner: ~60% at-or-below level (core),
 * ~40% one stretch level up (nothing above the learner's head). B2 has no
 * stretch band, so it draws all 10 from core. Deterministic per day, so a
 * refresh keeps the same set. Zero-token.
 */
export function buildDailyLesson(dateStr: string, level: CEFR | null): BankItem[] {
  const lv = levelRank(level ?? "A1");
  const core = ALL_ITEMS.filter((i) => levelRank(i.level) <= lv);
  const stretch = ALL_ITEMS.filter((i) => levelRank(i.level) === lv + 1);
  const coreVocab = core.filter((i) => i.skill === "vocab");
  const coreGrammar = core.filter((i) => i.skill === "grammar");
  const stretchVocab = stretch.filter((i) => i.skill === "vocab");
  const stretchGrammar = stretch.filter((i) => i.skill === "grammar");
  const h = hashStr(`${dateStr}|${level ?? "A1"}`);
  const out: BankItem[] = [];
  const used = new Set<string>();
  const pick = (arr: BankItem[], salt: number): BankItem | null => {
    if (arr.length === 0) return null;
    for (let k = 0; k < arr.length; k++) {
      const cand = arr[(h + salt * 7 + k * 3) % arr.length];
      if (!used.has(cand.id)) return cand;
    }
    return null;
  };
  for (let slot = 0; slot < 10; slot++) {
    // Slots 0–5 core, 6–9 stretch; even slots prefer vocab, odd prefer grammar.
    const band = slot < 6 ? "core" : "stretch";
    const preferVocab = slot % 2 === 0;
    const first =
      band === "core"
        ? preferVocab
          ? coreVocab
          : coreGrammar
        : preferVocab
          ? stretchVocab
          : stretchGrammar;
    const second =
      band === "core"
        ? preferVocab
          ? coreGrammar
          : coreVocab
        : preferVocab
          ? stretchGrammar
          : stretchVocab;
    // Fall back across bands/skills so small bands (B2 core excepted) still
    // fill 10 unique items instead of short-changing the lesson.
    const item =
      pick(first, slot) ??
      pick(second, slot) ??
      pick(preferVocab ? coreVocab : coreGrammar, slot) ??
      pick(preferVocab ? coreGrammar : coreVocab, slot) ??
      pick(preferVocab ? stretchVocab : stretchGrammar, slot) ??
      pick(preferVocab ? stretchGrammar : stretchVocab, slot);
    if (!item) break;
    used.add(item.id);
    out.push(item);
  }
  return out;
}
