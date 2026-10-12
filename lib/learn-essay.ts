// Essay mode — write on a topic, get a deterministic 0–100 grade.
// Pass mark is 80. Zero-token, offline, fully reproducible: the SAME essay
// always earns the SAME score, so progress across weeks is meaningful.
//
// Philosophy (same as the rest of Learn Mode): the rule engine owns the
// score; the AI (via chat handoff) owns the coaching. 5 axes × 20 pts:
// task response, coherence, lexical resource, grammar, mechanics.
//
// Self-contained (no runtime cross-imports) so plain `node --test` covers it.

import type { CEFR } from "./learn-bank";

export interface EssayTopic {
  id: string;
  level: CEFR;
  topic: string;
  hint: string;
  minWords: number;
  maxWords: number;
  /** Content words the essay should address (task-response check). */
  keywords: string[];
  /** Pass mark (default 80). Beginners climb 60 → 70 → 80 with the levels. */
  passMark?: number;
}

export const ESSAY_TOPICS: EssayTopic[] = [
  { id: "e-a1-1", level: "A1", topic: "Write 3 sentences about your day. What did you do?", hint: "Morning, afternoon, evening — 1 sentence each.", minWords: 25, maxWords: 60, keywords: ["day", "morning", "like"], passMark: 60 },
  { id: "e-a1-2", level: "A1", topic: "Describe your family in 3–4 sentences.", hint: "Who? How many? One thing you do together.", minWords: 25, maxWords: 60, keywords: ["family", "mother", "father"], passMark: 60 },
  { id: "e-a1-3", level: "A1", topic: "What is your favorite food? Write 3 sentences.", hint: "What, when do you eat it, why yummy.", minWords: 25, maxWords: 60, keywords: ["food", "like", "eat"], passMark: 60 },
  { id: "e-a1-4", level: "A1", topic: "Describe your room in 3–4 sentences.", hint: "Big or small? What is inside?", minWords: 25, maxWords: 60, keywords: ["room", "bed", "like"], passMark: 60 },
  { id: "e-a2-1", level: "A2", topic: "What did you do last weekend? Write 5–6 sentences.", hint: "Use past tense: went, ate, watched…", minWords: 50, maxWords: 90, keywords: ["weekend", "went", "because"], passMark: 70 },
  { id: "e-a2-2", level: "A2", topic: "Describe your best friend. What do you do together?", hint: "Looks, character, one memory.", minWords: 50, maxWords: 90, keywords: ["friend", "like", "together"], passMark: 70 },
  { id: "e-a2-3", level: "A2", topic: "Write about a trip you want to take.", hint: "Where, who with, what to do there.", minWords: 50, maxWords: 90, keywords: ["trip", "want", "because"], passMark: 70 },
  { id: "e-a2-4", level: "A2", topic: "What is your dream job? Why?", hint: "The job, why you want it, one first step.", minWords: 50, maxWords: 90, keywords: ["job", "want", "because"], passMark: 70 },
  { id: "e-b1-1", level: "B1", topic: "Describe your favorite season and explain why you like it.", hint: "Weather, activities, feelings — 3 paragraphs.", minWords: 80, maxWords: 130, keywords: ["season", "weather", "like", "because"] },
  { id: "e-b1-2", level: "B1", topic: "Should school uniforms be required? Give your opinion with reasons.", hint: "Your view + 2 reasons + conclusion.", minWords: 80, maxWords: 130, keywords: ["uniform", "school", "opinion", "because"] },
  { id: "e-b1-3", level: "B1", topic: "Describe the best gift you have ever received.", hint: "What it was, who gave it, why unforgettable.", minWords: 80, maxWords: 130, keywords: ["gift", "gave", "happy", "because"] },
  { id: "e-b1-4", level: "B1", topic: "Is it better to live in a city or in the countryside? Give your opinion.", hint: "Pick a side + 2 reasons.", minWords: 80, maxWords: 130, keywords: ["city", "countryside", "opinion", "because"] },
  { id: "e-b1-5", level: "B1", topic: "Describe a skill you want to learn and explain why.", hint: "The skill, why it matters, how you'd learn it.", minWords: 80, maxWords: 130, keywords: ["skill", "learn", "want", "because"] },
  { id: "e-b1-6", level: "B1", topic: "Do you prefer traveling alone or with friends? Explain.", hint: "Your pick + experiences.", minWords: 80, maxWords: 130, keywords: ["travel", "alone", "friends", "because"] },
  { id: "e-b2-1", level: "B2", topic: "Remote work: freedom or isolation? Discuss both sides and give your view.", hint: "Both sides, then YOUR verdict.", minWords: 150, maxWords: 200, keywords: ["remote", "work", "home", "however"] },
  { id: "e-b2-2", level: "B2", topic: "Is social media more helpful or more harmful for teenagers?", hint: "Examples + balanced judgment.", minWords: 150, maxWords: 200, keywords: ["social", "media", "teenagers", "example"] },
  { id: "e-b2-3", level: "B2", topic: "Should university education be free for everyone?", hint: "Who pays? Who benefits?", minWords: 150, maxWords: 200, keywords: ["university", "education", "free", "however"] },
  { id: "e-b2-4", level: "B2", topic: "Online shopping is killing local stores. Do you agree?", hint: "Take a position, defend it.", minWords: 150, maxWords: 200, keywords: ["online", "shopping", "stores", "however"] },
  { id: "e-b2-5", level: "B2", topic: "Describe an important decision you made recently.", hint: "The choice, the process, the result.", minWords: 150, maxWords: 200, keywords: ["decision", "made", "important", "because"] },
  { id: "e-b2-6", level: "B2", topic: "Will robots take most human jobs? Discuss.", hint: "Which jobs, when, what then?", minWords: 150, maxWords: 200, keywords: ["robots", "jobs", "humans", "however"] },
  { id: "e-c1-1", level: "C1", topic: "Should AI be allowed to grade student exams? Argue for or against.", hint: "Thesis, counterargument, rebuttal.", minWords: 220, maxWords: 280, keywords: ["exam", "students", "fair", "however"] },
  { id: "e-c1-2", level: "C1", topic: "Economic growth vs. environmental protection: can a country have both?", hint: "Nuance wins — avoid one-sidedness.", minWords: 220, maxWords: 280, keywords: ["environment", "growth", "however", "example"] },
  { id: "e-c1-3", level: "C1", topic: "Is fame today earned or manufactured by social media?", hint: "Examples of both, then judge.", minWords: 220, maxWords: 280, keywords: ["fame", "media", "however", "example"] },
  { id: "e-c1-4", level: "C1", topic: "Should voting be mandatory in democracies?", hint: "Rights vs. duties.", minWords: 220, maxWords: 280, keywords: ["voting", "democracy", "however", "example"] },
  { id: "e-c1-5", level: "C1", topic: "Does tourism do more harm than good to historic cities?", hint: "Money in, soul out?", minWords: 220, maxWords: 280, keywords: ["tourism", "cities", "however", "example"] },
  { id: "e-c1-6", level: "C1", topic: "Describe a book or film that changed how you think.", hint: "Before, the work, after.", minWords: 220, maxWords: 280, keywords: ["book", "film", "changed", "because"] },
  { id: "e-c2-1", level: "C2", topic: "Does universal basic income strengthen or weaken a society? Evaluate critically.", hint: "Define terms, weigh evidence, conclude.", minWords: 250, maxWords: 320, keywords: ["income", "society", "evidence", "however"] },
  { id: "e-c2-2", level: "C2", topic: "'Privacy is dead; convenience killed it.' To what extent do you agree?", hint: "Quote response: agree, qualify, conclude.", minWords: 250, maxWords: 320, keywords: ["privacy", "data", "convenience", "however"] },
  { id: "e-c2-3", level: "C2", topic: "Should governments ban targeted political advertising?", hint: "Free speech vs. manipulation.", minWords: 250, maxWords: 320, keywords: ["political", "advertising", "democracy", "however"] },
  { id: "e-c2-4", level: "C2", topic: "Is a four-day work week realistic for every industry?", hint: "Which industries break the model?", minWords: 250, maxWords: 320, keywords: ["work", "week", "industry", "however"] },
  { id: "e-c2-5", level: "C2", topic: "Do stricter punishments actually reduce crime?", hint: "Evidence over gut feeling.", minWords: 250, maxWords: 320, keywords: ["crime", "punishment", "evidence", "however"] },
  { id: "e-c2-6", level: "C2", topic: "Has globalization made cultures richer or flatter?", hint: "Both can be true — show it.", minWords: 250, maxWords: 320, keywords: ["culture", "global", "however", "example"] },
];

