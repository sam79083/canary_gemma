// English Learning Mode — zero-token question banks + rule-based grading.
//
// Design constraints (free-tier safe):
// - No AI calls, no /api calls, no tokens. Everything is static + deterministic.
// - Placement test is FIXED (same 12 Qs) so scores are comparable across days.
// - Daily lesson is deterministic per (date, level) so refresh doesn't reshuffle.
// - Fill-in-the-blank grading is normalized string compare (case/space/punct blind).

export type CEFR = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type Skill = "vocab" | "grammar" | "reading" | "writing";

export interface BankItem {
  id: string;
  skill: Skill;
  level: CEFR;
  kind: "choice" | "fill";
  /** Question prompt (English). Choices rendered only for kind === "choice". */
  prompt: string;
  choices?: string[];
  answerIndex?: number;
  /** Accepted answers for fill (lowercase compare after normalize). */
  accept?: string[];
  /** Exam-style reading passage shown above the question (TOEIC/TOEFL/IELTS). */
  passage?: string;
  /** Short teacher explanation shown after answering. */
  explain: string;
  /** Vocab word id for SRS tracking (vocab items only). */
  word?: string;
}

export const CEFR_ORDER: CEFR[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

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
  { id: "v-a1-7", skill: "vocab", level: "A1", kind: "choice", word: "sleepy", prompt: 'What does "sleepy" mean?', choices: ["배고픈", "졸린", "바쁜", "신나는"], answerIndex: 1, explain: "sleepy = 졸린. The baby looks sleepy." },
  { id: "v-a1-8", skill: "vocab", level: "A1", kind: "choice", word: "thirsty", prompt: 'What does "thirsty" mean?', choices: ["배부른", "목마른", "피곤한", "추운"], answerIndex: 1, explain: "thirsty = 목마른. Pair: hungry (배고픈) / thirsty (목마른)." },
  { id: "v-a1-9", skill: "vocab", level: "A1", kind: "choice", word: "cloudy", prompt: 'What does "cloudy" mean?', choices: ["맑은", "흐린", "더운", "추운"], answerIndex: 1, explain: "cloudy = 흐린. It's cloudy today." },
  { id: "v-a1-10", skill: "vocab", level: "A1", kind: "choice", word: "windy", prompt: 'What does "windy" mean?', choices: ["바람 부는", "비 오는", "눈 오는", "안개 낀"], answerIndex: 0, explain: "windy = 바람 부는. It's windy — take a jacket." },
  { id: "v-a1-11", skill: "vocab", level: "A1", kind: "choice", word: "ready", prompt: 'What does "ready" mean?', choices: ["준비된", "늦은", "바쁜", "피곤한"], answerIndex: 0, explain: "ready = 준비된. Are you ready?" },
  { id: "v-a1-12", skill: "vocab", level: "A1", kind: "choice", word: "delicious", prompt: 'What does "delicious" mean?', choices: ["맛없는", "맛있는", "매운", "짠"], answerIndex: 1, explain: "delicious = 맛있는. This cake is delicious!" },
  // A2 — everyday words
  { id: "v-a2-1", skill: "vocab", level: "A2", kind: "choice", word: "borrow", prompt: 'Choose the meaning of "borrow".', choices: ["빌리다", "빌려주다", "잃어버리다", "찾다"], answerIndex: 0, explain: "borrow = (남에게서) 빌리다. lend = (남에게) 빌려주다. Pair to remember." },
  { id: "v-a2-2", skill: "vocab", level: "A2", kind: "choice", word: "weather", prompt: 'Choose the meaning of "weather".', choices: ["계절", "날씨", "기후 변화", "온도계"], answerIndex: 1, explain: "weather = 날씨. Whether (…인지 아닌지)와 발음이 같아 헷갈림 주의." },
  { id: "v-a2-3", skill: "vocab", level: "A2", kind: "choice", word: "invite", prompt: 'Choose the meaning of "invite".', choices: ["거절하다", "초대하다", "방문하다", "환영받다"], answerIndex: 1, explain: "invite = 초대하다. I invited her to dinner." },
  { id: "v-a2-4", skill: "vocab", level: "A2", kind: "choice", word: "crowded", prompt: 'Choose the meaning of "crowded".', choices: ["한적한", "붐비는", "넓은", "조용한"], answerIndex: 1, explain: "crowded = 붐비는. The subway was crowded." },
  { id: "v-a2-5", skill: "vocab", level: "A2", kind: "choice", word: "repair", prompt: 'Choose the meaning of "repair".', choices: ["고치다", "망가뜨리다", "교체하다", "청소하다"], answerIndex: 0, explain: "repair = 고치다. = fix." },
  { id: "v-a2-6", skill: "vocab", level: "A2", kind: "choice", word: "proud", prompt: 'Choose the meaning of "proud".', choices: ["부끄러운", "자랑스러운", "걱정되는", "만족한"], answerIndex: 1, explain: "proud = 자랑스러운. proud of ~." },
  { id: "v-a2-7", skill: "vocab", level: "A2", kind: "choice", word: "journey", prompt: 'Choose the meaning of "journey".', choices: ["여행 (과정)", "가구", "날씨", "소음"], answerIndex: 0, explain: "journey = 여행, 여정. a long journey home." },
  { id: "v-a2-8", skill: "vocab", level: "A2", kind: "choice", word: "habit", prompt: 'Choose the meaning of "habit".', choices: ["취미", "습관", "약속", "충고"], answerIndex: 1, explain: "habit = 습관. a bad habit." },
  { id: "v-a2-9", skill: "vocab", level: "A2", kind: "choice", word: "opinion", prompt: 'Choose the meaning of "opinion".', choices: ["사실", "의견", "소문", "농담"], answerIndex: 1, explain: "opinion = 의견. in my opinion = 내 생각엔." },
  { id: "v-a2-10", skill: "vocab", level: "A2", kind: "choice", word: "choice", prompt: 'Choose the meaning of "choice".', choices: ["선택", "기회", "의무", "실수"], answerIndex: 0, explain: "choice = 선택. a difficult choice." },
  { id: "v-a2-11", skill: "vocab", level: "A2", kind: "choice", word: "souvenir", prompt: 'Choose the meaning of "souvenir".', choices: ["기념품", "장난감", "보석", "골동품"], answerIndex: 0, explain: "souvenir = 기념품. I bought a souvenir." },
  { id: "v-a2-12", skill: "vocab", level: "A2", kind: "choice", word: "experience", prompt: 'Choose the meaning of "experience".', choices: ["실험", "경험", "모험", "사건"], answerIndex: 1, explain: "experience = 경험. experiment = 실험. Deadly pair — don't mix them!" },
  // B1 — work/travel words
  { id: "v-b1-1", skill: "vocab", level: "B1", kind: "choice", word: "delay", prompt: 'Choose the meaning of "delay".', choices: ["지연", "취소", "출발", "도착"], answerIndex: 0, explain: "delay = 지연. The flight was delayed 2 hours." },
  { id: "v-b1-2", skill: "vocab", level: "B1", kind: "choice", word: "require", prompt: 'Choose the meaning of "require".', choices: ["요구하다", "거절하다", "제공하다", "허락하다"], answerIndex: 0, explain: "require = 요구하다/필요로 하다. = need (formal)." },
  { id: "v-b1-3", skill: "vocab", level: "B1", kind: "choice", word: "improve", prompt: 'Choose the meaning of "improve".', choices: ["악화시키다", "개선하다", "증명하다", "움직이다"], answerIndex: 1, explain: "improve = 개선하다. I want to improve my English." },
  { id: "v-b1-4", skill: "vocab", level: "B1", kind: "choice", word: "mention", prompt: 'Choose the meaning of "mention".', choices: ["언급하다", "무시하다", "주장하다", "약속하다"], answerIndex: 0, explain: "mention = 언급하다. He mentioned your name." },
  { id: "v-b1-5", skill: "vocab", level: "B1", kind: "choice", word: "ancient", prompt: 'Choose the meaning of "ancient".', choices: ["현대의", "고대의", "최근의", "미래의"], answerIndex: 1, explain: "ancient = 고대의. Ancient Rome." },
  { id: "v-b1-6", skill: "vocab", level: "B1", kind: "choice", word: "honest", prompt: 'Choose the meaning of "honest".', choices: ["정직한", "용감한", "친절한", "성실한"], answerIndex: 0, explain: "honest = 정직한. h가 묵음: /ˈɒnɪst/." },
  { id: "v-b1-7", skill: "vocab", level: "B1", kind: "choice", word: "consider", prompt: 'Choose the meaning of "consider".', choices: ["고려하다", "무시하다", "의심하다", "거절하다"], answerIndex: 0, explain: "consider = 고려하다. Consider all options." },
  { id: "v-b1-8", skill: "vocab", level: "B1", kind: "choice", word: "allow", prompt: 'Choose the meaning of "allow".', choices: ["금지하다", "허락하다", "강제하다", "설득하다"], answerIndex: 1, explain: "allow = 허락하다. allow + 목적어 + to부정사." },
  { id: "v-b1-9", skill: "vocab", level: "B1", kind: "choice", word: "depend", prompt: 'Choose the meaning of "depend".', choices: ["독립하다", "의존하다", "반대하다", "극복하다"], answerIndex: 1, explain: "depend = 의존하다. depend on ~ (전치사 on 고정)." },
  { id: "v-b1-10", skill: "vocab", level: "B1", kind: "choice", word: "achieve", prompt: 'Choose the meaning of "achieve".', choices: ["잃다", "피하다", "이루다", "숨기다"], answerIndex: 2, explain: "achieve = 이루다. achieve a goal." },
  { id: "v-b1-11", skill: "vocab", level: "B1", kind: "choice", word: "discover", prompt: 'Choose the meaning of "discover".', choices: ["발명하다", "발견하다", "숨기다", "예측하다"], answerIndex: 1, explain: "discover = 발견하다. invent = 발명하다. Pair!" },
  { id: "v-b1-12", skill: "vocab", level: "B1", kind: "choice", word: "invent", prompt: 'Choose the meaning of "invent".', choices: ["발견하다", "발명하다", "투자하다", "초대하다"], answerIndex: 1, explain: "invent = 발명하다. Edison invented the light bulb." },
  // B2 — abstract words
  { id: "v-b2-1", skill: "vocab", level: "B2", kind: "choice", word: "embarrass", prompt: 'Choose the meaning of "embarrass".', choices: ["당황하게 하다", "격려하다", "감동시키다", "놀라게 하다"], answerIndex: 0, explain: "embarrass = 당황/민망하게 하다. embarrassed = 민망한." },
  { id: "v-b2-2", skill: "vocab", level: "B2", kind: "choice", word: "reluctant", prompt: 'Choose the meaning of "reluctant".', choices: ["꺼리는", "열망하는", "확신하는", "만족한"], answerIndex: 0, explain: "reluctant = 꺼리는, 마지못한. reluctant to + 동사." },
  { id: "v-b2-3", skill: "vocab", level: "B2", kind: "choice", word: "precise", prompt: 'Choose the meaning of "precise".', choices: ["모호한", "정확한", "빠른", "값비싼"], answerIndex: 1, explain: "precise = 정확한. Be precise, please." },
  { id: "v-b2-4", skill: "vocab", level: "B2", kind: "choice", word: "tolerate", prompt: 'Choose the meaning of "tolerate".', choices: ["참다", "피하다", "비판하다", "칭찬하다"], answerIndex: 0, explain: "tolerate = 참다/용인하다. I can't tolerate noise." },
  { id: "v-b2-5", skill: "vocab", level: "B2", kind: "choice", word: "brilliant", prompt: 'Choose the meaning of "brilliant".', choices: ["훌륭한", "평범한", "어두운", "지루한"], answerIndex: 0, explain: "brilliant = 훌륭한/눈부신. Brilliant idea!" },
  { id: "v-b2-6", skill: "vocab", level: "B2", kind: "choice", word: "hesitate", prompt: 'Choose the meaning of "hesitate".', choices: ["망설이다", "결심하다", "서두르다", "포기하다"], answerIndex: 0, explain: "hesitate = 망설이다. Don't hesitate to ask." },
  // B2+ — precise, formal-leaning words (the jump from "knowing" to "using")
  { id: "v-b2-7", skill: "vocab", level: "B2", kind: "choice", word: "meticulous", prompt: 'Choose the meaning of "meticulous".', choices: ["모호한", "관대한", "꼼꼼한", "성급한"], answerIndex: 2, explain: "meticulous = extremely careful about details. She keeps meticulous records." },
  { id: "v-b2-8", skill: "vocab", level: "B2", kind: "choice", word: "candid", prompt: 'Choose the meaning of "candid".', choices: ["비밀스러운", "솔직한", "냉담한", "겸손한"], answerIndex: 1, explain: "candid = frank, honest. Bonus: a candid photo = 포즈 안 취한 자연스러운 사진." },
  { id: "v-b2-9", skill: "vocab", level: "B2", kind: "choice", word: "thrive", prompt: 'Choose the meaning of "thrive".', choices: ["고생하다", "번창하다", "사라지다", "정체되다"], answerIndex: 1, explain: "thrive = 번창하다, 잘 자라다. Plants thrive in sunlight." },
  { id: "v-b2-10", skill: "vocab", level: "B2", kind: "choice", word: "deter", prompt: 'Choose the meaning of "deter".', choices: ["격려하다", "단념시키다", "가속하다", "무시하다"], answerIndex: 1, explain: "deter = 막다, 단념시키다. High prices deter buyers." },
  { id: "v-b2-11", skill: "vocab", level: "B2", kind: "choice", word: "vivid", prompt: 'Choose the meaning of "vivid".', choices: ["흐릿한", "생생한", "시끄러운", "은은한"], answerIndex: 1, explain: "vivid = 생생한. a vivid imagination / vivid colors." },
  { id: "v-b2-12", skill: "vocab", level: "B2", kind: "choice", word: "amend", prompt: 'Choose the meaning of "amend".', choices: ["수정하다", "파기하다", "비난하다", "칭찬하다"], answerIndex: 0, explain: "amend = 수정하다 (formal: laws, reports). I amended the report." },
  { id: "v-b2-13", skill: "vocab", level: "B2", kind: "choice", word: "inevitable", prompt: 'Choose the meaning of "inevitable".', choices: ["피할 수 없는", "논쟁적인", "실행 가능한", "심오한"], answerIndex: 0, explain: "inevitable = 피할 수 없는. Death and taxes are inevitable." },
  { id: "v-b2-14", skill: "vocab", level: "B2", kind: "choice", word: "controversial", prompt: 'Choose the meaning of "controversial".', choices: ["보편적인", "논쟁적인", "중립적인", "전통적인"], answerIndex: 1, explain: "controversial = 논쟁을 부르는. a controversial decision." },
  { id: "v-b2-15", skill: "vocab", level: "B2", kind: "choice", word: "feasible", prompt: 'Choose the meaning of "feasible".', choices: ["불가능한", "실행 가능한", "유연한", "희박한"], answerIndex: 1, explain: "feasible = 실행 가능한. Is it feasible?" },
  { id: "v-b2-16", skill: "vocab", level: "B2", kind: "choice", word: "profound", prompt: 'Choose the meaning of "profound".', choices: ["얕은", "심오한", "시끄러운", "급격한"], answerIndex: 1, explain: "profound = 심오한, 깊은. a profound impact." },
  // C1 — abstract, academic, news-level words
  { id: "v-c1-1", skill: "vocab", level: "C1", kind: "choice", word: "ubiquitous", prompt: 'Choose the meaning of "ubiquitous".', choices: ["희귀한", "어디에나 있는", "값비싼", "일시적인"], answerIndex: 1, explain: "ubiquitous = 어디에나 있는. Smartphones are ubiquitous." },
  { id: "v-c1-2", skill: "vocab", level: "C1", kind: "choice", word: "pragmatic", prompt: 'Choose the meaning of "pragmatic".', choices: ["이상적인", "실용적인", "감정적인", "이론적인"], answerIndex: 1, explain: "pragmatic = 실용적인. Opposite of idealistic." },
  { id: "v-c1-3", skill: "vocab", level: "C1", kind: "choice", word: "complacent", prompt: 'Choose the meaning of "complacent".', choices: ["겸손한", "불안한", "자기만족에 빠진", "열정적인"], answerIndex: 2, explain: "complacent = 자기만족에 빠져 방심한. Don't get complacent after one win." },
  { id: "v-c1-4", skill: "vocab", level: "C1", kind: "choice", word: "exacerbate", prompt: 'Choose the meaning of "exacerbate".', choices: ["완화하다", "악화시키다", "무시하다", "증명하다"], answerIndex: 1, explain: "exacerbate = 악화시키다 (formal). Cuts exacerbated the crisis." },
  { id: "v-c1-5", skill: "vocab", level: "C1", kind: "choice", word: "quintessential", prompt: 'Choose the meaning of "quintessential".', choices: ["이례적인", "전형적인", "모호한", "사소한"], answerIndex: 1, explain: "quintessential = 가장 전형적인. the quintessential Seoul cafe." },
  { id: "v-c1-6", skill: "vocab", level: "C1", kind: "choice", word: "nonchalant", prompt: 'Choose the meaning of "nonchalant".', choices: ["무심한", "신경질적인", "열광적인", "정중한"], answerIndex: 0, explain: "nonchalant = 태연하고 무심한. He gave a nonchalant shrug." },
  { id: "v-c1-7", skill: "vocab", level: "C1", kind: "choice", word: "scrutinize", prompt: 'Choose the meaning of "scrutinize".', choices: ["흘겨보다", "면밀히 조사하다", "칭찬하다", "용서하다"], answerIndex: 1, explain: "scrutinize = 면밀히 뜯어보다. Auditors scrutinized the books." },
  { id: "v-c1-8", skill: "vocab", level: "C1", kind: "choice", word: "superfluous", prompt: 'Choose the meaning of "superfluous".', choices: ["필수적인", "불필요한", "풍부한", "정확한"], answerIndex: 1, explain: "superfluous = 불필요한, 여분의. Cut the superfluous adjectives." },
  { id: "v-c1-9", skill: "vocab", level: "C1", kind: "choice", word: "ephemeral", prompt: 'Choose the meaning of "ephemeral".', choices: ["영원한", "덧없는", "모호한", "강렬한"], answerIndex: 1, explain: "ephemeral = 덧없는. Fame is ephemeral." },
  { id: "v-c1-10", skill: "vocab", level: "C1", kind: "choice", word: "resilient", prompt: 'Choose the meaning of "resilient".', choices: ["연약한", "회복력 있는", "고집스러운", "민감한"], answerIndex: 1, explain: "resilient = 회복력 있는. resilient kids." },
  { id: "v-c1-11", skill: "vocab", level: "C1", kind: "choice", word: "altruistic", prompt: 'Choose the meaning of "altruistic".', choices: ["이기적인", "이타적인", "낙관적인", "비관적인"], answerIndex: 1, explain: "altruistic = 이타적인. Opposite of selfish." },
  { id: "v-c1-12", skill: "vocab", level: "C1", kind: "choice", word: "nostalgia", prompt: 'Choose the meaning of "nostalgia".', choices: ["불안", "그리움", "분노", "환희"], answerIndex: 1, explain: "nostalgia = (지난 시절에 대한) 그리움. a sense of nostalgia." },
  // C2 — exam-grade academic words (TOEFL/IELTS territory)
  { id: "v-c2-1", skill: "vocab", level: "C2", kind: "choice", word: "anomaly", prompt: 'Choose the meaning of "anomaly".', choices: ["정상", "이상(변이)", "평균", "모범"], answerIndex: 1, explain: "anomaly = 이상, 변칙. Scientists investigated the anomaly." },
  { id: "v-c2-2", skill: "vocab", level: "C2", kind: "choice", word: "conundrum", prompt: 'Choose the meaning of "conundrum".', choices: ["난제", "음모", "기회", "결론"], answerIndex: 0, explain: "conundrum = 난제, 수수께끼. an ethical conundrum." },
  { id: "v-c2-3", skill: "vocab", level: "C2", kind: "choice", word: "dichotomy", prompt: 'Choose the meaning of "dichotomy".', choices: ["조화", "이분법", "모순", "유사성"], answerIndex: 1, explain: "dichotomy = 이분법. the dichotomy between work and life." },
  { id: "v-c2-4", skill: "vocab", level: "C2", kind: "choice", word: "incongruous", prompt: 'Choose the meaning of "incongruous".', choices: ["어울리지 않는", "조화로운", "분명한", "일시적인"], answerIndex: 0, explain: "incongruous = 어울리지 않는. an incongruous modern tower in the old town." },
  { id: "v-c2-5", skill: "vocab", level: "C2", kind: "choice", word: "laconic", prompt: 'Choose the meaning of "laconic".', choices: ["수다스러운", "과묵한", "감정적인", "모호한"], answerIndex: 1, explain: "laconic = 과묵한. a laconic reply: 'Fine.'" },
  { id: "v-c2-6", skill: "vocab", level: "C2", kind: "choice", word: "magnanimous", prompt: 'Choose the meaning of "magnanimous".', choices: ["인색한", "관대한", "교만한", "소심한"], answerIndex: 1, explain: "magnanimous = (패자에게도) 관대한. a magnanimous winner." },
  { id: "v-c2-7", skill: "vocab", level: "C2", kind: "choice", word: "obfuscate", prompt: 'Choose the meaning of "obfuscate".', choices: ["명확히 하다", "모호하게 하다", "반박하다", "지지하다"], answerIndex: 1, explain: "obfuscate = 모호하게 하다. Politicians obfuscate the issue." },
  { id: "v-c2-8", skill: "vocab", level: "C2", kind: "choice", word: "tenacious", prompt: 'Choose the meaning of "tenacious".', choices: ["끈질긴", "나약한", "신중한", "충동적인"], answerIndex: 0, explain: "tenacious = 끈질긴. tenacious journalists uncovered the scandal." },
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
  { id: "g-b2-5", skill: "grammar", level: "B2", kind: "choice", prompt: "I suggested he ___ a doctor.", choices: ["sees", "see", "saw", "will see"], answerIndex: 1, explain: "suggest/insist/demand + (that) + 동사원형 (가정법 현재)." },
  { id: "g-b2-6", skill: "grammar", level: "B2", kind: "choice", prompt: "Never ___ such beauty.", choices: ["I saw", "have I seen", "I have seen", "did I saw"], answerIndex: 1, explain: "문두 부정어 + 도치: Never have I seen…" },
  // C1 — inversion, subjunctive, formal structures
  { id: "g-c1-1", skill: "grammar", level: "C1", kind: "choice", prompt: "Scarcely ___ home when the phone rang.", choices: ["I arrived", "had I arrived", "I had arrived", "did I arrive"], answerIndex: 1, explain: "Scarcely + 도치 (had + 주어 + 과거분사)." },
  { id: "g-c1-2", skill: "grammar", level: "C1", kind: "choice", prompt: "Not only ___ late, but he forgot the files.", choices: ["he was", "was he", "he is", "is he"], answerIndex: 1, explain: "Not only + 도치: Not only was he late…" },
  { id: "g-c1-3", skill: "grammar", level: "C1", kind: "choice", prompt: "It is imperative that everyone ___ silent.", choices: ["is", "remains", "remain", "remained"], answerIndex: 2, explain: "imperative/essential + that + 동사원형 (formal subjunctive)." },
  { id: "g-c1-4", skill: "grammar", level: "C1", kind: "choice", prompt: "No sooner ___ than she regretted it.", choices: ["she spoke", "she had spoken", "had she spoken", "has she spoken"], answerIndex: 2, explain: "No sooner + 도치: No sooner had she spoken…" },
  // C2 — conditionals and subjunctives at exam difficulty
  { id: "g-c2-1", skill: "grammar", level: "C2", kind: "choice", prompt: "But for your help, we ___ failed.", choices: ["will have", "would have", "had", "have"], answerIndex: 1, explain: "But for + 명사, would have p.p. (= If it had not been for…)." },
  { id: "g-c2-2", skill: "grammar", level: "C2", kind: "choice", prompt: "___ it not been for the storm, we would have left.", choices: ["Had", "Was", "If", "Has"], answerIndex: 0, explain: "도치 가정법: Had it not been for… (If 생략)." },
  { id: "g-c2-3", skill: "grammar", level: "C2", kind: "choice", prompt: "He speaks as though he ___ everything.", choices: ["knows", "knew", "had known", "will know"], answerIndex: 1, explain: "as though + 과거 (사실과 반대되는 현재 가정)." },
  { id: "g-c2-4", skill: "grammar", level: "C2", kind: "choice", prompt: "So ___ was she that she couldn't speak.", choices: ["absorbed", "absorbing", "absorb", "to absorb"], answerIndex: 0, explain: "So + 형용사 + be동사 + that: So absorbed was she…" },
];

