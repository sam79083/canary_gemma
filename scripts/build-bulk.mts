// Bulk content builder: 1,000+ quiz-able items per level from openly
// licensed bulk files (no API keys, no network — runs fully offline).
//
// Sources (committed under data-sources/ for reproducibility):
//   idioms-baiango.csv  — 500+ EN idioms + meanings, The Unlicense
//     (https://github.com/baiango/english_idioms)
//   google-10000-english.txt — frequency-ordered EN words, first20hours
//     (https://github.com/first20hours/google-10000-english)
//
// Outputs (committed; "DO NOT EDIT" — regenerate via this script):
//   lib/idioms-bulk.ts — cleaned Idiom[] (deduped, junk-filtered,
//     level-graded B1/B2/C1, try-it keywords extracted)
//   lib/words-bulk.ts  — frequency-graded spelling pools per level
//
//   npm run bulk:build
//
// Level grading is heuristic and documented below (frequency rank for words,
// term-complexity for idioms) — the placement test + adaptive lessons still
// own the learner's true level.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { IDIOMS } from "../lib/learn-idioms.ts";
import type { CEFR, Idiom } from "../lib/learn-idioms.ts";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC_IDIOMS = path.join(ROOT, "data-sources", "idioms-baiango.csv");
const SRC_WORDS = path.join(ROOT, "data-sources", "google-10000-english.txt");
const OUT_IDIOMS = path.join(ROOT, "lib", "idioms-bulk.ts");
const OUT_WORDS = path.join(ROOT, "lib", "words-bulk.ts");

// --- shared ---------------------------------------------------------------