export interface EssayAxis {
  key: "task" | "coherence" | "lexical" | "grammar" | "mechanics";
  score: number;
}

export interface EssayScore {
  total: number;
  pass: boolean;
  wordCount: number;
  axes: EssayAxis[];
  /** Strengths first, then fixes — show in order. */
  feedback: string[];
}

const LINKERS = [
  "however", "moreover", "furthermore", "therefore", "thus", "hence",
  "in contrast", "on the other hand", "for example", "for instance",
  "firstly", "secondly", "thirdly", "finally", "in conclusion",
  "in addition", "although", "though", "despite", "in spite of",
  "because", "since", "while", "whereas", "nevertheless",
  "consequently", "as a result", "meanwhile",
];

const BASE_VERBS = [
  "go", "do", "have", "make", "take", "come", "watch", "play",
  "work", "like", "want", "need", "say", "get", "see", "know", "think",
];

const NO_APOSTROPHE = [
  "dont", "cant", "wont", "isnt", "arent", "wasnt", "werent",
  "didnt", "doesnt", "couldnt", "shouldnt", "wouldnt", "hasnt",
  "havent", "hadnt", "im", "ive", "ill", "id", "youre", "hes", "shes",
];

const AN_EXCEPTIONS = ["hour", "honest", "honor", "heir"];

