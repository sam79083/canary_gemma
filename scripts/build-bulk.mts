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
    .replace(/[{}"]/g, "")
    .replace(/[^a-z0-9'\- ]/g, " ")
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
  for (const r of raw) {
    const key = normTerm(r.term);
    if (!key) continue;
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
  const items: Idiom[] = [...seen.values()].map((r, n) => ({
    id: `u-${n.toString(36)}`,
    kind: "idiom" as const,
    unlock: gradeIdiom(r.term),
    term: r.term,
    meaning: r.meaning,
    ko: "",
    example: "",
    register: "neutral" as const,
    keywords: keywordsOf(r.term),
  }));
  const stats: Record<string, number> = { raw: raw.length, kept: items.length, dup, junk, curatedSkip };
  for (const it of items) stats[it.unlock] = (stats[it.unlock] ?? 0) + 1;
  return { items, stats };
}

// --- frequency words --------------------------------------------------------
// google-10000-english.txt is frequency-ordered (rank 1 = "the").
// Bands → levels. Single alpha words only (spelling + future pipelines).

const WORD_BANDS: { level: CEFR; until: number }[] = [
  { level: "A1", until: 1500 },
  { level: "A2", until: 3500 },
  { level: "B1", until: 5500 },
  { level: "B2", until: 7500 },
  { level: "C1", until: 9000 },
  { level: "C2", until: Number.MAX_SAFE_INTEGER },
];

function buildWords(): { bands: Record<CEFR, string[]>; total: number } {
  const lines = fs.readFileSync(SRC_WORDS, "utf8").split("\n");
  const words: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const w = line.trim().toLowerCase();
    if (!/^[a-z]{2,14}$/.test(w) || seen.has(w)) continue;
    seen.add(w);
    words.push(w);
  }
  const bands = { A1: [], A2: [], B1: [], B2: [], C1: [], C2: [] } as Record<CEFR, string[]>;
  words.forEach((w, rank) => {
    const band = WORD_BANDS.find((b) => rank < b.until) ?? WORD_BANDS[5];
    bands[band.level].push(w);
  });
  return { bands, total: words.length };
}

// --- emit -------------------------------------------------------------------

function emitIdioms(items: Idiom[]): string {
  const body = items
    .map(
      (it) =>
        `  { id: ${JSON.stringify(it.id)}, kind: "idiom", unlock: ${JSON.stringify(it.unlock)}, term: ${JSON.stringify(it.term)}, meaning: ${JSON.stringify(it.meaning)}, ko: "", example: "", register: "neutral", keywords: ${JSON.stringify(it.keywords)} },`,
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
  const { bands, total } = buildWords();
  console.log(
    "words:",
    total,
    (Object.keys(bands) as CEFR[]).map((lv) => `${lv}:${bands[lv].length}`).join(" "),
  );
  fs.writeFileSync(OUT_WORDS, emitWords(bands));
  console.log("wrote", OUT_IDIOMS, "+", OUT_WORDS);
}

const isMain =
  !!process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();