const GRAMMAR_FILL: BankItem[] = [  { id: "g-a1-3", skill: "grammar", level: "A1", kind: "fill", prompt: "Fill in: I go to school ___ bus. (I go to school ___ bus.)", accept: ["by"], explain: "교통수단 by + 무관사: by bus / by subway." },
  { id: "g-a1-4", skill: "grammar", level: "A1", kind: "fill", prompt: "Fill in: She ___ (go) to work every day.", accept: ["goes"], explain: "3인칭 단수 현재: go → goes." },
  { id: "g-a1-5", skill: "grammar", level: "A1", kind: "choice", prompt: "They ___ my friends.", choices: ["is", "are", "am", "be"], answerIndex: 1, explain: "They (복수) + are." },
  { id: "g-a1-6", skill: "grammar", level: "A1", kind: "choice", prompt: "___ you ready?", choices: ["Is", "Are", "Am", "Does"], answerIndex: 1, explain: "you + Are. Are you ready?" },
  { id: "g-a1-7", skill: "grammar", level: "A1", kind: "fill", prompt: "Fill in: They ___ (play) soccer every Sunday.", accept: ["play"], explain: "They (복수) → 동사원형 그대로." },
  { id: "g-a1-8", skill: "grammar", level: "A1", kind: "fill", prompt: "Fill in: He ___ (watch) TV every night.", accept: ["watches"], explain: "he + watch → watches (ch 앞 es)." },
  { id: "g-a2-3", skill: "grammar", level: "A2", kind: "fill", prompt: "Fill in: I am interested ___ music.", accept: ["in"], explain: "be interested in ~ (고정 전치사)." },
  { id: "g-a2-4", skill: "grammar", level: "A2", kind: "fill", prompt: "Fill in: There are many ___ (child) in the park.", accept: ["children"], explain: "child → children (불규칙 복수)." },
  { id: "g-a2-5", skill: "grammar", level: "A2", kind: "choice", prompt: "This book is ___ than that one.", choices: ["interesting", "more interesting", "most interesting", "interestinger"], answerIndex: 1, explain: "긴 형용사 비교급: more + 형용사." },
  { id: "g-a2-6", skill: "grammar", level: "A2", kind: "choice", prompt: "Mt. Everest is the ___ mountain in the world.", choices: ["high", "higher", "highest", "more high"], answerIndex: 2, explain: "최상급 + the: the highest." },
  { id: "g-a2-7", skill: "grammar", level: "A2", kind: "fill", prompt: "Fill in: She is ___ (tall) than her sister.", accept: ["taller"], explain: "짧은 형용사 비교급: tall → taller." },
  { id: "g-a2-8", skill: "grammar", level: "A2", kind: "fill", prompt: "Fill in: This is the ___ (good) coffee in town.", accept: ["best"], explain: "불규칙: good → best." },
  { id: "g-b1-3", skill: "grammar", level: "B1", kind: "fill", prompt: "Fill in: I have ___ (never) seen snow.", accept: ["never"], explain: "현재완료 + never: have never seen." },
  { id: "g-b1-4", skill: "grammar", level: "B1", kind: "fill", prompt: "Fill in: He is good ___ cooking.", accept: ["at"], explain: "be good at ~ (고정 전치사)." },
  { id: "g-b1-5", skill: "grammar", level: "B1", kind: "choice", prompt: "I have ___ finished my homework.", choices: ["yet", "just", "ever", "since"], answerIndex: 1, explain: "'방금' 완료: have just + 과거분사." },
  { id: "g-b1-6", skill: "grammar", level: "B1", kind: "choice", prompt: "Have you ___ been to Japan?", choices: ["never", "ever", "just", "since"], answerIndex: 1, explain: "의문문 경험: Have you ever…?" },
  { id: "g-b1-7", skill: "grammar", level: "B1", kind: "fill", prompt: "Fill in: She has ___ (live) here since 2020.", accept: ["lived"], explain: "현재완료 + since: has lived." },
  { id: "g-b1-8", skill: "grammar", level: "B1", kind: "fill", prompt: "Fill in: They have known each other ___ 2010. (since / for)", accept: ["since"], explain: "시점 since 2010 (for는 기간: for 5 years)." },
  { id: "g-b2-3", skill: "grammar", level: "B2", kind: "fill", prompt: "Fill in: She asked me ___ I was tired. (…tired ___?)", accept: ["if", "whether"], explain: "간접의문문: if / whether." },
  { id: "g-b2-4", skill: "grammar", level: "B2", kind: "fill", prompt: "Fill in: It was ___ honor to meet you. (a / an)", accept: ["an"], explain: "honor는 h 묵음 → 모음 소리 → an honor." },
  { id: "g-b2-7", skill: "grammar", level: "B2", kind: "fill", prompt: "Fill in: ___ (exhaust) by the trip, she went straight to bed.", accept: ["exhausted"], explain: "분사구문: '지친' 수동 의미 → 과거분사 exhausted." },
  { id: "g-b2-8", skill: "grammar", level: "B2", kind: "fill", prompt: "Fill in: If you had told me, I ___ (help) you.", accept: ["would have helped", "wouldve helped"], explain: "가정법 과거완료: If + had p.p., would have p.p." },
  { id: "g-b2-9", skill: "grammar", level: "B2", kind: "choice", prompt: "The book ___ I bought yesterday is great.", choices: ["who", "which", "whose", "whom"], answerIndex: 1, explain: "사물 선행사: which (that도 가능)." },
  { id: "g-b2-10", skill: "grammar", level: "B2", kind: "fill", prompt: "Fill in: It was John who ___ (break) the window.", accept: ["broke"], explain: "강조구문 + 과거 시제: who broke." },
  // C1 — mixed conditionals, wishes, future perfect
  { id: "g-c1-5", skill: "grammar", level: "C1", kind: "fill", prompt: "Fill in: ___ I known, I would have acted. (Had / If)", accept: ["had"], explain: "가정법 도치: Had I known = If I had known." },
  { id: "g-c1-6", skill: "grammar", level: "C1", kind: "fill", prompt: "Fill in: I wish I ___ (study) harder in school.", accept: ["had studied"], explain: "과거에 대한 후회: wish + 과거완료." },
  { id: "g-c1-7", skill: "grammar", level: "C1", kind: "fill", prompt: "Fill in: By this time tomorrow, the workers ___ (finish) the job.", accept: ["will have finished"], explain: "미래완료: will have + 과거분사." },
  { id: "g-c1-8", skill: "grammar", level: "C1", kind: "fill", prompt: "Fill in: Hardly had we ___ (begin) when it rained.", accept: ["begun"], explain: "Hardly + had + 과거분사: begin → begun." },
  { id: "g-c1-9", skill: "grammar", level: "C1", kind: "fill", prompt: "Fill in: Having ___ (finish) his work, he went home.", accept: ["finished"], explain: "완료 분사구문: Having + 과거분사." },
  { id: "g-c1-10", skill: "grammar", level: "C1", kind: "fill", prompt: "Fill in: Little ___ (I know) the truth back then. (did / do)", accept: ["did"], explain: "Little + 도치 + 과거: Little did I know." },
  { id: "g-c2-5", skill: "grammar", level: "C2", kind: "fill", prompt: "Fill in: So ___ (absorb) was he that he missed dinner.", accept: ["absorbed"], explain: "So + 과거분사형용사 + be동사 + that." },
  { id: "g-c2-6", skill: "grammar", level: "C2", kind: "fill", prompt: "Fill in: Were she ___ (inform) earlier, she would have come.", accept: ["informed"], explain: "Were + 주어 + 과거분사 (가정법 과거완료의 도치)." },
  { id: "g-c2-7", skill: "grammar", level: "C2", kind: "fill", prompt: "Fill in: ___ as they might, they couldn't solve it. (Try / Tried)", accept: ["try"], explain: "양보 도치: Try as they might (= Although they tried hard)." },
  { id: "g-c2-8", skill: "grammar", level: "C2", kind: "fill", prompt: "Fill in: Never before ___ (I witness) such courage. (use 3 words)", accept: ["had i witnessed"], explain: "Never + 도치 + 과거완료: Never before had I witnessed…" },
];

