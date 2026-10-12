// Procedural question generator — the answer to "the questions feel fixed".
//
// The hand-written bank (~170 items) is high quality but finite. This module
// multiplies it into THOUSANDS of deterministic, zero-token, offline
// questions: word lists per level (EN→KO and KO→EN) plus grammar templates
// with slot combinations (subjects × verbs × nouns …).
//
// Properties:
// - genPoolSize(level): exact unique count for the UI ("2,341 unique at B1").
// - genItem(level, idx, salt): same idx+salt → identical item (stable across
//   re-renders); same idx + new salt → same question, reshuffled options.
// - IDs are salt-independent (`gv-b1-042`), so learn-seen dedupes across days.
// - genBatch(level, n, exclude, salt): sample without replacement, skip seen.
// - rememberGenItems()/lookupGenWord(): review-tab resolution for generated
//   and AI-made cards (memory cache; bank words still resolve after reload).
// - parseAiItems(): validate model-generated JSON batches (AI Fresh Set).
//
// Self-contained (type-only cross-import) so plain `node --test` covers it.

import type { BankItem, CEFR } from "./learn-bank";
import type { ChoiceMode, EnDef } from "./learn-endef.ts";

function cefrRank(l: CEFR): number {
  return (["A1", "A2", "B1", "B2", "C1", "C2"] as CEFR[]).indexOf(l);
}

/** auto = KO choices at A1/A2 (scaffold), EN choices at B1+.
 * Lives here (not learn-endef.ts) because tsc forbids runtime .ts imports
 * while type-only ones are fine — and the generator is its only caller. */
export function wantEnChoices(mode: ChoiceMode, level: CEFR): boolean {
  if (mode === "en") return true;
  if (mode === "ko") return false;
  return cefrRank(level) >= cefrRank("B1");
}

// --- English-definition injection -------------------------------------------
// The EN-definition dictionary (seed + /data/endef.json) is loaded async by
// the UI and injected here; generation stays sync + deterministic. When a
// target lacks a definition (or fewer than 3 same-level distractors have
// one), that item gracefully falls back to KO choices.

let EN_DICT: Record<string, EnDef> = {};
let CHOICE_MODE: ChoiceMode = "auto";

export function setEnDefDict(d: Record<string, EnDef>): void {
  EN_DICT = d ?? {};
}