function wordsOf(text: string): string[] {
  return (text.toLowerCase().match(/[a-z']+/g) ?? []).map((w) =>
    w.replace(/^'+|'+$/g, ""),
  ).filter(Boolean);
}

function sentencesOf(text: string): string[] {
  return text
    .split("\n")
    .flatMap((line) => line.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [])
    .map((s) => s.trim())
    .filter((s) => /[a-zA-Z]/.test(s));
}

function startsWithVowelSound(word: string): boolean {
  const w = word.toLowerCase();
  if (AN_EXCEPTIONS.includes(w)) return true;
  if (/^(uni(vers|form|que|on)|use|user|euro|one|once|ouija)/.test(w)) return false;
  return /^[aeiou]/.test(w);
}

export function gradeEssay(rawText: string, topic: EssayTopic): EssayScore {
  const text = rawText.replace(/\r/g, "");
  const words = wordsOf(text);
  const wc = words.length;
  const sentences = sentencesOf(text);
  const feedback: string[] = [];

  if (wc === 0) {
    return {
      total: 0, pass: false, wordCount: 0,
      axes: [
        { key: "task", score: 0 }, { key: "coherence", score: 0 },
        { key: "lexical", score: 0 }, { key: "grammar", score: 0 },
        { key: "mechanics", score: 0 },
      ],
      feedback: ["🦜 Write something first — even 3 messy sentences beat a blank page!"],
    };
  }

  // ---- task response (20): length fit + topical keywords ----
  let task = 0;
  if (wc >= topic.minWords && wc <= topic.maxWords) task += 12;
  else if (wc < topic.minWords) task += Math.round((12 * wc) / topic.minWords);
  else task += Math.max(0, 12 - Math.round((24 * (wc - topic.maxWords)) / topic.maxWords));
  const lower = text.toLowerCase();
  const hits = topic.keywords.filter((k) => lower.includes(k.toLowerCase()));
  task += Math.min(8, hits.length * 2);
  if (wc >= topic.minWords && wc <= topic.maxWords)
    feedback.push(`✅ Length on target (${wc} words).`);
  else if (wc < topic.minWords)
    feedback.push(`📏 Too short (${wc}/${topic.minWords}+ words) — develop one more reason.`);
  else feedback.push(`📏 A bit long (${wc}/${topic.maxWords} max) — examiners reward concision.`);

  // ---- coherence (20): paragraphs + linking words ----
  const paras = text.split(/\n+/).map((p) => p.trim()).filter((p) => /[a-zA-Z]/.test(p));
  let coherence = paras.length >= 3 ? 8 : paras.length === 2 ? 5 : 2;
  if (paras.length < 2) feedback.push("🧱 One block of text — split into intro / body / conclusion.");
  const foundLinkers = LINKERS.filter((l) => new RegExp(`\\b${l.replace(/ /g, "\\s+")}\\b`, "i").test(text));
  coherence += foundLinkers.length >= 5 ? 12 : foundLinkers.length >= 3 ? 8 : foundLinkers.length >= 1 ? 4 : 0;
  if (foundLinkers.length >= 3) feedback.push(`🔗 Nice connectors (${foundLinkers.slice(0, 4).join(", ")}).`);
  else feedback.push("🔗 Add connectors: however, for example, in conclusion…");

  // ---- lexical resource (20): variety + long words ----
  const distinct = new Set(words);
  const ttr = distinct.size / Math.max(1, wc);
  let lexical = ttr >= 0.6 ? 10 : ttr >= 0.5 ? 7 : ttr >= 0.4 ? 4 : 2;
  const longWords = new Set([...distinct].filter((w) => w.length >= 7));
  lexical += longWords.size >= 12 ? 10 : longWords.size >= 8 ? 7 : longWords.size >= 4 ? 4 : longWords.size >= 1 ? 2 : 0;
  if (ttr >= 0.5) feedback.push("📚 Good word variety — low repetition.");
  else feedback.push("📚 Many repeated words — swap in synonyms.");

  // ---- grammar (20): targeted error hunts ----
  let grammar = 20;
  const articleFixes: string[] = [];
  for (const m of text.matchAll(/\b(a|an)\s+([A-Za-z]+)/g)) {
    const needAn = startsWithVowelSound(m[2]);
    if ((m[1].toLowerCase() === "a") === needAn) {
      const fix = `${needAn ? "an" : "a"} ${m[2]}`;
      if (articleFixes.length < 8) articleFixes.push(`"${m[0]}" → "${fix}"`);
      grammar -= 3;
    }
  }
  let svHits = 0;
  for (const m of text.matchAll(/\b(he|she|it)\s+([a-z]+)/gi)) {
    if (BASE_VERBS.includes(m[2].toLowerCase())) {
      svHits++;
      grammar -= 3;
    }
  }
  let lowerStarts = 0;
  for (const s of sentences) {
    const first = s.replace(/^["'“‘\s(]+/, "")[0];
    if (first && /[a-z]/.test(first)) lowerStarts++;
  }
  grammar -= Math.min(5, lowerStarts);
  const repeated = text.match(/\b(\w+)\s+\1\b/gi) ?? [];
  grammar -= Math.min(4, repeated.length * 2);
  grammar = Math.max(0, grammar);
  if (articleFixes.length > 0) feedback.push(`✏️ Articles: ${articleFixes.slice(0, 2).join("; ")}.`);
  if (svHits > 0) feedback.push("✏️ He/she/it needs -s: he go → he goes.");
  if (lowerStarts > 0) feedback.push("✏️ Sentences start with a capital letter.");
  if (articleFixes.length === 0 && svHits === 0 && lowerStarts === 0)
    feedback.push("✅ Clean grammar — no article or agreement slips found.");

  // ---- mechanics (20) ----
  let mechanics = 20;
  if (!/[.!?…]["'”’\s]*$/.test(text.trimEnd())) {
    mechanics -= 3;
    feedback.push("✏️ End with . ! or ?");
  }
  const loneI = (text.match(/(^|[\s("'])i([\s.,!?;:'")\]]|$)/g) ?? []).length;
  mechanics -= Math.min(6, loneI);
  if (loneI > 0) feedback.push('✏️ The pronoun "I" is always capital.');
  let apos = 0;
  for (const w of NO_APOSTROPHE) {
    const re = new RegExp(`\\b${w}\\b`, "gi");
    apos += text.match(re)?.length ?? 0;
  }
  mechanics -= Math.min(5, apos);
  if (apos > 0) feedback.push("✏️ Missing apostrophes: dont → don't, im → I'm.");
  const doubles = (text.match(/  +/g) ?? []).length;
  mechanics -= Math.min(2, doubles);
  const tightCommas = (text.match(/,[a-zA-Z]/g) ?? []).length;
  mechanics -= Math.min(4, tightCommas);
  if (tightCommas > 0) feedback.push("✏️ Space after commas: hello,world → hello, world.");
  mechanics = Math.max(0, mechanics);
  if (mechanics >= 18) feedback.push("✅ Tidy punctuation and spelling.");

  let total = task + coherence + lexical + grammar + mechanics;
  if (wc < 10) total = Math.round((total * wc) / 10);
  total = Math.max(0, Math.min(100, total));

  return {
    total,
    pass: total >= (topic.passMark ?? 80),
    wordCount: wc,
    axes: [
      { key: "task", score: Math.min(20, task) },
      { key: "coherence", score: coherence },
      { key: "lexical", score: lexical },
      { key: "grammar", score: grammar },
      { key: "mechanics", score: mechanics },
    ],
    feedback: feedback.slice(0, 8),
  };
}

/** Prompt dropped into chat for qualitative AI coaching (score stays rule-based). */
export function buildEssayCoachPrompt(topic: EssayTopic, essay: string, score: EssayScore): string {
  return [
    "You are a friendly English writing coach. Review my essay below.",
    `Topic: ${topic.topic}`,
    `My rule-based score: ${score.total}/100 (${score.axes.map((a) => `${a.key} ${a.score}/20`).join(", ")}).`,
    "Reply with: 3 strengths, then 3 fixes with corrected example sentences, then one line saying whether you agree with the score. Under 200 words. Be encouraging — I'm learning!",
    "",
    "--- my essay ---",
    essay.trim(),
  ].join("\n");
}

/** Model-answer shape: intro / body / conclusion skeleton tailored to the
 * topic keywords. Shown after grading so learners can compare + rewrite —
 * the rule engine owns the score, this owns the "what would 90+ look like". */
export function essayModelShape(topic: EssayTopic): string[] {
  const kws = topic.keywords.slice(0, 4).join(", ");
  return [
    `Intro (2–3 sentences): paraphrase the topic in your own words, then state your position clearly. Touch on: ${kws}.`,
    `Body (2 paragraphs): one reason per paragraph — claim → example → link back. Use connectors: however, for example, moreover, in addition.`,
    `Conclusion (1–2 sentences): restate your view + one forward-looking line. No new arguments here.`,
    `Target: ${topic.minWords}–${topic.maxWords} words, 3+ paragraphs (blank line = new paragraph).`,
  ];
}

// --- essay history (this device; last 20 attempts) ----------------------------

export interface EssayAttempt {
  id: string;
  topicId: string;
  topic: string;
  words: number;
  total: number;
  pass: boolean;
  at: string;
}

const ESSAY_KEY = "canary-essay-history";
export const ESSAY_DRAFT_KEY = "canary-essay-draft";

export function loadEssayHistory(): EssayAttempt[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(ESSAY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (x): x is EssayAttempt =>
          !!x && typeof x === "object" &&
          typeof (x as EssayAttempt).total === "number" &&
          typeof (x as EssayAttempt).topic === "string",
      )
      .slice(0, 20);
  } catch {
    return [];
  }
}

export function saveEssayAttempt(a: EssayAttempt): EssayAttempt[] {
  const next = [a, ...loadEssayHistory()].slice(0, 20);
  try {
    if (typeof localStorage !== "undefined")
      localStorage.setItem(ESSAY_KEY, JSON.stringify(next));
  } catch {
    // best-effort
  }
  return next;
}