// ---------------------------------------------------------------------------
// Exam arena (C2) — original TOEIC / TOEFL / IELTS-style passages.
// Each question carries its passage so items survive shuffling. Skill is
// "reading": tracked separately in learn-store.
// ---------------------------------------------------------------------------

const P_TOEIC = `To: All Staff
From: Facilities Team
Date: September 30
Subject: 5th-floor renovation (Oct 6–17)

The fifth floor will close for renovation from October 6 to 17. During this period, all 5th-floor teams will work from temporary desks on the 3rd floor, available starting October 3. Noisy construction work is restricted to 12:00–14:00 daily. The 5th-floor kitchen will be closed; please use the 3rd-floor kitchen via stairwell B. A phased reopening begins October 20. Direct questions to facilities@example.com.`;

const P_TOEFL = `Bioluminescence — the production of light by living organisms — is widespread in the deep sea, where sunlight never reaches. One common strategy is counterillumination: animals such as the lanternfish produce light on their undersides that matches the faint glow from above, erasing their silhouette and eluding predators hunting from below. The chemistry relies on luciferin, a molecule that emits light when oxidized. Remarkably, many species cannot synthesize luciferin themselves and must acquire it through their diet, which suggests that deep-sea food webs are linked by the exchange of light-producing chemicals as well as nutrients.`;