function normTerm(s: string): string {
  return s
    .toLowerCase()
    .replace(/['\u2019`]/g, "")
    .replace(/[{}"]/g, "")
    .replace(/[^a-z0-9\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// --- idioms ---------------------------------------------------------------

// Literal non-idioms spotted in the raw CSV (facts, menu items, moon phases…).
// Exact normalized matches only — never fuzzy, so real idioms are safe.
const JUNK = new Set(
  [
    "fine wine", "fine wine selection", "juicy burger", "fast food",
    "gift with love", "heartfelt gift", "in the cityscape",
    "open the door carefully", "handle the door with care", "select top wines",
    "morning glow", "celebrate with joy", "mark the occasion joyfully",
    "defend your position", "defend your beliefs", "grasp the main idea",
    "in the files", "first light", "new moon", "full moon", "waxing moon",
    "waning moon", "halfway there", "break of day", "break of dawn",
    "at the break of day", "at daybreak", "dawn of a new day",
    "in the morning light", "in the early morning", "in the starry night",
    "in the moonlight", "savor the flavor", "fly high", "start anew",
    "new day dawns", "aim for success", "top hat", "suit and tie",
    "red light", "desert island", "around the world", "in the driver's seat",
    "in the cityscape",
  ].map((s) => s.toLowerCase()),
);

const ARCHAIC = /\b(hath|thee|thou|thy|doth|ere|whence|hark|henceforth|wherefore|alas|hither|thither)\b/i;

/** Vulgar / adult / hateful terms never ship in learner content. */
const VULGAR = /\b(fuck\w*|shit\w*|cunt\w*|whore\w*|slut\w*|bitch\w*|dick\w*|cock\w*|pussy\w*|tits?\b|boobs?\b|titten|penis|vagina|orgasm\w*|orgy|hentai|porn\w*|nude|naked|milf|erotic\w*|sexual\w*|sex|rape\w*|nigger|faggot|retard\w*|bastard|damn\b|ass\b|asses\b|bastards?)\b/i;

/** Korean glosses for the most common idioms (build-time overlay; entries
 *  that do not match a CSV term are simply unused). Key = normTerm(term). */
const KO_GLOSS: Record<string, string> = {
  "break a leg": "행운을 빌어요!",
  "costs an arm and a leg": "엄청 비싸다",
  "cut to the chase": "본론으로 들어가다",
  "drive someone up the wall": "짜증나게 만들다",
  "hit the nail on the head": "정확히 맞히다",
  "kick the bucket": "죽다 (속어)",
  "let the cat out of the bag": "비밀을 누설하다",
  "miss the boat": "기회를 놓치다",
  "on the same page": "같은 생각이다",
  "piece of cake": "식은 죽 먹기",
  "rain on someones parade": "남의 계획에 찬물을 끼얹다",
  "saved by the bell": "마지막 순간에 구제되다",
  "see eye to eye": "의견이 일치하다",
  "throw in the towel": "포기하다",
  "under the weather": "몸이 안 좋다",
  "up in the air": "아직 미정이다",
  "when pigs fly": "절대 일어나지 않는다",
  "you cant have your cake and eat it too": "둘 다 가질 수는 없다",
  "add insult to injury": "설상가상",
  "burning the midnight oil": "밤늦게까지 일하다",
  "dont count your chickens before they hatch": "김칫국부터 마시지 마라",
  "dont put all your eggs in one basket": "한 곳에 전부 걸지 마라",
  "hear it on the grapevine": "소문으로 듣다",
  "hold your horses": "조금만 기다려라",
  "in hot water": "곤경에 처한",
  "make a long story short": "간단히 말하자면",
  "time flies when youre having fun": "즐거우면 시간이 빨리 간다",
  "actions speak louder than words": "행동이 말보다 앞선다",
  "all ears": "귀를 기울이고 있다",
  "fit as a fiddle": "아주 건강하다",
  "go the extra mile": "한 걸음 더 나아가다",
  "jump the gun": "성급히 행동하다",
  "keep a straight face": "웃음을 참다",
  "like a fish out of water": "어색하고 불편하다",
  "the elephant in the room": "모두 알지만 외면하는 문제",
  "a dime a dozen": "흔해 빠진",
  "back to the drawing board": "처음부터 다시 시작하다",
  "bite the bullet": "이를 악물고 견디다",
  "spill the beans": "비밀을 폭로하다",
  "hit the sack": "잠자리에 들다",
  "break the ice": "어색함을 깨다",
  "once in a blue moon": "아주 가끔",
  "beat around the bush": "빙빙 돌려 말하다",
  "pull yourself together": "정신 차려라",
  "by the skin of your teeth": "간신히",
  "speak of the devil": "호랑이도 제 말 하면 온다",
  "the ball is in your court": "이제 네 차례다",
  "blow off steam": "스트레스를 풀다",
  "hit the books": "공부를 시작하다",
  "take your time": "천천히 하세요",
  "never mind": "신경 쓰지 마세요",
  "good luck": "행운을 빌어요",
  "my bad": "내 실수야 (캐주얼)",
  "what a pity": "안됐다",
  "i got it": "이해했어요",
  "no problem": "천만에요",
  "sounds good": "좋아요",
  "how is it going": "어떻게 지내세요?",
  "see you soon": "곧 봐요",
};

/** Words that must never ship (vulgar/adult/brand/acronym/web-corpus junk).
 *  Real English words stay — learners should see "page", "search", "free". */
const WORD_BLOCK = new Set(
  [
    // vulgar / sexual / hateful (belt-and-braces with the VULGAR regex)
    "sex", "sexy", "nude", "nudes", "naked", "porn", "porno", "xxx",
    "milf", "hentai", "erotic", "erotica", "orgasm", "orgy", "escort",
    "stripper", "strippers", "bikini", "lingerie", "condom", "viagra",
    "fuck", "fucked", "fucking", "fucker", "shit", "shitty", "bitch",
    "slut", "whore", "dick", "cock", "pussy", "tits", "titten", "boob",
    "boobs", "penis", "vagina", "anal", "anus", "rape", "nigger",
    "faggot", "retard", "bastard", "damn", "ass", "asses", "horny",
    // brands / sites that leaked in from web corpora
    "ebay", "yahoo", "msn", "myspace", "netscape", "flickr", "google",
    "youtube", "wikipedia", "amazon", "paypal", "blogspot", "wordpress",
    // acronyms / code / non-words
    "goto", "aka", "tt", "api", "url", "http", "https", "www", "html",
    "css", "php", "sql", "xml", "ftp", "cgi", "dll", "exe", "dom",
    "ajax", "gif", "jpg", "jpeg", "png", "pdf", "mp3", "mp4", "wav",
    "usb", "dvd", "cpu", "gpu", "ram", "rom", "bios", "sms", "gps",
    "dna", "fbi", "cia", "usa", "uk", "eu", "un", "gmt", "utc",
    "tv", "pc", "dj", "id", "ip", "os", "ok", "vs", "etc", "eg",
    "vs", "p.m", "a.m",
  ].map((w) => w.toLowerCase()),
);

/** Two-letter words are kept only when they are genuinely common English
 *  (the frequency list is otherwise full of truncations like "tt/pp/zz"). */
const TWO_CHAR_OK = new Set(
  "a an am as at be by do go he hi if in is it me my no of on or ox so to up us we ye".split(" "),
);

const KEY_STOP = new Set(
  "a,an,the,to,of,and,or,in,on,at,for,with,your,you,me,my,it,its,is,are,be,as,by,from,that,this,these,those,so,such,no,not,but,if,then,than,too,very,just,all,any,own,same,up,out,off,over,into,onto,away,back,down,whose,whom".split(","),
);

function keywordsOf(term: string): string[] {
  const words = normTerm(term)
    .split(" ")
    .filter((w) => w.length > 2 && !KEY_STOP.has(w));
  const out = [...new Set(words)].slice(0, 4);
  return out.length > 0 ? out : [normTerm(term).split(" ")[0] || "idiom"];
}

/** Heuristic grade: archaic → C1; long/rare-looking terms → B2; else B1.
 * Bulk never claims C2 (exam-grade stays curated). Deterministic. */
export function gradeIdiom(term: string): CEFR {
  if (ARCHAIC.test(term)) return "C1";
  const words = normTerm(term).split(" ").filter(Boolean);
  if (words.length === 0) return "B1";
  const long = words.filter((w) => w.length >= 8).length;
  if (long >= 1 || words.length >= 7) return words.length >= 9 || long >= 2 ? "C1" : "B2";
  return "B1";
}

interface RawIdiom {
  term: string;
  meaning: string;
}

function parseIdiomCsv(text: string): RawIdiom[] {
  const out: RawIdiom[] = [];
  for (let line of text.split("\n")) {
    let t = line.trim();
    if (!t) continue;
    // Lines are CSV-quoted: "{term}>>{meaning}"
    if (t.startsWith('"') && t.endsWith('"')) t = t.slice(1, -1);
    const m = t.match(/^\{(.*)\}>>\{(.*)\}$/);
    if (!m) continue;
    const term = m[1].replace(/"+/g, "").replace(/\s+/g, " ").trim();
    const meaning = m[2].replace(/"+/g, "").replace(/\s+/g, " ").trim();
    if (!term || !meaning || meaning.length < 2) continue;
    if (term.length > 90) continue;
    out.push({ term, meaning });
  }
  return out;
}

function buildIdioms(): { items: Idiom[]; stats: Record<string, number> } {
  const raw = parseIdiomCsv(fs.readFileSync(SRC_IDIOMS, "utf8"));
  const curated = new Set(IDIOMS.map((i) => normTerm(i.term)));
  const seen = new Map<string, RawIdiom>();
  let dup = 0;
  let junk = 0;
  let curatedSkip = 0;
  let vulgar = 0;
  let glossed = 0;
  for (const r of raw) {
    const key = normTerm(r.term);
    if (!key) continue;
    if (VULGAR.test(r.term) || VULGAR.test(r.meaning)) {
      vulgar++;
      continue;
    }
    if (JUNK.has(key)) {
      junk++;
      continue;
    }
    if (curated.has(key)) {
      curatedSkip++;
      continue;
    }
    const prev = seen.get(key);
    if (prev) {
      dup++;
      // keep the most informative meaning
      if (r.meaning.length > prev.meaning.length) seen.set(key, r);
      continue;
    }
    seen.set(key, r);
  }
  const items: Idiom[] = [...seen.entries()].map(([key, r], n) => {
    const ko = KO_GLOSS[key] ?? "";
    if (ko) glossed++;
    return {
      id: `u-${n.toString(36)}`,
      kind: "idiom" as const,
      unlock: gradeIdiom(r.term),
      term: r.term,
      meaning: r.meaning,
      ko,
      example: "",
      register: "neutral" as const,
      keywords: keywordsOf(r.term),
    };
  });
  const stats: Record<string, number> = { raw: raw.length, kept: items.length, dup, junk, curatedSkip, vulgar, glossed };
  for (const it of items) stats[it.unlock] = (stats[it.unlock] ?? 0) + 1;
  return { items, stats };
}

// --- frequency words --------------------------------------------------------
// google-10000-english.txt is frequency-ordered (rank 1 = "the").
// Bands → levels. Single alpha words only (spelling + future pipelines).

/** Target sizes per level (frequency order); the tail fills C2 and, if C2
 *  would fall under MIN_PER_LEVEL, the C1/C2 boundary is rebalanced. */
const WORD_TARGET: { level: CEFR; size: number }[] = [
  { level: "A1", size: 1500 },
  { level: "A2", size: 2000 },
  { level: "B1", size: 2000 },
  { level: "B2", size: 2000 },
  { level: "C1", size: 1500 },
];
const MIN_PER_LEVEL = 900;

function buildWords(): { bands: Record<CEFR, string[]>; total: number; filtered: number } {
  const lines = fs.readFileSync(SRC_WORDS, "utf8").split("\n");
  const words: string[] = [];
  const seen = new Set<string>();
  let filtered = 0;
  for (const line of lines) {
    const w = line.trim().toLowerCase();
    if (!/^[a-z]{2,14}$/.test(w) || seen.has(w)) continue;
    if (WORD_BLOCK.has(w) || VULGAR.test(w)) {
      filtered++;
      continue;
    }
    if (w.length === 2 && !TWO_CHAR_OK.has(w)) {
      filtered++;
      continue;
    }
    seen.add(w);
    words.push(w);
  }
  const bands = { A1: [], A2: [], B1: [], B2: [], C1: [], C2: [] } as Record<CEFR, string[]>;
  let i = 0;
  for (const band of WORD_TARGET) {
    bands[band.level] = words.slice(i, i + band.size);
    i += band.size;
  }
  bands.C2 = words.slice(i);
  // Rebalance C1 → C2 when the tail is thin (filtering hits low ranks most).
  while (bands.C2.length < MIN_PER_LEVEL && bands.C1.length > MIN_PER_LEVEL) {
    bands.C2.unshift(bands.C1.pop()!);
  }
  return { bands, total: words.length, filtered };
}

// --- emit -------------------------------------------------------------------

function emitIdioms(items: Idiom[]): string {
  const body = items
    .map(
      (it) =>
        `  { id: ${JSON.stringify(it.id)}, kind: "idiom", unlock: ${JSON.stringify(it.unlock)}, term: ${JSON.stringify(it.term)}, meaning: ${JSON.stringify(it.meaning)}, ko: ${JSON.stringify(it.ko)}, example: "", register: "neutral", keywords: ${JSON.stringify(it.keywords)} },`,
    )
    .join("\n");
  return `// GENERATED by scripts/build-bulk.mts - DO NOT EDIT BY HAND.
// ${items.length} public-domain idioms (baiango/english_idioms, Unlicense),
// deduped + junk-filtered + level-graded. Regenerate: npm run bulk:build.
import type { Idiom } from "./learn-idioms";

export const BULK_IDIOMS: Idiom[] = [
${body}
];
`;
}

function emitWords(bands: Record<CEFR, string[]>): string {
  const body = (Object.keys(bands) as CEFR[])
    .map((lv) => `  ${lv}: ${JSON.stringify(bands[lv])},`)
    .join("\n");
  return `// GENERATED by scripts/build-bulk.mts - DO NOT EDIT BY HAND.
// Frequency-graded spelling pools from google-10000-english (first20hours).
// Regenerate: npm run bulk:build.
import type { CEFR } from "./learn-bank";

export const BULK_WORDS: Record<CEFR, string[]> = {
${body}
};
`;
}

function main(): void {
  const { items, stats } = buildIdioms();
  console.log("idioms:", JSON.stringify(stats));
  fs.writeFileSync(OUT_IDIOMS, emitIdioms(items));
  const { bands, total, filtered } = buildWords();
  console.log(
    "words:",
    total,
    `(filtered ${filtered})`,
    (Object.keys(bands) as CEFR[]).map((lv) => `${lv}:${bands[lv].length}`).join(" "),
  );
  fs.writeFileSync(OUT_WORDS, emitWords(bands));
  console.log("wrote", OUT_IDIOMS, "+", OUT_WORDS);
}

const isMain =
  !!process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();