export function setChoiceMode(m: ChoiceMode): void {
  CHOICE_MODE = m;
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

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

// ---------------------------------------------------------------------------
// Word lists: [english, korean]. Graded roughly A1 (concrete, everyday) →
// C2 (abstract, academic). Deliberately avoids most hand-bank words so the
// two pools feel different.
// ---------------------------------------------------------------------------

type Word = [string, string];

const W_A1: Word[] = [
  ["dog", "개"], ["cat", "고양이"], ["bird", "새"], ["fish", "물고기"], ["egg", "달걀"],
  ["apple", "사과"], ["bread", "빵"], ["milk", "우유"], ["water", "물"], ["rice", "밥"],
  ["book", "책"], ["pen", "펜"], ["bag", "가방"], ["chair", "의자"], ["desk", "책상"],
  ["door", "문"], ["window", "창문"], ["house", "집"], ["room", "방"], ["school", "학교"],
  ["friend", "친구"], ["baby", "아기"], ["boy", "소년"], ["girl", "소녀"], ["mother", "어머니"],
  ["father", "아버지"], ["sun", "해"], ["moon", "달"], ["star", "별"], ["rain", "비"],
  ["snow", "눈"], ["tree", "나무"], ["flower", "꽃"], ["red", "빨간색"], ["blue", "파란색"],
  ["green", "초록색"], ["yellow", "노란색"], ["black", "검은색"], ["white", "흰색"], ["big", "큰"],
  ["small", "작은"], ["long", "긴"], ["short", "짧은"], ["hot", "뜨거운"], ["cold", "차가운"],
  ["new", "새로운"], ["happy", "행복한"], ["sad", "슬픈"], ["run", "달리다"], ["walk", "걷다"],
  ["eat", "먹다"], ["drink", "마시다"], ["sleep", "자다"], ["read", "읽다"], ["write", "쓰다"],
  ["sing", "노래하다"], ["dance", "춤추다"], ["swim", "수영하다"], ["hand", "손"], ["eye", "눈"],
  ["nose", "코"], ["mouth", "입"], ["head", "머리"], ["shoes", "신발"], ["hat", "모자"],
  ["bed", "침대"], ["morning", "아침"], ["night", "밤"], ["today", "오늘"], ["hello", "안녕"],
];

const W_A2: Word[] = [
  ["lend", "빌려주다"], ["menu", "메뉴"], ["price", "가격"], ["size", "크기"], ["weight", "무게"],
  ["change", "거스름돈"], ["bill", "계산서"], ["customer", "손님"], ["neighbor", "이웃"], ["relative", "친척"],
  ["village", "마을"], ["capital", "수도"], ["bridge", "다리"], ["station", "역"], ["airport", "공항"],
  ["ticket", "표"], ["luggage", "짐"], ["trip", "여행"], ["map", "지도"], ["photo", "사진"],
  ["gift", "선물"], ["party", "파티"], ["game", "경기"], ["team", "팀"], ["music", "음악"],
  ["song", "노래"], ["movie", "영화"], ["actor", "배우"], ["novel", "소설"], ["library", "도서관"],
  ["museum", "박물관"], ["bank", "은행"], ["hospital", "병원"], ["police", "경찰"], ["fire", "불"],
  ["earth", "지구"], ["plant", "식물"], ["insect", "곤충"], ["brave", "용감한"], ["kind", "친절한"],
  ["polite", "정중한"], ["rude", "무례한"], ["busy", "바쁜"], ["tired", "피곤한"], ["sick", "아픈"],
  ["healthy", "건강한"], ["strong", "강한"], ["weak", "약한"], ["fast", "빠른"], ["slow", "느린"],
  ["early", "이른"], ["quiet", "조용한"], ["noisy", "시끄러운"], ["dirty", "더러운"], ["empty", "빈"],
  ["full", "가득 찬"], ["heavy", "무거운"], ["light", "가벼운"], ["cook", "요리하다"], ["wash", "씻다"],
  ["carry", "나르다"], ["push", "밀다"], ["pull", "당기다"], ["throw", "던지다"], ["catch", "잡다"],
  ["climb", "오르다"], ["paint", "칠하다"], ["stream", "시내"], ["forest", "숲"], ["river", "강"],
];

const W_B1: Word[] = [
  ["abroad", "해외로"], ["absent", "결석한"], ["accept", "받아들이다"], ["accident", "사고"], ["activity", "활동"],
  ["admire", "감탄하다"], ["admit", "인정하다"], ["adopt", "입양하다"], ["advice", "충고"], ["afford", "여유가 있다"],
  ["agency", "기관"], ["agenda", "안건"], ["aim", "목표로 하다"], ["alarm", "경보"], ["alike", "비슷한"],
  ["alive", "살아 있는"], ["alley", "골목"], ["alliance", "동맹"], ["allowance", "용돈"], ["alphabet", "알파벳"],
  ["alter", "바꾸다"], ["altitude", "고도"], ["amaze", "놀라게 하다"], ["ambition", "야망"], ["amount", "양"],
  ["amuse", "즐겁게 하다"], ["analyze", "분석하다"], ["ancestor", "조상"], ["anger", "분노"], ["angle", "각도"],
  ["ankle", "발목"], ["announce", "발표하다"], ["annoy", "성가시게 하다"], ["annual", "매년의"], ["antique", "골동품"],
  ["anxiety", "불안"], ["apologize", "사과하다"], ["appeal", "호소하다"], ["appear", "나타나다"], ["appetite", "식욕"],
  ["applaud", "박수치다"], ["applicant", "지원자"], ["appoint", "임명하다"], ["appreciate", "감사하다"], ["approach", "다가가다"],
  ["approve", "승인하다"], ["approximate", "대략의"], ["archive", "기록 보관소"], ["arise", "생기다"], ["aroma", "향기"],
  ["arrange", "정리하다"], ["arrest", "체포하다"], ["arrival", "도착"], ["arrogant", "거만한"], ["arrow", "화살"],
  ["article", "기사"], ["artificial", "인공의"], ["artist", "예술가"], ["ash", "재"], ["aside", "곁에"],
  ["aspect", "측면"], ["aspire", "열망하다"], ["assembly", "집회"], ["assert", "주장하다"], ["assign", "할당하다"],
  ["assist", "돕다"], ["associate", "연상하다"], ["assume", "추정하다"], ["assure", "보장하다"], ["astonish", "놀라게 하다"],
];

const W_B2: Word[] = [
  ["abolish", "폐지하다"], ["abrupt", "갑작스러운"], ["absorb", "흡수하다"], ["abstract", "추상적인"], ["abuse", "남용하다"],
  ["accelerate", "가속하다"], ["accent", "억양"], ["accessible", "접근 가능한"], ["acclaim", "찬사"], ["accommodate", "수용하다"],
  ["accompany", "동행하다"], ["accomplish", "이루다"], ["accumulate", "축적하다"], ["accuracy", "정확성"], ["accuse", "고발하다"],
  ["actual", "실제의"], ["acute", "심각한"], ["adapt", "적응하다"], ["adhere", "고수하다"], ["adjacent", "인접한"],
  ["advertise", "광고하다"], ["advocate", "옹호하다"], ["aerial", "공중의"], ["affair", "일"], ["affect", "영향을 주다"],
  ["affection", "애정"], ["afflict", "괴롭히다"], ["affluent", "부유한"], ["afraid", "두려워하는"], ["aggravate", "악화시키다"],
  ["agile", "민첩한"], ["agitate", "선동하다"], ["agony", "고통"], ["agree", "동의하다"], ["agriculture", "농업"],
  ["ahead", "앞에"], ["ailment", "질병"], ["aisle", "통로"], ["alert", "경계하는"], ["algebra", "대수"],
  ["alien", "외국의"], ["align", "정렬하다"], ["allege", "주장하다"], ["alligator", "악어"], ["allude", "암시하다"],
  ["allure", "매력"], ["ally", "동맹국"], ["almond", "아몬드"], ["almost", "거의"], ["alphabet", "알파벳"],
  ["altar", "제단"], ["alternate", "번갈아 하다"], ["altruism", "이타주의"], ["amass", "모으다"], ["ambiguous", "모호한"],
  ["ambivalent", "상반된 감정의"], ["amenity", "편의시설"], ["amiable", "호감 가는"], ["amicable", "우호적인"], ["amid", "~중에"],
  ["ample", "풍부한"], ["amplify", "증폭하다"], ["amulet", "부적"], ["analogy", "유추"], ["anchor", "닻"],
];

const W_C1: Word[] = [
  ["abandon", "버리다"], ["abate", "누그러지다"], ["abdicate", "퇴위하다"], ["aberration", "일탈"], ["abet", "부추기다"],
  ["abeyance", "일시 중지"], ["abhor", "혐오하다"], ["abide", "준수하다"], ["abject", "비참한"], ["abjure", "맹세코 버리다"],
  ["ablution", "세척"], ["abnegation", "자기 부정"], ["abode", "거처"], ["abolition", "폐지"], ["abominable", "지독한"],
  ["aboriginal", "원주민의"], ["abort", "중단하다"], ["abound", "풍부하다"], ["abrasive", "거친"], ["abreast", "나란히"],
  ["abridge", "요약하다"], ["abrogate", "폐지하다"], ["abruptly", "갑자기"], ["abscond", "도망치다"], ["absenteeism", "결근"],
  ["absolute", "절대적인"], ["absolution", "면죄"], ["absolutism", "절대주의"], ["absolve", "면제하다"], ["abstain", "기권하다"],
  ["abstemious", "절제하는"], ["abstinence", "금욕"], ["abstruse", "난해한"], ["absurd", "터무니없는"], ["abundance", "풍부"],
  ["abundant", "풍부한"], ["abuse", "남용하다"], ["abut", "접하다"], ["abysmal", "밑바닥의"], ["abyss", "심연"],
  ["academic", "학문적인"], ["accede", "동의하다"], ["accentuate", "강조하다"], ["acclivity", "오르막"], ["accolade", "칭찬"],
  ["accretion", "증가"], ["accrue", "생기다"], ["acerbic", "신랄한"], ["acetate", "아세테이트"], ["ache", "아프다"],
  ["achromatic", "무채색의"], ["acidic", "산성의"], ["acknowledge", "인정하다"], ["acme", "절정"], ["acolyte", "추종자"],
  ["acoustic", "음향의"], ["acquaint", "익히게 하다"], ["acquiesce", "묵인하다"], ["acrid", "매운"], ["acrimony", "신랄함"],
];

const W_C2: Word[] = [
  ["abrogate", "폐지하다"], ["absolutist", "절대주의자"], ["abstruseness", "난해함"], ["academism", "아카데미즘"], ["acatalepsy", "불가지론"],
  ["acerbity", "신랄함"], ["acquiescence", "묵종"], ["acumen", "통찰력"], ["adumbrate", "어렴풋이 보이다"], ["aegis", "보호"],
  ["aestheticism", "심미주의"], ["afflatus", "영감"], ["aggrandize", "확대하다"], ["agnostic", "불가지론자"], ["alacrity", "민첩함"],
  ["albeit", "~임에도"], ["altercation", "말다툼"], ["ameliorate", "개선하다"], ["anachronism", "시대착오"], ["anathema", "저주받은 것"],
  ["antediluvian", "구식의"], ["apocryphal", "외경의"], ["approbation", "찬성"], ["arcane", "난해한"], ["ascetic", "금욕적인"],
  ["assiduous", "근면한"], ["atavism", "격세유전"], ["attenuate", "약화시키다"], ["augury", "징조"], ["auspicious", "길조인"],
  ["austere", "엄격한"], ["autarchy", "전제정치"], ["aver", "단언하다"], ["axiomatic", "자명한"], ["bathos", "진부함"],
  ["bellicose", "호전적인"], ["bildungsroman", "교양소설"], ["blandishment", "아첨"], ["bourgeois", "부르주아의"], ["bravura", "화려한 기교"],
  ["brouhaha", "소동"], ["bucolic", "목가적인"], ["burgeon", "급성장하다"], ["cacophony", "불협화음"], ["cadge", "구걸하다"],
  ["cajole", "감언으로 설득하다"], ["calumny", "중상"], ["candidness", "솔직함"], ["cantankerous", "심술궂은"], ["capricious", "변덕스러운"],
  ["castigate", "혹평하다"], ["catharsis", "카타르시스"], ["cavil", "트집 잡다"], ["celerity", "신속함"], ["chicanery", "궤변"],
  ["chimera", "키메라"], ["circumlocution", "빙빙 돌려 말함"], ["cogent", "설득력 있는"], ["cognizant", "인식하는"], ["compendium", "개요"],
];

const WORDS: Record<CEFR, Word[]> = { A1: W_A1, A2: W_A2, B1: W_B1, B2: W_B2, C1: W_C1, C2: W_C2 };

// ---------------------------------------------------------------------------
// Spelling-rule helpers (explicit data below beats clever rules, but 3rd
// person needs a small rule with an exception map).
// ---------------------------------------------------------------------------

const THIRD_EXCEPT: Record<string, string> = { be: "is", have: "has", do: "does", go: "goes" };

export function thirdPerson(v: string): string {
  const base = v.toLowerCase();
  if (THIRD_EXCEPT[base]) return THIRD_EXCEPT[base];
  if (/[^aeiou]y$/.test(base)) return base.slice(0, -1) + "ies";
  if (/(s|x|z|ch|sh|o)$/.test(base)) return base + "es";
  return base + "s";
}

// [base, past] pairs — explicit, no rule guessing.
const PASTS: [string, string][] = [
  ["walk", "walked"], ["play", "played"], ["study", "studied"], ["stop", "stopped"], ["plan", "planned"],
  ["go", "went"], ["eat", "ate"], ["see", "saw"], ["come", "came"], ["take", "took"],
  ["get", "got"], ["write", "wrote"], ["read", "read"], ["drink", "drank"], ["swim", "swam"],
  ["sing", "sang"], ["run", "ran"], ["buy", "bought"], ["bring", "brought"], ["teach", "taught"],
  ["think", "thought"], ["drive", "drove"], ["speak", "spoke"], ["break", "broke"], ["choose", "chose"],
  ["forget", "forgot"], ["wake", "woke"], ["wear", "wore"], ["win", "won"], ["lose", "lost"],
  ["find", "found"], ["leave", "left"], ["meet", "met"], ["pay", "paid"], ["say", "said"],
  ["sell", "sold"], ["send", "sent"], ["sit", "sat"], ["sleep", "slept"], ["spend", "spent"],
  ["stand", "stood"], ["understand", "understood"], ["build", "built"], ["feel", "felt"], ["keep", "kept"],
  ["lend", "lent"], ["shine", "shone"], ["shut", "shut"], ["cost", "cost"], ["cut", "cut"],
  ["hit", "hit"], ["hurt", "hurt"], ["put", "put"], ["set", "set"], ["cook", "cooked"],
  ["watch", "watched"], ["visit", "visited"], ["help", "helped"], ["like", "liked"], ["live", "lived"],
];

// [base, past-participle] for passives.
const PPS: [string, string][] = [
  ["make", "made"], ["write", "written"], ["eat", "eaten"], ["see", "seen"], ["go", "gone"],
  ["take", "taken"], ["give", "given"], ["break", "broken"], ["speak", "spoken"], ["choose", "chosen"],
  ["build", "built"], ["send", "sent"], ["pay", "paid"], ["sell", "sold"], ["find", "found"],
  ["clean", "cleaned"], ["wash", "washed"], ["cook", "cooked"], ["paint", "painted"], ["repair", "repaired"],
  ["finish", "finished"], ["open", "opened"], ["close", "closed"], ["use", "used"],
];

// [singular, plural] — explicit irregulars included.
const PLURALS: [string, string][] = [
  ["book", "books"], ["pen", "pens"], ["dog", "dogs"], ["box", "boxes"], ["watch", "watches"],
  ["baby", "babies"], ["city", "cities"], ["wife", "wives"], ["leaf", "leaves"], ["child", "children"],
  ["man", "men"], ["woman", "women"], ["tooth", "teeth"], ["foot", "feet"], ["mouse", "mice"],
  ["person", "people"], ["bus", "buses"], ["dish", "dishes"], ["class", "classes"], ["tomato", "tomatoes"],
  ["photo", "photos"], ["piano", "pianos"], ["apple", "apples"], ["chair", "chairs"], ["bag", "bags"],
  ["car", "cars"], ["house", "houses"], ["tree", "trees"], ["bird", "birds"], ["egg", "eggs"],
];

// [adjective, comparative, superlative].
const DEGREES: [string, string, string][] = [
  ["tall", "taller", "tallest"], ["short", "shorter", "shortest"], ["big", "bigger", "biggest"], ["small", "smaller", "smallest"],
  ["hot", "hotter", "hottest"], ["cold", "colder", "coldest"], ["fast", "faster", "fastest"], ["slow", "slower", "slowest"],
  ["happy", "happier", "happiest"], ["busy", "busier", "busiest"], ["heavy", "heavier", "heaviest"], ["easy", "easier", "easiest"],
  ["good", "better", "best"], ["bad", "worse", "worst"], ["far", "farther", "farthest"], ["little", "less", "least"],
  ["interesting", "more interesting", "most interesting"], ["beautiful", "more beautiful", "most beautiful"],
  ["expensive", "more expensive", "most expensive"], ["important", "more important", "most important"],
  ["difficult", "more difficult", "most difficult"], ["careful", "more careful", "most careful"], ["famous", "more famous", "most famous"],
  ["crowded", "more crowded", "most crowded"], ["useful", "more useful", "most useful"], ["boring", "more boring", "most boring"],
];

// [noun, article] — tricky vowel-sound cases included.
const ARTICLES: [string, string][] = [
  ["apple", "an"], ["egg", "an"], ["umbrella", "an"], ["hour", "an"], ["honest man", "an"], ["elephant", "an"],
  ["orange", "an"], ["ice cube", "an"], ["old friend", "an"], ["engineer", "an"], ["dog", "a"], ["cat", "a"],
  ["book", "a"], ["university", "a"], ["one-way street", "a"], ["European city", "a"], ["house", "a"], ["car", "a"],
  ["pen", "a"], ["table", "a"], ["school", "a"], ["photo", "a"], ["user", "a"], ["uniform", "a"],
  ["honor", "an"], ["heir", "an"], ["idea", "an"], ["island", "an"], ["onion", "an"], ["actor", "an"],
  ["bike", "a"], ["garden", "a"], ["key", "a"], ["mountain", "a"], ["nose", "a"], ["pencil", "a"],
  ["queen", "a"], ["river", "a"], ["song", "a"], ["tiger", "a"],
];

// Countable (many/few) vs uncountable (much/little) nouns.
const COUNTABLE = ["books", "friends", "apples", "students", "chairs", "photos", "dogs", "cars", "tickets", "eggs", "shops", "trees"];
const UNCOUNTABLE = ["water", "rice", "milk", "money", "time", "music", "news", "luggage", "homework", "advice", "furniture", "weather"];

// Verb + preposition collocations: [verb/adj, prep, ko].
const COLL: [string, string, string][] = [
  ["interested", "in", "~에 관심 있는"], ["good", "at", "~을 잘하는"], ["afraid", "of", "~을 두려워하는"], ["proud", "of", "자랑스러운"],
  ["depend", "on", "~에 의존하는"], ["wait", "for", "~을 기다리는"], ["listen", "to", "~을 듣는"], ["arrive", "at", "~에 도착하는"],
  ["married", "to", "~와 결혼한"], ["different", "from", "~와 다른"], ["angry", "about", "~에 화난"], ["worried", "about", "걱정하는"],
  ["similar", "to", "~와 비슷한"], ["famous", "for", "~로 유명한"], ["responsible", "for", "~에 책임 있는"], ["bored", "with", "~에 싫증난"],
  ["tired", "of", "~에 지친"], ["excited", "about", "~에 신난"], ["sorry", "for", "~에 미안한"], ["thankful", "for", "감사하는"],
  ["used", "to", "~에 익숙한"], ["aware", "of", "~을 아는"], ["capable", "of", "~할 수 있는"], ["fond", "of", "~을 좋아하는"],
];

// Gerund-only and infinitive-only verbs.
const GERUND = ["enjoy", "avoid", "finish", "mind", "deny", "admit", "consider", "imagine", "miss", "practice", "suggest", "keep"];
const INFIN = ["want", "decide", "hope", "plan", "promise", "refuse", "afford", "manage", "expect", "pretend", "agree", "fail"];

// ---------------------------------------------------------------------------
// Template engine. Each template owns a slice of the index space:
// id = `${prefix}-${n}` (salt-independent). Content is pure f(localIndex);
// only CHOICE ORDER + distractors use the salt rng.
// ---------------------------------------------------------------------------

interface Made {
  skill: "vocab" | "grammar";
  kind: "choice" | "fill";
  prompt: string;
  choices?: string[];
  answerIndex?: number;
  accept?: string[];
  explain: string;
  word?: string;
}

interface Template {
  prefix: string;
  level: CEFR;
  size: number;
  at(i: number, rng: () => number): Made;
}

function pickDist<T>(pool: T[], correct: T, rng: () => number, n: number): T[] {
  const others = shuffled(pool.filter((x) => x !== correct), rng);
  return others.slice(0, n);
}

function order4<T>(correct: T, distract: T[], rng: () => number): { choices: T[]; answerIndex: number } {
  const seen = new Set<string>();
  const uniq: T[] = [];
  for (const d of [...distract, "—" as unknown as T, "…" as unknown as T]) {
    const k = String(d);
    if (k === String(correct) || seen.has(k)) continue;
    seen.add(k);
    uniq.push(d);
    if (uniq.length === 3) break;
  }
  const all = shuffled([correct, ...uniq], rng);
  return { choices: all.slice(0, 4), answerIndex: all.indexOf(correct) };
}

// --- vocab (forward EN→KO or EN→EN-def + reverse KO→EN) --------------------
function vocabTemplate(level: CEFR, words: Word[]): Template {
  return {
    prefix: `gv-${level.toLowerCase()}`,
    level,
    size: words.length * 2,
    at(i, rng) {
      const forward = i < words.length;
      const [en, ko] = words[i % words.length];
      const entry = EN_DICT[en.toLowerCase()];
      if (forward) {
        // English-first: EN-definition choices when covered, else KO choices.
        const pool = words.filter((w) => EN_DICT[w[0].toLowerCase()]);
        if (wantEnChoices(CHOICE_MODE, level) && entry && pool.length >= 4) {
          const d = pickDist(
            pool.map((w) => EN_DICT[w[0].toLowerCase()].def),
            entry.def, rng, 3,
          );
          const { choices, answerIndex } = order4(entry.def, d, rng);
          return {
            skill: "vocab", kind: "choice", prompt: `Choose the closest meaning of "${en}".`,
            choices, answerIndex,
            explain: entry.ex ? `${en} = ${entry.def}. "${entry.ex}"` : `${en} = ${entry.def}.`,
            hint: ko, word: `gen:${en}`,
          };
        }
        const d = pickDist(words.map((w) => w[1]), ko, rng, 3);
        const { choices, answerIndex } = order4(ko, d, rng);
        return {
          skill: "vocab", kind: "choice", prompt: `What does "${en}" mean?`,
          choices, answerIndex, explain: `${en} = ${ko}.`,
          hint: entry ? `${entry.def}${entry.ex ? ` — "${entry.ex}"` : ""}` : undefined,
          word: `gen:${en}`,
        };
      }
      const d = pickDist(words.map((w) => w[0]), en, rng, 3);
      const { choices, answerIndex } = order4(en, d, rng);
      return {
        skill: "vocab", kind: "choice", prompt: `"${ko}" in English?`,
        choices, answerIndex, explain: `${ko} = ${en}.`,
        hint: entry ? `${entry.def}${entry.ex ? ` — "${entry.ex}"` : ""}` : undefined,
        word: `gen:${en}`,
      };
    },
  };
}

const BE_SUBJ: [string, string][] = [
  ["I", "am"], ["You", "are"], ["We", "are"], ["They", "are"], ["He", "is"], ["She", "is"], ["It", "is"], ["This", "is"],
];
const BE_COMP = ["my friends", "a student", "tired", "ready", "at home", "hungry"];

const HAVE_SUBJ: [string, string][] = [["I", "have"], ["You", "have"], ["We", "have"], ["They", "have"], ["He", "has"], ["She", "has"]];
const HAVE_OBJ = ["a bike", "two cats", "a new phone", "a big family", "a dog", "an idea", "no time", "a cold", "a headache", "many books"];

const SV_SUBJ = ["I", "you", "we", "they", "he", "she", "it", "Tom", "the dog", "my sister", "the bus", "everyone"];
const SV_VERB = ["go", "watch", "study", "play", "work", "like", "eat", "drink", "run", "help", "live", "teach", "visit", "cook", "have", "do", "fix", "wash", "carry", "push", "climb", "start", "finish", "open", "close", "rain", "snow", "cost", "enjoy", "call"];

function isThird(subj: string): boolean {
  return ["he", "she", "it", "tom", "the dog", "my sister", "the bus", "everyone"].includes(subj.toLowerCase());
}

const TIME_PREP: [string, string][] = [
  ["2020", "in"], ["May", "in"], ["the morning", "in"], ["summer", "in"], ["2019", "in"], ["the evening", "in"],
  ["Monday", "on"], ["Friday night", "on"], ["Christmas Day", "on"], ["my birthday", "on"], ["Sunday", "on"],
  ["noon", "at"], ["night", "at"], ["midnight", "at"], ["7 o'clock", "at"], ["the moment", "at"], ["sunset", "at"],
];
const PLACE_PREP: [string, string][] = [
  ["school", "at"], ["home", "at"], ["work", "at"], ["the bus stop", "at"], ["the door", "at"],
  ["the kitchen", "in"], ["Seoul", "in"], ["the bag", "in"], ["bed", "in"], ["the sky", "in"],
  ["the desk", "on"], ["the bus", "on"], ["the wall", "on"], ["the floor", "on"], ["page 10", "on"],
];

const SOME_ANY: { ctx: string; ans: string; opts: [string, string] }[] = [
  { ctx: "I have ___ friends here.", ans: "some", opts: ["some", "any"] },
  { ctx: "Do you have ___ questions?", ans: "any", opts: ["some", "any"] },
  { ctx: "She doesn't have ___ money.", ans: "any", opts: ["some", "any"] },
  { ctx: "Would you like ___ tea?", ans: "some", opts: ["some", "any"] },
  { ctx: "There isn't ___ milk left.", ans: "any", opts: ["some", "any"] },
  { ctx: "I bought ___ apples.", ans: "some", opts: ["some", "any"] },
];

const TAG_Q: [string, string, string][] = [
  ["You are ready", "aren't you", "is you"], ["He is late", "isn't he", "is he"], ["They can swim", "can't they", "can they"],
  ["She works here", "doesn't she", "does she"], ["We arrived late", "didn't we", "did we"], ["It rains a lot", "doesn't it", "does it"],
  ["You have a car", "don't you", "do you"], ["He will come", "won't he", "will he"], ["They were happy", "weren't they", "were they"],
  ["She can drive", "can't she", "can she"], ["I am late", "aren't I", "am I"], ["Dogs bark loudly", "don't they", "do they"],
];

const TEMPLATES: Template[] = [
  vocabTemplate("A1", W_A1),
  vocabTemplate("A2", W_A2),
  vocabTemplate("B1", W_B1),
  vocabTemplate("B2", W_B2),
  vocabTemplate("C1", W_C1),
  vocabTemplate("C2", W_C2),

  // ---- A1 ----
  {
    prefix: "gg-be", level: "A1", size: BE_SUBJ.length * BE_COMP.length,
    at(i, rng) {
      const [subj, ans] = BE_SUBJ[Math.floor(i / BE_COMP.length) % BE_SUBJ.length];
      const comp = BE_COMP[i % BE_COMP.length];
      const d = shuffled(["am", "is", "are", "be"].filter((x) => x !== ans), rng);
      const { choices, answerIndex } = order4(ans, d, rng);
      return { skill: "grammar", kind: "choice", prompt: `${subj} ___ ${comp}.`, choices, answerIndex, explain: `${subj} + ${ans}.` };
    },
  },
  {
    prefix: "gg-aan", level: "A1", size: ARTICLES.length,
    at(i, rng) {
      const [noun, ans] = ARTICLES[i % ARTICLES.length];
      const other = ans === "a" ? "an" : "a";
      const { choices, answerIndex } = order4(ans, [other, "the", "—"], rng);
      return { skill: "grammar", kind: "choice", prompt: `I saw ___ ${noun}. (a / an)`, choices, answerIndex, explain: `"${noun}" starts with a ${ans === "an" ? "vowel" : "consonant"} sound → ${ans} ${noun}.` };
    },
  },
  {
    prefix: "gg-sv", level: "A1", size: SV_SUBJ.length * 15,
    at(i) {
      const subj = SV_SUBJ[Math.floor(i / 15) % SV_SUBJ.length];
      const verb = SV_VERB[i % 15];
      const third = isThird(subj);
      const ans = third ? thirdPerson(verb) : verb;
      return { skill: "grammar", kind: "fill", prompt: `Fill in: ${subj} ___ (${verb}).`, accept: [ans], explain: third ? `${subj} (3rd person) → ${verb} becomes ${ans}.` : `${subj} (plural/I/you) → base form ${verb}.` };
    },
  },
  {
    prefix: "gg-have", level: "A1", size: HAVE_SUBJ.length * HAVE_OBJ.length,
    at(i, rng) {
      const [subj, ans] = HAVE_SUBJ[Math.floor(i / HAVE_OBJ.length) % HAVE_SUBJ.length];
      const obj = HAVE_OBJ[i % HAVE_OBJ.length];
      const other = ans === "have" ? "has" : "have";
      const { choices, answerIndex } = order4(ans, [other, "having", "had"], rng);
      return { skill: "grammar", kind: "choice", prompt: `${subj} ___ ${obj}.`, choices, answerIndex, explain: `${subj} + ${ans}.` };
    },
  },
  {
    prefix: "gg-plur", level: "A1", size: PLURALS.length,
    at(i) {
      const [sing, pl] = PLURALS[i % PLURALS.length];
      return { skill: "grammar", kind: "fill", prompt: `Plural: one ${sing} → two ___?`, accept: [pl], explain: `${sing} → ${pl}.` };
    },
  },
  {
    prefix: "gg-timeprep", level: "A1", size: TIME_PREP.length,
    at(i, rng) {
      const [when, ans] = TIME_PREP[i % TIME_PREP.length];
      const d = shuffled(["in", "on", "at"].filter((x) => x !== ans), rng);
      const { choices, answerIndex } = order4(ans, d, rng);
      return { skill: "grammar", kind: "choice", prompt: `We met ___ ${when}.`, choices, answerIndex, explain: `${ans} ${when} (time preposition).` };
    },
  },

  // ---- A2 ----
  {
    prefix: "gg-sv2", level: "A2", size: SV_SUBJ.length * 15,
    at(i) {
      const subj = SV_SUBJ[(Math.floor(i / 15) + 5) % SV_SUBJ.length];
      const verb = SV_VERB[15 + (i % 15)];
      const third = isThird(subj);
      const ans = third ? thirdPerson(verb) : verb;
      return { skill: "grammar", kind: "fill", prompt: `Fill in: ${subj} ___ (${verb}).`, accept: [ans], explain: third ? `${subj} → ${verb} becomes ${ans}.` : `${subj} → base form ${verb}.` };
    },
  },
  {
    prefix: "gg-past", level: "A2", size: PASTS.length,
    at(i) {
      const [base, past] = PASTS[i % PASTS.length];
      return { skill: "grammar", kind: "fill", prompt: `Past: I ___ (${base}) yesterday.`, accept: [past], explain: `${base} → ${past}.` };
    },
  },
  {
    prefix: "gg-comp", level: "A2", size: DEGREES.length,
    at(i, rng) {
      const [adj, comp] = DEGREES[i % DEGREES.length];
      const alts = shuffled(DEGREES.filter((d) => d[0] !== adj).map((d) => d[1]), rng).slice(0, 2);
      const { choices, answerIndex } = order4(comp, [adj, ...alts], rng);
      return { skill: "grammar", kind: "choice", prompt: `This box is ___ than that one. (${adj})`, choices, answerIndex, explain: `Comparative of ${adj} → ${comp}.` };
    },
  },
  {
    prefix: "gg-muchmany", level: "A2", size: COUNTABLE.length + UNCOUNTABLE.length,
    at(i, rng) {
      const n = COUNTABLE.length + UNCOUNTABLE.length;
      const k = i % n;
      const countable = k < COUNTABLE.length;
      const noun = countable ? COUNTABLE[k] : UNCOUNTABLE[k - COUNTABLE.length];
      const ans = countable ? "many" : "much";
      const other = countable ? "much" : "many";
      const { choices, answerIndex } = order4(ans, [other, "a lot", "few"], rng);
      return { skill: "grammar", kind: "choice", prompt: `How ___ ${noun} do we have?`, choices, answerIndex, explain: `${noun} is ${countable ? "countable → many" : "uncountable → much"}.` };
    },
  },
  {
    prefix: "gg-someany", level: "A2", size: SOME_ANY.length,
    at(i, rng) {
      const q = SOME_ANY[i % SOME_ANY.length];
      const { choices, answerIndex } = order4(q.ans, [q.opts.find((o) => o !== q.ans) as string, "no", "every"], rng);
      return { skill: "grammar", kind: "choice", prompt: q.ctx, choices, answerIndex, explain: q.ans === "some" ? "Affirmative/offer → some." : "Question/negative → any." };
    },
  },
  {
    prefix: "gg-placeprep", level: "A2", size: PLACE_PREP.length,
    at(i, rng) {
      const [where, ans] = PLACE_PREP[i % PLACE_PREP.length];
      const d = shuffled(["in", "on", "at"].filter((x) => x !== ans), rng);
      const { choices, answerIndex } = order4(ans, d, rng);
      return { skill: "grammar", kind: "choice", prompt: `She is ___ ${where}.`, choices, answerIndex, explain: `${ans} ${where} (place preposition).` };
    },
  },

  // ---- B1 ----
  {
    prefix: "gg-perfect", level: "B1", size: 24,
    at(i, rng) {
      const adv = ["just", "already", "never", "ever"][i % 4];
      const past = PASTS[(i * 13 + 1) % PASTS.length][1];
      const ctx = adv === "ever" ? `Have you ___ eaten kimchi?` : `I have ___ ${past}.`;
      const d = shuffled(["just", "already", "never", "ever"].filter((x) => x !== adv), rng);
      const { choices, answerIndex } = order4(adv, d, rng);
      return { skill: "grammar", kind: "choice", prompt: ctx, choices, answerIndex, explain: `Present perfect + ${adv}.` };
    },
  },
  {
    prefix: "gg-sincefor", level: "B1", size: 20,
    at(i, rng) {
      const since = i % 2 === 0;
      const when = ["2020", "Monday", "last year", "June", "yesterday", "2015", "morning", "2010", "Friday", "childhood"][Math.floor(i / 2) % 10];
      const ans = since ? "since" : "for";
      const span = since ? when : ["5 years", "a week", "two hours", "a long time", "three days", "six months", "an hour", "ages", "a month", "ten minutes"][Math.floor(i / 2) % 10];
      const { choices, answerIndex } = order4(ans, [since ? "for" : "since", "from", "until"], rng);
      return { skill: "grammar", kind: "choice", prompt: `I have lived here ___ ${span}.`, choices, answerIndex, explain: since ? `Point in time (${span}) → since.` : `Period (${span}) → for.` };
    },
  },
  {
    prefix: "gg-willgoing", level: "B1", size: 16,
    at(i, rng) {
      const plan = i % 2 === 0;
      const k = Math.floor(i / 2) % 8;
      const plans = [
        "We ___ visit Busan this weekend. (decided!)", "She ___ start a new job on Monday. (decided!)",
        "They ___ move to Seoul next month. (decided!)", "I ___ cook dinner tonight. (decided!)",
        "He ___ take the 8 a.m. train. (decided!)", "We ___ paint the room white. (decided!)",
        "She ___ call you at six. (decided!)", "They ___ open a new store. (decided!)",
      ];
      const warns = [
        "Watch out! You ___ drop your phone!", "It's heavy — you ___ hurt your back!",
        "Hurry, or you ___ miss the bus!", "Careful, you ___ spill the coffee!",
        "Look at those clouds — it ___ rain!", "Stop, or you ___ fall off the chair!",
        "The baby is tired — she ___ cry soon!", "Be quick, the shop ___ close in a minute!",
      ];
      const prompt = plan ? plans[k] : warns[k];
      const ans = plan ? "are going to" : "will";
      const { choices, answerIndex } = order4(ans, plan ? ["will", "would", "shall"] : ["are going to", "would", "are"], rng);
      return { skill: "grammar", kind: "choice", prompt, choices, answerIndex, explain: plan ? "Fixed plan → be going to." : "Spontaneous reaction → will." };
    },
  },
  {
    prefix: "gg-passive", level: "B1", size: PPS.length,
    at(i, rng) {
      const [base, pp] = PPS[i % PPS.length];
      const plural = i % 3 === 0;
      const ans = plural ? "are" : "is";
      const subj = plural ? "The reports" : "The report";
      const { choices, answerIndex } = order4(ans, [plural ? "is" : "are", "was", "be"], rng);
      return { skill: "grammar", kind: "choice", prompt: `${subj} ___ ${pp} every week. (${base})`, choices, answerIndex, explain: `Passive present: ${ans} + ${pp}.` };
    },
  },
  {
    prefix: "gg-rel", level: "B1", size: 14,
    at(i, rng) {
      const people = ["teacher", "girl", "doctor", "friend", "man", "woman", "student"];
      const things = ["book", "movie", "house", "phone", "song", "bike", "cake"];
      const isPerson = i % 2 === 0;
      const k = Math.floor(i / 2) % 7;
      const noun = isPerson ? people[k] : things[k];
      const ans = isPerson ? "who" : "which";
      const { choices, answerIndex } = order4(ans, [isPerson ? "which" : "who", "whose", "where"], rng);
      return { skill: "grammar", kind: "choice", prompt: `The ${noun} ___ I met is kind.`, choices, answerIndex, explain: `${noun} is ${isPerson ? "a person → who" : "a thing → which"}.` };
    },
  },
  {
    prefix: "gg-cond1", level: "B1", size: 10,
    at(i, rng) {
      const verbs: [string, string][] = [["rain", "stay"], ["study", "pass"], ["hurry", "catch"], ["save", "buy"], ["call", "come"]];
      const [v1, v2] = verbs[Math.floor(i / 2) % verbs.length];
      const firstHalf = i % 2 === 0;
      const ans = firstHalf ? `will ${v2}` : v1;
      const prompt = firstHalf ? `If it ${v1}s, we ___ at home.` : `If it ___, we will stay at home. (${v1})`;
      const opts = firstHalf ? ["stay", "stayed", "would stay"] : ["will rain", "rained", "would rain"];
      const { choices, answerIndex } = order4(ans, opts, rng);
      return { skill: "grammar", kind: "choice", prompt, choices, answerIndex, explain: "Type-1 conditional: If + present, will + base." };
    },
  },
  {
    prefix: "gg-coll", level: "B1", size: COLL.length,
    at(i, rng) {
      const [head, ans, ko] = COLL[i % COLL.length];
      const pool = ["in", "on", "at", "for", "of", "to", "from", "with", "about", "after"];
      const d = shuffled(pool.filter((x) => x !== ans), rng);
      const { choices, answerIndex } = order4(ans, d, rng);
      return { skill: "grammar", kind: "choice", prompt: `${head} ___ ? (${ko})`, choices, answerIndex, explain: `Fixed pair: ${head} ${ans}.` };
    },
  },

  // ---- B2 ----
  {
    prefix: "gg-super", level: "B2", size: DEGREES.length,
    at(i, rng) {
      const [adj, , sup] = DEGREES[i % DEGREES.length];
      const alts = shuffled(DEGREES.filter((d) => d[0] !== adj).map((d) => d[2]), rng).slice(0, 2);
      const { choices, answerIndex } = order4(sup, [adj, ...alts], rng);
      return { skill: "grammar", kind: "choice", prompt: `Everest is the ___ mountain on Earth. (${adj})`, choices, answerIndex, explain: `Superlative of ${adj} → ${sup}.` };
    },
  },
  {
    prefix: "gg-gerinf", level: "B2", size: GERUND.length + INFIN.length,
    at(i, rng) {
      const n = GERUND.length + INFIN.length;
      const k = i % n;
      const isGer = k < GERUND.length;
      const verb = isGer ? GERUND[k] : INFIN[k - GERUND.length];
      const tail = isGer ? "reading" : "to go";
      const prompt = isGer ? `She finished ___ the report. (${verb} + ?)` : `They decided ___ home early. (${verb} + ?)`;
      const { choices, answerIndex } = order4(tail, isGer ? ["to read", "read", "reads"] : ["going", "go", "goes"], rng);
      return { skill: "grammar", kind: "choice", prompt, choices, answerIndex, explain: isGer ? `${verb} takes -ing (gerund).` : `${verb} takes to-verb (infinitive).` };
    },
  },
  {
    prefix: "gg-tag", level: "B2", size: TAG_Q.length,
    at(i, rng) {
      const [stem, ans, wrong] = TAG_Q[i % TAG_Q.length];
      const { choices, answerIndex } = order4(ans, [wrong, "isn't it", "right"], rng);
      return { skill: "grammar", kind: "choice", prompt: `${stem}, ___?`, choices, answerIndex, explain: `Echo the auxiliary, flip positive/negative → ${ans}.` };
    },
  },
  {
    prefix: "gg-wish", level: "B2", size: 12,
    at(i) {
      const verbs: [string, string][] = [["know", "knew"], ["study", "studied"], ["be", "were"], ["have", "had"], ["go", "went"], ["speak", "spoke"], ["drive", "drove"], ["save", "saved"], ["eat", "ate"], ["sleep", "slept"], ["listen", "listened"], ["try", "tried"]];
      const [base, past] = verbs[i % verbs.length];
      return { skill: "grammar", kind: "fill", prompt: `Fill in: I wish I ___ (${base}) harder.`, accept: [past], explain: `wish + past for present regrets → ${past}.` };
    },
  },
  {
    prefix: "gg-reported", level: "B2", size: 12,
    at(i, rng) {
      const pairs: [string, string][] = [["am", "was"], ["like", "liked"], ["will go", "would go"], ["can swim", "could swim"], ["live", "lived"], ["is", "was"], ["have", "had"], ["eat", "ate"], ["study", "studied"], ["know", "knew"], ["work", "worked"], ["play", "played"]];
      const [direct, back] = pairs[i % pairs.length];
      const { choices, answerIndex } = order4(back, shuffled([direct, "had " + back, back + "s"], rng), rng);
      return { skill: "grammar", kind: "choice", prompt: `She said she ___ tired. ("I ${direct} tired.")`, choices, answerIndex, explain: `Reported speech shifts back: ${direct} → ${back}.` };
    },
  },
  {
    prefix: "gg-so", level: "B2", size: 12,
    at(i, rng) {
      const pos = i % 2 === 0;
      const likes = ["kimchi", "movies", "Seoul", "winter", "green tea", "mornings"];
      const dislikes = ["crowds", "spicy food", "rainy days", "noise", "waiting", "cold coffee"];
      const k = Math.floor(i / 2) % 6;
      const ans = pos ? "So do I" : "Neither do I";
      const prompt = pos ? `"I love ${likes[k]}." — "___."` : `"I don't like ${dislikes[k]}." — "___."`;
      const { choices, answerIndex } = order4(ans, pos ? ["So I do", "Neither do I", "So am I"] : ["Neither I do", "So do I", "Nor I do"], rng);
      return { skill: "grammar", kind: "choice", prompt, choices, answerIndex, explain: pos ? "Agreement: So + auxiliary + I." : "Negative agreement: Neither + auxiliary + I." };
    },
  },

  // ---- C1 ----
  {
    prefix: "gg-inv", level: "C1", size: 12,
    at(i, rng) {
      const frames: { head: string; ans: string; wrong: string[]; why: string }[] = [
        { head: "___ I arrived home, the phone rang.", ans: "Hardly had", wrong: ["Hardly I had", "Hardly have", "Hardly did"], why: "Hardly + inversion: Hardly had I arrived…" },
        { head: "___ I known, I would have acted.", ans: "Had", wrong: ["If", "Have", "Would"], why: "If-dropped inversion: Had I known…" },
        { head: "___ did I know the truth.", ans: "Little", wrong: ["Few", "A little", "Small"], why: "Little + inversion + past: Little did I know." },
        { head: "___ only was he late, he forgot the files.", ans: "Not", wrong: ["No", "Never", "But"], why: "Not only + inversion: Not only was he…" },
        { head: "___ sooner had she spoken than she regretted it.", ans: "No", wrong: ["Not", "Never", "Soon"], why: "No sooner + inversion: No sooner had she…" },
        { head: "___ have I seen such beauty.", ans: "Never", wrong: ["Ever", "Still", "Already"], why: "Fronted negative + inversion: Never have I seen…" },
        { head: "___ had they left when the storm hit.", ans: "Barely", wrong: ["Just", "Only", "Merely"], why: "Barely + inversion: Barely had they left…" },
        { head: "___ will I trust him again.", ans: "Seldom", wrong: ["Often", "Always", "Usually"], why: "Seldom + inversion: Seldom will I trust…" },
        { head: "___ a sound did she make.", ans: "Not", wrong: ["No", "Any", "None"], why: "Not + inversion: Not a sound did she make." },
        { head: "___ in history has a team come back like this.", ans: "Rarely", wrong: ["Usually", "Often", "Sometimes"], why: "Rarely + inversion: Rarely in history has…" },
        { head: "___ you need help, call me.", ans: "Should", wrong: ["Would", "Could", "Will"], why: "If-dropped type-1: Should you need…" },
        { head: "___ the teacher enter, the class stood up.", ans: "No sooner did", wrong: ["No sooner does", "No sooner do", "Soon"], why: "No sooner + did-inversion for present-tense story." },
      ];
      const f = frames[i % frames.length];
      const { choices, answerIndex } = order4(f.ans, f.wrong, rng);
      return { skill: "grammar", kind: "choice", prompt: `Fill in: ${f.head}`, choices, answerIndex, explain: f.why };
    },
  },
  {
    prefix: "gg-subj", level: "C1", size: 8,
    at(i, rng) {
      const triggers: [string, string][] = [
        ["It is imperative that everyone ___ silent.", "remain"],
        ["I suggest he ___ a doctor.", "see"],
        ["They demanded she ___ at once.", "leave"],
        ["It is essential that he ___ on time.", "be"],
        ["The judge insisted he ___ the truth.", "tell"],
        ["Her coach suggested she ___ early.", "leave"],
        ["The rules require that visitors ___ tickets.", "buy"],
        ["They proposed she ___ the team.", "lead"],
      ];
      const wrongPool: Record<string, string[]> = {
        remain: ["remains", "remained", "remaining"], see: ["sees", "saw", "seeing"],
        leave: ["leaves", "left", "leaving"], be: ["is", "was", "being"],
        tell: ["tells", "told", "telling"], buy: ["buys", "bought", "buying"],
        lead: ["leads", "led", "leading"],
      };
      const [prompt, ans] = triggers[i % triggers.length];
      const { choices, answerIndex } = order4(ans, wrongPool[ans] ?? ["is", "was", "be"], rng);
      return { skill: "grammar", kind: "choice", prompt, choices, answerIndex, explain: "Formal subjunctive: trigger + base verb." };
    },
  },
  {
    prefix: "gg-futperf", level: "C1", size: 12,
    at(i) {
      const verbs: [string, string][] = [["finish", "finished"], ["leave", "left"], ["eat", "eaten"], ["build", "built"], ["write", "written"], ["arrive", "arrived"], ["close", "closed"], ["paint", "painted"], ["read", "read"], ["sleep", "slept"], ["spend", "spent"], ["fix", "fixed"]];
      const [base, pp] = verbs[i % verbs.length];
      const ans = `will have ${pp}`;
      return { skill: "grammar", kind: "fill", prompt: `Fill in: By tomorrow, they ___ the job. (${base})`, accept: [ans], explain: `Future perfect: will have + ${pp}.` };
    },
  },

  // ---- C2 ----
  {
    prefix: "gg-c2cond", level: "C2", size: 8,
    at(i, rng) {
      const frames: { q: string; ans: string; wrong: string[]; why: string }[] = [
        { q: "But for your help, we ___ failed.", ans: "would have", wrong: ["will have", "had", "have"], why: "But for + noun, would have p.p." },
        { q: "___ it not been for the storm, we would have left.", ans: "Had", wrong: ["Was", "If", "Has"], why: "Inverted if: Had it not been for…" },
        { q: "He speaks as though he ___ everything.", ans: "knew", wrong: ["knows", "had known", "will know"], why: "as though + past for present unreality." },
        { q: "Were she ___ earlier, she would have come. (inform)", ans: "informed", wrong: ["inform", "informing", "informs"], why: "Were + subject + p.p. (past-perfect inversion)." },
        { q: "___ she told, nobody believed her.", ans: "Whatever", wrong: ["Whenever", "Wherever", "However"], why: "Whatever = no matter what (concessive)." },
        { q: "Had I ___ harder, I would have passed. (study)", ans: "studied", wrong: ["study", "studying", "studies"], why: "Had + subject + p.p. (past-perfect inversion)." },
        { q: "___ you need help, just call me.", ans: "Should", wrong: ["Would", "Could", "Will"], why: "If-dropped type-1: Should you need…" },
        { q: "___ you like it or not, we leave now.", ans: "Whether", wrong: ["If", "Unless", "Though"], why: "Whether … or not (two-option condition)." },
      ];
      const f = frames[i % frames.length];
      const { choices, answerIndex } = order4(f.ans, f.wrong, rng);
      return { skill: "grammar", kind: "choice", prompt: f.q, choices, answerIndex, explain: f.why };
    },
  },
  {
    prefix: "gg-formal", level: "C2", size: 24,
    at(i, rng) {
      const pairs: [string, string][] = [
        ["buy", "purchase"], ["get", "obtain"], ["ask", "inquire"], ["tell", "inform"], ["show", "demonstrate"],
        ["start", "commence"], ["end", "terminate"], ["help", "facilitate"], ["need", "require"], ["use", "utilize"],
        ["rise", "escalate"], ["worsen", "exacerbate"], ["enough", "sufficient"], ["too many", "excessive"],
      ];
      const [plain, formal] = pairs[i % pairs.length];
      const d = shuffled(pairs.filter((p) => p[1] !== formal).map((p) => p[1]), rng).slice(0, 3);
      const { choices, answerIndex } = order4(formal, d, rng);
      return { skill: "vocab", kind: "choice", prompt: `Formal for "${plain}"?`, choices, answerIndex, explain: `${plain} → ${formal} (exam/academic register).`, word: `gen:${formal}` };
    },
  },
];

// ---------------------------------------------------------------------------
// Pool access
// ---------------------------------------------------------------------------

interface Slice {
  t: Template;
  start: number;
}

const BY_LEVEL = new Map<CEFR, Slice[]>();
for (const t of TEMPLATES) {
  const list = BY_LEVEL.get(t.level) ?? [];
  const start = list.reduce((a, s) => a + s.t.size, 0);
  list.push({ t, start });
  BY_LEVEL.set(t.level, list);
}

/** Exact unique count for a level (vocab forward+reverse + all templates). */
export function genPoolSize(level: CEFR): number {
  const list = BY_LEVEL.get(level) ?? [];
  return list.reduce((a, s) => a + s.t.size, 0);
}

/** Flat word list for tooling (scripts/build-wordlist.mts). */
export function genWordList(): { level: CEFR; en: string }[] {
  const out: { level: CEFR; en: string }[] = [];
  (Object.keys(WORDS) as CEFR[]).forEach((level) => {
    for (const [en] of WORDS[level]) out.push({ level, en });
  });
  return out;
}

/** Total across all levels. */
export function genPoolTotal(): number {
  return TEMPLATES.reduce((a, t) => a + t.size, 0);
}

/** One item by global index. Same (level, idx, salt) → byte-identical item. */
export function genItem(level: CEFR, idx: number, salt: string | number = ""): BankItem {
  const list = BY_LEVEL.get(level) ?? [];
  const size = genPoolSize(level);
  const k = ((idx % size) + size) % size;
  let slice = list[0];
  let local = k;
  for (const s of list) {
    if (k >= s.start && k < s.start + s.t.size) {
      slice = s;
      local = k - s.start;
      break;
    }
  }
  const rng = mulberry32(hashStr(`gen|${level}|${slice.t.prefix}|${local}|${salt}`));
  const made = slice.t.at(local, rng);
  return { id: `${slice.t.prefix}-${local}`, level, ...made };
}

/**
 * Sample n items, skipping excluded ids (learn-seen). Seeded shuffle of the
 * index space, so the same salt replays the same set (no mid-quiz jumps).
 * When the pool is exhausted, repeats are allowed but kept unique in-batch.
 */
export function genBatch(
  level: CEFR,
  n: number,
  exclude: string[] = [],
  salt: string | number = "",
): BankItem[] {
  const size = genPoolSize(level);
  const out: BankItem[] = [];
  if (size === 0 || n <= 0) return out;
  const rng = mulberry32(hashStr(`genbatch|${level}|${salt}`));
  const order = shuffled(Array.from({ length: size }, (_, i) => i), rng);
  const banned = new Set(exclude);
  const used = new Set<string>();
  for (const k of order) {
    if (out.length >= n) break;
    const item = genItem(level, k, salt);
    if (banned.has(item.id) || used.has(item.id)) continue;
    used.add(item.id);
    out.push(item);
  }
  // Pool exhausted (heavy exclusion): allow repeats, still unique in-batch.
  if (out.length < n) {
    for (const k of order) {
      if (out.length >= n) break;
      const item = genItem(level, k, salt);
      if (used.has(item.id)) continue;
      used.add(item.id);
      out.push(item);
    }
  }
  return out;
}

// --- review-tab resolution cache (generated + AI items, memory-only) --------

const GEN_CACHE = new Map<string, BankItem>();
const GEN_CACHE_CAP = 1500;

export function rememberGenItems(items: BankItem[]): void {
  for (const it of items) {
    if (typeof it.word === "string" && it.word) {
      if (GEN_CACHE.size >= GEN_CACHE_CAP) {
        const first = GEN_CACHE.keys().next();
        if (!first.done) GEN_CACHE.delete(first.value);
      }
      GEN_CACHE.set(it.word, it);
    }
  }
}

export function lookupGenWord(word: string): BankItem | null {
  return GEN_CACHE.get(word) ?? null;
}

// --- AI Fresh Set: validate model-generated JSON into BankItems -------------

interface AiRaw {
  prompt?: unknown;
  choices?: unknown;
  answer?: unknown;
  explain?: unknown;
}

/** Parse a model reply into validated choice items (max 8). Never throws —
 * returns [] when the model rambles instead of emitting JSON. */
export function parseAiItems(text: string, level: CEFR): BankItem[] {
  try {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const raw = (fence ? fence[1] : text).trim();
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start < 0 || end <= start) return [];
    const arr = JSON.parse(raw.slice(start, end + 1)) as unknown;
    if (!Array.isArray(arr)) return [];
    const out: BankItem[] = [];
    for (const q of arr.slice(0, 8)) {
      const r = q as AiRaw;
      if (typeof r.prompt !== "string" || !r.prompt.trim()) continue;
      if (!Array.isArray(r.choices) || r.choices.length !== 4) continue;
      if (!r.choices.every((c) => typeof c === "string" && (c as string).trim())) continue;
      if (typeof r.answer !== "number" || r.answer < 0 || r.answer > 3) continue;
      if (typeof r.explain !== "string" || !r.explain.trim()) continue;
      const choices = (r.choices as string[]).map((c) => c.trim().slice(0, 120));
      if (new Set(choices.map((c) => c.toLowerCase())).size !== 4) continue;
      const id = `ai-${hashStr(`${level}|${r.prompt}|${choices[r.answer]}`).toString(36)}`;
      out.push({
        id,
        skill: "vocab",
        level,
        kind: "choice",
        prompt: r.prompt.trim().slice(0, 200),
        choices,
        answerIndex: r.answer,
        explain: r.explain.trim().slice(0, 200),
        word: `ai:${id}`,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Prompt that asks the model for a JSON-only fresh question set. */
export function buildFreshSetPrompt(level: CEFR, goal: string, avoid: string[]): string {
  return [
    `Create 5 multiple-choice English quiz questions for a ${level} learner (goal: ${goal}).`,
    "Mix vocabulary and grammar. Wrong options must be plausible (same word class, common confusions).",
    avoid.length > 0 ? `Do NOT test these words/topics again: ${avoid.slice(0, 12).join(", ")}.` : "",
    "Reply with ONLY a JSON array, no other text:",
    `[{"prompt": "...", "choices": ["...", "...", "...", "..."], "answer": 0, "explain": "one short line"}]`,
    "answer is the 0-based index of the correct choice. explain under 15 words.",
  ].filter(Boolean).join("\n");
}