const P_IELTS = `Urban beekeeping has grown rapidly over the past decade. Rooftop hives now appear on offices and apartments across major cities, and several municipalities that once banned the practice have lifted their restrictions. Advocates argue that cities offer bees a longer foraging season: parks, balconies, and gardens bloom in succession from spring to autumn. Critics counter that too many hives in one district can strain local flowers, and some studies suggest urban honey yields vary widely. What is undisputed is that a single colony may travel several kilometers in a day in search of nectar.`;

const EXAM_READING: BankItem[] = [
  // TOEIC-style: office memo
  { id: "r-c2-01", skill: "reading", level: "C2", kind: "choice", passage: P_TOEIC, prompt: "What is the main purpose of the memo?", choices: ["To announce a renovation and temporary relocation", "To request volunteers for construction", "To report a facilities budget cut", "To introduce a new kitchen menu"], answerIndex: 0, explain: "Renovation dates + temporary 3F desks = announcement + relocation." },
  { id: "r-c2-02", skill: "reading", level: "C2", kind: "choice", passage: P_TOEIC, prompt: "What must 5th-floor teams do by October 3?", choices: ["Submit renovation requests", "Move to temporary desks on the 3rd floor", "Avoid stairwell B", "Stop all noisy work"], answerIndex: 1, explain: "Temporary desks available starting Oct 3 — move before the Oct 6 closure." },
  { id: "r-c2-03", skill: "reading", level: "C2", kind: "choice", passage: P_TOEIC, prompt: 'The word "phased" in "a phased reopening" is closest in meaning to…', choices: ["sudden", "gradual, in stages", "partially cancelled", "loud"], answerIndex: 1, explain: "phased = 단계적인. TOEIC loves this word." },
  { id: "r-c2-04", skill: "reading", level: "C2", kind: "choice", passage: P_TOEIC, prompt: "What is NOT mentioned in the memo?", choices: ["Where to direct questions", "When noisy work is allowed", "How the renovation is funded", "Which stairwell to use"], answerIndex: 2, explain: "Budget/funding never appears — classic NOT question." },
  // TOEFL-style: academic passage
  { id: "r-c2-05", skill: "reading", level: "C2", kind: "choice", passage: P_TOEFL, prompt: "What is the passage mainly about?", choices: ["How deep-sea animals use and obtain bioluminescence", "Why the deep sea has no light at all", "How luciferin was first discovered", "Why predators avoid lanternfish"], answerIndex: 0, explain: "Whole passage = mechanism (counterillumination) + chemistry source." },
  { id: "r-c2-06", skill: "reading", level: "C2", kind: "choice", passage: P_TOEFL, prompt: "Why do animals use counterillumination?", choices: ["To attract mates", "To hide their silhouette from predators below", "To digest luciferin faster", "To signal other lanternfish"], answerIndex: 1, explain: "Stated directly: erasing silhouette, eluding predators hunting from below." },
  { id: "r-c2-07", skill: "reading", level: "C2", kind: "choice", passage: P_TOEFL, prompt: 'The word "eluding" is closest in meaning to…', choices: ["escaping / avoiding", "attacking", "feeding", "glowing"], answerIndex: 0, explain: "elude = 피하다. TOEFL vocabulary-in-context staple." },
  { id: "r-c2-08", skill: "reading", level: "C2", kind: "choice", passage: P_TOEFL, prompt: "What can be inferred about deep-sea food webs?", choices: ["They depend only on sunlight", "They circulate light-producing chemicals as well as nutrients", "They contain no predators", "They are simpler than surface webs"], answerIndex: 1, explain: "Final sentence: linked by exchange of light-chemicals AND nutrients." },
  // IELTS-style: True / False / Not Given
  { id: "r-c2-09", skill: "reading", level: "C2", kind: "choice", passage: P_IELTS, prompt: "Rooftop hives produce more honey than rural hives. (True / False / Not Given)", choices: ["True", "False", "Not Given"], answerIndex: 2, explain: "Yields 'vary widely' — no urban-vs-rural comparison given." },
  { id: "r-c2-10", skill: "reading", level: "C2", kind: "choice", passage: P_IELTS, prompt: "City bans on beekeeping have increased recently. (True / False / Not Given)", choices: ["True", "False", "Not Given"], answerIndex: 1, explain: "Contradicted: cities 'lifted their restrictions'." },
  { id: "r-c2-11", skill: "reading", level: "C2", kind: "choice", passage: P_IELTS, prompt: "Bees may travel several kilometers in a day for food. (True / False / Not Given)", choices: ["True", "False", "Not Given"], answerIndex: 0, explain: "Stated in the final sentence." },
];

export const ALL_ITEMS: BankItem[] = [...VOCAB, ...GRAMMAR_CHOICE, ...GRAMMAR_FILL, ...EXAM_READING];

/** Fixed placement test: 18 Qs, 3 per level, easiest first. */
export const PLACEMENT_IDS = [
  "v-a1-1", "g-a1-1", "g-a1-3",
  "v-a2-1", "g-a2-1", "g-a2-3",
  "v-b1-1", "g-b1-1", "g-b1-3",
  "v-b2-2", "g-b2-1", "g-b2-3",
  "v-c1-1", "g-c1-3", "g-c1-5",
  "v-c2-1", "g-c2-1", "g-c2-5",
];

export function getPlacementTest(): BankItem[] {
  const byId = new Map(ALL_ITEMS.map((i) => [i.id, i]));
  return PLACEMENT_IDS.map((id) => byId.get(id)).filter(
    (x): x is BankItem => Boolean(x),
  );
}

export function scoreToCEFR(score: number, total: number): CEFR {
  const r = total <= 0 ? 0 : score / total;
  if (r >= 0.88) return "C2";
  if (r >= 0.72) return "C1";
  if (r >= 0.55) return "B2";
  if (r >= 0.38) return "B1";
  if (r >= 0.22) return "A2";
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
  { id: "s-c1-1", level: "C1", en: "I can follow fast native conversation without subtitles.", ko: "자막 없이 원어민 대화 따라가기" },
  { id: "s-c1-2", level: "C1", en: "I can write a formal complaint email.", ko: "공식 항의 이메일 쓰기" },
  { id: "s-c2-1", level: "C2", en: "I can understand academic lectures and take notes.", ko: "학술 강의 듣고 필기하기" },
  { id: "s-c2-2", level: "C2", en: "I can read contracts and spot key conditions.", ko: "계약서 읽고 핵심 조건 찾기" },
];

/** Map checked count → CEFR. 0–2 A1 … 9–10 C1, 11–12 C2. */
export function suggestLevelFromChecks(checkedCount: number): CEFR {
  const n = Math.max(0, Math.floor(checkedCount));
  if (n >= 11) return "C2";
  if (n >= 9) return "C1";
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

/** Seeded PRNG (mulberry32) — random per session, reproducible per seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 10-item lesson centered on the learner: 3 warm-up (one step below),
 * 5 at-level (the main set), 2 stretch (one step above). Edges fold inward
 * (A1 warms up at A1; C1 stretches at C1), so nothing is ever above the
 * learner's head. Shuffled per (day, salt), skips recently-seen ids.
 * Zero-token.
 */
export function buildDailyLesson(
  dateStr: string,
  level: CEFR | null,
  exclude: string[] = [],
  salt: string | number = "",
): BankItem[] {
  const lv = levelRank(level ?? "A1");
  const top = CEFR_ORDER.length - 1;
  const band = (l: number) => ALL_ITEMS.filter((i) => levelRank(i.level) === l);
  const warm = band(Math.max(0, lv - 1));
  const main = band(lv);
  const reach = band(Math.min(top, lv + 1));
  const rng = mulberry32(hashStr(`${dateStr}|${level ?? "A1"}|${salt}`));
  const seen = new Set(exclude);
  const taken: BankItem[] = [];

  // Balanced take: alternate vocab/grammar from a shuffled band,
  // skipping recently-seen ids so sessions feel fresh.
  const takeBalanced = (pool: BankItem[], n: number): void => {
    const vs = shuffled(
      pool.filter((i) => i.skill === "vocab"),
      rng,
    );
    const gs = shuffled(
      pool.filter((i) => i.skill === "grammar"),
      rng,
    );
    let vi = 0;
    let gi = 0;
    let preferVocab = taken.length % 2 === 0;
    const target = taken.length + n;
    while (taken.length < target && (vi < vs.length || gi < gs.length)) {
      const cand = preferVocab
        ? vi < vs.length
          ? vs[vi++]
          : gs[gi++]
        : gi < gs.length
          ? gs[gi++]
          : vs[vi++];
      preferVocab = !preferVocab;
      if (!cand || seen.has(cand.id)) continue;
      seen.add(cand.id);
      taken.push(cand);
    }
  };

  takeBalanced(warm, 3);
  takeBalanced(main, 5);
  takeBalanced(reach, 2);
  // Top-up 1: unseen items from anywhere in range.
  if (taken.length < 10) {
    for (const cand of shuffled([...warm, ...main, ...reach], rng)) {
      if (taken.length >= 10) break;
      if (seen.has(cand.id)) continue;
      seen.add(cand.id);
      taken.push(cand);
    }
  }
  // Top-up 2: bank exhausted (heavy exclusion) — allow repeats, keep unique.
  if (taken.length < 10) {
    const have = new Set(taken.map((i) => i.id));
    for (const cand of shuffled([...warm, ...main, ...reach], rng)) {
      if (taken.length >= 10) break;
      if (have.has(cand.id)) continue;
      have.add(cand.id);
      taken.push(cand);
    }
  }
  return taken;
}
