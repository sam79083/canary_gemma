// Listening + shadowing engine.
//
// Three modes:
//   dictate-word  — TTS speaks a frequency word, learner types it
//   dictate-sent  — TTS speaks a level-graded sentence, learner types it
//   comprehend    — TTS speaks a level-graded clip, learner answers a choice
// Shadowing (repeat-after-me) is scored by wordHitRate() against the mic
// transcript in components/learn/ShadowBox.tsx.
//
// Content: hand-authored, CEFR-graded corpus (LISTEN_DICTATION +
// LISTEN_COMPREHENSION), padded past the curated set by a generator whose
// index space covers every noun×adjective×object×place combination and
// whose comprehension questions are coherent by construction (the answer
// is read straight from the template that built the sentence — the old
// version asked about words that were not in the clip).
//
// Self-contained (type-only cross-imports) so plain `node --test` covers it.

import type { BankItem, CEFR } from "./learn-bank";

export type ListenMode = "dictate-word" | "dictate-sent" | "comprehend";

export interface ListenItem extends BankItem {
  listenMode: ListenMode;
  /** Exact text the TTS reads aloud. */
  audio: string;
  /** For dictation: ids of the script this item belongs to. */
  transcriptNote?: string;
}

/** Comprehension clip: audio + authored question, choices, answer. */
export interface ScriptItem {
  audio: string;
  question: string;
  choices: [string, string, string, string];
  answer: number;
  explain: string;
}

export const LISTEN_DICTATION: Record<CEFR, string[]> = {
  A1: [
    "I have two brothers and one sister.",
    "She works at a coffee shop near my house.",
    "We usually eat dinner at seven o'clock.",
    "Can you help me find the train station?",
    "My favorite color is blue.",
    "He doesn't like cold weather.",
    "There are three books on the table.",
    "I go to school by bus every morning.",
    "Let's meet in front of the library.",
    "The movie starts at half past eight.",
    "She is learning English on her phone.",
    "I need to buy some milk and eggs.",
  ],
  A2: [
    "I've been waiting for the bus for twenty minutes.",
    "If it rains tomorrow, we'll stay at home.",
    "Could you tell me how to get to the airport?",
    "She's been working here since last summer.",
    "I'd rather walk than take a taxi.",
    "The restaurant was so crowded that we left.",
    "He asked me to send him the report by Friday.",
    "We were watching TV when the power went out.",
    "This is the best coffee I've ever had.",
    "I'm looking forward to meeting your family.",
    "You should check the weather before you leave.",
    "I forgot to charge my phone last night.",
  ],
  B1: [
    "I've been thinking about changing my job for a while.",
    "If I had more free time, I would learn to play the guitar.",
    "The company is planning to open three new offices next year.",
    "Even though it was raining, we decided to go for a walk.",
    "She apologized for being late and explained what had happened.",
    "The book was so interesting that I finished it in one weekend.",
    "You'd better take an umbrella in case it rains later.",
    "I used to be afraid of speaking in public, but not anymore.",
    "The meeting has been postponed until next Tuesday.",
    "It's worth checking the reviews before you book the hotel.",
    "He's not used to driving on the left side of the road.",
    "By the time we arrived, the concert had already started.",
  ],
  B2: [
    "The proposal was rejected on the grounds that it would cost too much.",
    "Had I known about the traffic, I would have left much earlier.",
    "The research suggests that regular exercise improves memory.",
    "She managed to convince the committee despite strong opposition.",
    "The government is under pressure to address the housing crisis.",
    "What struck me most was how calmly she handled the criticism.",
    "The company's profits have risen steadily over the past decade.",
    "No sooner had we sat down than the waiter brought the menu.",
    "It's not that I disagree; it's just that the timing feels wrong.",
    "The documentary sheds light on a problem few people are aware of.",
  ],
  C1: [
    "The findings challenge the assumption that economic growth inevitably reduces poverty.",
    "While the theory is elegant, it falls short of explaining the anomalies observed in practice.",
    "Negotiations broke down after both sides refused to compromise on the disputed territory.",
    "Her argument, however compelling, rests on a questionable interpretation of the data.",
    "The committee recommended that the policy be reviewed in light of recent evidence.",
    "Far from resolving the dispute, the ruling merely postponed the inevitable confrontation.",
    "The novel offers a nuanced portrayal of a society grappling with rapid modernization.",
    "Critics argue that the reforms, though well-intentioned, may exacerbate existing inequalities.",
    "The study underscores the need for a more coordinated approach to climate adaptation.",
    "What distinguishes her work is an unwavering commitment to intellectual honesty.",
  ],
  C2: [
    "The philosopher's treatise, dense yet lucid, interrogates the very foundations of moral obligation.",
    "Such is the ambiguity of the clause that jurists remain divided over its intended scope.",
    "The historian cautions against reading contemporary anxieties into the motivations of long-dead actors.",
    "Her detractors, unable to fault her logic, resorted instead to impugning her motives.",
    "The report's conclusions were tempered by caveats that, in effect, rendered them toothless.",
    "Rarely has a scientific consensus been so thoroughly undermined by its own proponents.",
    "The artistry lies not in what the narrative states but in what it delicately withholds.",
    "To attribute the collapse solely to external pressures would be to ignore its self-inflicted wounds.",
    "The treatise's central thesis, once heretical, has since become almost axiomatic.",
    "What emerges is a portrait of a man at once brilliant and incapable of self-scrutiny.",
  ],
};

export const LISTEN_COMPREHENSION: Record<CEFR, ScriptItem[]> = {
  A1: [
    {
      audio: "Hi, I'd like a large coffee and a cheese sandwich, please.",
      question: "What did the person order?",
      choices: [
        "A small tea and a cake",
        "A large coffee and a cheese sandwich",
        "A bottle of water and soup",
        "Two coffees and a salad",
      ],
      answer: 1,
      explain: "They ordered a large coffee and a cheese sandwich.",
    },
    {
      audio: "The train to London leaves at six fifteen from platform three.",
      question: "What time does the train leave?",
      choices: ["Six fifty", "Six fifteen", "Five thirty", "Seven fifteen"],
      answer: 1,
      explain: "The announcement says six fifteen.",
    },
    {
      audio: "I'm sorry, we're closed. We open again at nine tomorrow morning.",
      question: "When will the shop open?",
      choices: ["Right now", "At nine tonight", "At nine tomorrow morning", "At eight tomorrow"],
      answer: 2,
      explain: "The shop opens at nine tomorrow morning.",
    },
    {
      audio: "My sister is a nurse. She works at the city hospital.",
      question: "Where does the sister work?",
      choices: ["At a school", "At a bank", "At the city hospital", "At a restaurant"],
      answer: 2,
      explain: "She works at the city hospital as a nurse.",
    },
    {
      audio: "It's cold outside. Don't forget your coat.",
      question: "What should you take?",
      choices: ["A coat", "An umbrella", "A hat", "Sunglasses"],
      answer: 0,
      explain: "It's cold, so take a coat.",
    },
    {
      audio: "Turn left at the bank, then walk straight for two minutes. The museum is on your right.",
      question: "Where is the museum?",
      choices: ["On the left, past the bank", "On the right, after you turn", "Next to the bank", "Behind the school"],
      answer: 1,
      explain: "After turning left at the bank, the museum is on the right.",
    },
  ],
  A2: [
    {
      audio: "Sorry I'm late. The bus didn't come, so I walked.",
      question: "Why was the speaker late?",
      choices: ["They missed the bus", "The bus didn't come", "They took a taxi", "They woke up late"],
      answer: 1,
      explain: "The bus never came, so they walked.",
    },
    {
      audio: "We're meeting at the restaurant at seven, but let's have a drink nearby first — maybe at six thirty.",
      question: "What time will they have a drink?",
      choices: ["Seven", "Six thirty", "Six", "Seven thirty"],
      answer: 1,
      explain: "The drink comes first, at six thirty.",
    },
    {
      audio: "The doctor said I should rest for two days and drink plenty of water.",
      question: "What did the doctor suggest?",
      choices: ["Exercise and coffee", "Rest and water", "Medicine and soup", "Sleep and juice"],
      answer: 1,
      explain: "Rest for two days and drink plenty of water.",
    },
    {
      audio: "I tried to call you, but your phone was off. I booked the tickets anyway — row twelve.",
      question: "What did the speaker do?",
      choices: ["Cancel the tickets", "Book the tickets", "Call again later", "Wait to book"],
      answer: 1,
      explain: "They booked the tickets: row twelve.",
    },
    {
      audio: "This jacket is fifty dollars, but if you buy two, you get twenty percent off.",
      question: "What happens if you buy two jackets?",
      choices: ["You pay fifty dollars", "You get twenty percent off", "You get one free", "You pay one hundred dollars"],
      answer: 1,
      explain: "Buying two gives you twenty percent off.",
    },
    {
      audio: "The flight is delayed because of bad weather, so we'll board at gate twenty in about an hour.",
      question: "Why is the flight delayed?",
      choices: ["A technical problem", "Bad weather", "A late crew", "Airport traffic"],
      answer: 1,
      explain: "Bad weather delayed the flight.",
    },
  ],
  B1: [
    {
      audio: "I've been to that café three times this week. Their cakes are amazing, but honestly, the coffee is nothing special.",
      question: "What does the speaker think of the café?",
      choices: [
        "Both the cakes and coffee are great",
        "The cakes are better than the coffee",
        "The coffee is better than the cakes",
        "Neither is worth visiting",
      ],
      answer: 1,
      explain: "The cakes are amazing, but the coffee is 'nothing special'.",
    },
    {
      audio: "At first the job sounded boring, but the more I learned about the team, the more interested I became.",
      question: "How does the speaker feel now?",
      choices: ["Still bored", "More interested", "Angry about the job", "Confused about the team"],
      answer: 1,
      explain: "'The more interested I became' — the speaker warmed to the job.",
    },
    {
      audio: "I'd love to join you for dinner, but I promised my parents I'd help them move this evening.",
      question: "Why can't the speaker join?",
      choices: ["They are sick", "They promised to help their parents", "They don't like the restaurant", "They have to work late"],
      answer: 1,
      explain: "They promised to help their parents move.",
    },
    {
      audio: "The museum is free on Sundays, though you still have to book a time slot online.",
      question: "What must visitors do on Sundays?",
      choices: ["Pay full price", "Book a time slot", "Arrive before noon", "Bring their ID"],
      answer: 1,
      explain: "It's free, but you still have to book a time slot.",
    },
    {
      audio: "Our train was cancelled, so we ended up renting a car and driving overnight — never again.",
      question: "How did they travel in the end?",
      choices: ["By train", "By car", "By plane", "By bus"],
      answer: 1,
      explain: "They rented a car and drove all night.",
    },
    {
      audio: "She suggested we meet earlier to avoid the traffic, which turned out to be the best advice all week.",
      question: "What does the speaker mean?",
      choices: ["Meeting earlier was a mistake", "The advice worked well", "Traffic was not a problem", "They arrived late anyway"],
      answer: 1,
      explain: "'The best advice all week' — it worked well.",
    },
  ],
  B2: [
    {
      audio: "The company claims the new system will save time, but the staff say it creates more paperwork than before.",
      question: "What is the disagreement about?",
      choices: ["The cost of the system", "Whether the system saves time", "Who designed the system", "When to install the system"],
      answer: 1,
      explain: "The company says it saves time; the staff disagree.",
    },
    {
      audio: "Had she known how long the interview would take, she would have cleared her whole afternoon.",
      question: "What does this imply?",
      choices: [
        "The interview was shorter than expected",
        "The interview took longer than expected",
        "She missed the interview",
        "Her afternoon was free",
      ],
      answer: 1,
      explain: "The third conditional implies it took longer than she expected.",
    },
    {
      audio: "The city plans to ban cars from the center, arguing that shops will actually benefit from the extra foot traffic.",
      question: "What is the city's argument?",
      choices: ["Cars bring more customers", "Fewer cars will help shops", "The ban will reduce tourism", "The center needs more parking"],
      answer: 1,
      explain: "More pedestrians means more customers for shops, they argue.",
    },
    {
      audio: "I don't doubt his talent; I doubt his willingness to put in the work when nobody is watching.",
      question: "What is the speaker's concern?",
      choices: ["His talent", "His effort", "His honesty", "His salary"],
      answer: 1,
      explain: "The doubt is about effort, not talent.",
    },
    {
      audio: "Researchers found that people who took short breaks every hour remained more focused than those who worked straight through.",
      question: "What did the research find?",
      choices: [
        "Longer work hours improve focus",
        "Short breaks help maintain focus",
        "Breaks reduce overall productivity",
        "Focus depends on personality",
      ],
      answer: 1,
      explain: "Short hourly breaks kept people more focused.",
    },
    {
      audio: "The restaurant had glowing reviews, yet the service on the night we visited was so slow we nearly left before dessert.",
      question: "What was the speaker's experience?",
      choices: ["Better than expected", "Disappointing despite the reviews", "The best dessert ever", "Fast but unfriendly service"],
      answer: 1,
      explain: "'Glowing reviews, yet...' — the reality disappointed.",
    },
  ],
  C1: [
    {
      audio: "It would be premature to draw conclusions from a sample this small; the effect may well disappear with more data.",
      question: "What is the speaker's point?",
      choices: ["The results are conclusive", "The sample is too small to conclude", "More data will confirm the effect", "The study should be canceled"],
      answer: 1,
      explain: "'Premature... a sample this small' — no conclusions yet.",
    },
    {
      audio: "The proposal, though ambitious, is not as costly as its critics claim once you account for the long-term savings.",
      question: "What does the speaker believe?",
      choices: ["The proposal is too expensive", "Critics overstate the cost", "The savings are irrelevant", "The plan is unambitious"],
      answer: 1,
      explain: "Long-term savings make it cheaper than critics claim.",
    },
    {
      audio: "She speaks with such conviction that it's easy to forget she hasn't actually read the report she's citing.",
      question: "What is implied about the person being described?",
      choices: [
        "She wrote the report",
        "She seems convincing despite not reading the report",
        "She refuses to discuss the report",
        "She read the report twice",
      ],
      answer: 1,
      explain: "The irony: conviction without having read the report.",
    },
    {
      audio: "Had the warning been taken seriously, the damage — now estimated in the billions — could have been a fraction of the cost.",
      question: "What could have reduced the damage?",
      choices: ["Spending billions", "Acting on the warning", "Waiting for estimates", "Ignoring the alarm"],
      answer: 1,
      explain: "Acting on the warning would have cut the cost to a fraction.",
    },
    {
      audio: "The argument assumes that what works in one market will translate seamlessly to another, an assumption that the evidence hardly supports.",
      question: "What does the speaker criticize?",
      choices: ["The market data", "The assumption of transferability", "The cost of translation", "The evidence itself"],
      answer: 1,
      explain: "The weak assumption is that success transfers between markets.",
    },
    {
      audio: "What the report lacks in length it makes up for in precision; every recommendation is tied to a measurable target.",
      question: "What is the speaker praising?",
      choices: ["The report's length", "The precision of its recommendations", "The number of targets", "The writing style"],
      answer: 1,
      explain: "Short but precise, with measurable targets.",
    },
  ],
  C2: [
    {
      audio: "His defense of the policy amounts to little more than a restatement of its premises, dressed up in the language of evidence.",
      question: "What is the speaker's view of his defense?",
      choices: ["It presents new evidence", "It merely repeats its assumptions", "It is carefully argued", "It is difficult to understand"],
      answer: 1,
      explain: "The defense restates premises rather than offering evidence.",
    },
    {
      audio: "To mistake her silence for agreement would be to repeat the error that cost them the negotiation.",
      question: "What does the speaker warn against?",
      choices: ["Assuming her silence means agreement", "Speaking too much in meetings", "Reopening the negotiation", "Ignoring the previous error"],
      answer: 0,
      explain: "Silence is not consent — that mistake cost them once already.",
    },
    {
      audio: "The novel's ending, so often dismissed as abrupt, is in fact the only conclusion its logic could sustain.",
      question: "What does the speaker think of the ending?",
      choices: ["It is too abrupt", "It fits the novel's logic", "It should be rewritten", "It is predictable"],
      answer: 1,
      explain: "The ending follows necessarily from the novel's logic.",
    },
    {
      audio: "That the reforms failed is uncontested; whether they were doomed from the start is another question entirely.",
      question: "What distinction does the speaker draw?",
      choices: ["Between failure and inevitability", "Between reform and revolution", "Between success and popularity", "Between the past and the future"],
      answer: 0,
      explain: "Failure is certain; inevitability is a separate question.",
    },
    {
      audio: "The committee's findings, however cautiously worded, point in a direction its sponsors would rather not acknowledge.",
      question: "What is implied about the sponsors?",
      choices: ["They welcome the findings", "The findings point somewhere they dislike", "They wrote the findings", "They will ignore the committee"],
      answer: 1,
      explain: "The findings lead where the sponsors don't want to look.",
    },
    {
      audio: "Nothing in her career became her like the way she left it — without complaint, and on her own terms.",
      question: "What is the speaker praising?",
      choices: ["Her career achievements", "The manner of her departure", "Her complaints", "Her early retirement"],
      answer: 1,
      explain: "The way she left — quietly and on her own terms — is what the speaker admires.",
    },
  ],
};

// --- generated padding: simple S-V-O / S-be-Adj patterns, concrete words ----

const NOUNS = [
  "cat", "dog", "bus", "book", "baby", "rain", "coffee", "phone", "teacher",
  "park", "doctor", "movie", "garden", "bird", "child", "kitchen", "letter",
  "market", "music", "river", "sister", "street", "sun", "train",
];
const ADJS = [
  "big", "happy", "busy", "early", "fast", "clean", "warm", "bright",
  "quiet", "fresh", "kind", "late",
];
const OBJS = [
  "apples", "music", "books", "movies", "coffee", "tea", "rice", "pictures",
  "songs", "letters", "football", "lunch",
];
const PLACES = ["park", "home", "school", "market", "garden", "library"];
const TIMES = ["six", "seven", "eight", "nine", "ten", "eleven"];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const GEN_COMBO = NOUNS.length * ADJS.length * OBJS.length * PLACES.length * TIMES.length * DAYS.length;
// 24·12·12·6·6·6 = 746,496 combinations.

/** Coprime with GEN_COMBO (2⁸·3⁵·… no factor 7919) so consecutive request
 *  indices land far apart in the combination space. */
const GEN_STRIDE = 7919;

interface GenSentence {
  audio: string;
  question: string;
  choices: string[];
  answerIndex: number;
  explain: string;
}

/** Every index yields a distinct noun×adj×obj×place combination, and the
 *  comprehension question is generated from the SAME template that built
 *  the sentence, so the answer is always actually in the audio. */
function genSentence(i: number): GenSentence {
  const mix = ((i * GEN_STRIDE) % GEN_COMBO + GEN_COMBO) % GEN_COMBO;
  const n = NOUNS[mix % NOUNS.length];
  const a = ADJS[Math.floor(mix / NOUNS.length) % ADJS.length];
  const o = OBJS[Math.floor(mix / (NOUNS.length * ADJS.length)) % OBJS.length];
  const p = PLACES[Math.floor(mix / (NOUNS.length * ADJS.length * OBJS.length)) % PLACES.length];
  const t = TIMES[Math.floor(mix / (NOUNS.length * ADJS.length * OBJS.length * PLACES.length)) % TIMES.length];
  const d = DAYS[Math.floor(mix / (NOUNS.length * ADJS.length * OBJS.length * PLACES.length * TIMES.length)) % DAYS.length];
  const others = <T,>(arr: T[], cur: T, seed: number): T[] => {
    const pick: T[] = [];
    for (let step = 1; pick.length < 3; step++) {
      const cand = arr[(Math.abs(seed) + step * 7) % arr.length];
      if (cand !== cur && !pick.includes(cand)) pick.push(cand);
    }
    return pick;
  };
  const rotate = (choices: string[], answer: string, seed: number): { choices: string[]; answerIndex: number } => {
    // Divide by the template cycle so the answer position varies within a
    // template too (seed%4 would pin it to the template's own residue).
    const rot = Math.floor(seed / 4) % choices.length;
    const ordered = [...choices.slice(rot), ...choices.slice(0, rot)];
    return { choices: ordered, answerIndex: ordered.indexOf(answer) };
  };
  switch (mix % 4) {
    case 0: {
      const q = rotate([a, ...others(ADJS, a, mix)], a, mix);
      return {
        audio: `The ${n} is ${a}.`,
        question: `What is the ${n} like?`,
        ...q,
        explain: `The ${n} is ${a}.`,
      };
    }
    case 1: {
      const q = rotate([o, ...others(OBJS, o, mix)], o, mix);
      return {
        audio: `I like ${o} on ${d}s.`,
        question: `What do I like on ${d}s?`,
        ...q,
        explain: `I like ${o} on ${d}s.`,
      };
    }
    case 2: {
      const q = rotate([p, ...others(PLACES, p, mix)], p, mix);
      return {
        audio: `We meet at the ${p} at ${t} o'clock.`,
        question: `Where do we meet at ${t} o'clock?`,
        ...q,
        explain: `We meet at the ${p} at ${t} o'clock.`,
      };
    }
    default: {
      const q = rotate([o, ...others(OBJS, o, mix)], o, mix);
      return {
        audio: `The ${a} ${n} likes ${o} on ${d}s.`,
        question: `What does the ${a} ${n} like on ${d}s?`,
        ...q,
        explain: `The ${a} ${n} likes ${o} on ${d}s.`,
      };
    }
  }
}

export function listenSentenceCount(level?: CEFR): number {
  const curated = level ? LISTEN_DICTATION[level].length : Object.values(LISTEN_DICTATION).reduce((n, l) => n + l.length, 0);
  return curated + GEN_COMBO;
}

export function normHeard(s: string): string {
  return (s || "")
    .toLowerCase()
    // Apostrophes dropped entirely so "don't" ≡ "dont" (typed input is
    // forgiving either way); other punctuation becomes a word break.
    .replace(/['\u2019`]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Dictation grading: exact normalized match (punct/case blind). */
export function gradeHeard(input: string, accept: string[]): boolean {
  const n = normHeard(input);
  if (!n) return false;
  return accept.some((a) => normHeard(a) === n);
}

/** Content words for shadowing/comprehension (skip tiny glue words). */
export function contentWords(sentence: string): string[] {
  return normHeard(sentence).split(" ").filter((w) => w.length > 2);
}

/**
 * Shadowing score: fraction of the sentence's content words present in the
 * mic transcript (0–1). Forgiving by design — accent-proof effort scoring.
 */
export function wordHitRate(sentence: string, transcript: string): number {
  const want = [...new Set(contentWords(sentence))];
  if (want.length === 0) return 0;
  const got = new Set(normHeard(transcript).split(" ").filter(Boolean));
  const hits = want.filter((w) => got.has(w)).length;
  return Math.round((hits / want.length) * 100) / 100;
}

function hashStr(s: string): number {
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

export function listenWordItem(level: CEFR, words: string[], idx: number, salt: string | number = ""): ListenItem {
  const k = ((idx % words.length) + words.length) % words.length;
  const word = words[k];
  void salt;
  return {
    id: `li-w-${level.toLowerCase()}-${k}`,
    skill: "listening",
    level,
    kind: "fill",
    prompt: "🔊 Listen and type the word:",
    audio: word,
    accept: [word],
    explain: `"${word}" — say it aloud once more.`,
    word: `listen:${word}`,
    listenMode: "dictate-word",
  };
}

/** Curated dictation first (stable per-level ids), generator padding after. */
export function listenSentenceItem(level: CEFR, idx: number, salt: string | number = ""): ListenItem {
  void salt;
  const curated = LISTEN_DICTATION[level];
  const k = ((idx % listenSentenceCount(level)) + listenSentenceCount(level)) % listenSentenceCount(level);
  if (k < curated.length) {
    const s = curated[k];
    return {
      id: `li-s-${level.toLowerCase()}-c${k}`,
      skill: "listening",
      level,
      kind: "fill",
      prompt: "🔊 Listen and type the sentence:",
      audio: s,
      accept: [s],
      explain: `"${s}"`,
      listenMode: "dictate-sent",
      transcriptNote: `${level} dictation`,
    };
  }
  const gen = genSentence(k - curated.length);
  return {
    id: `li-s-${level.toLowerCase()}-g${k - curated.length}`,
    skill: "listening",
    level,
    kind: "fill",
    prompt: "🔊 Listen and type the sentence:",
    audio: gen.audio,
    accept: [gen.audio],
    explain: `"${gen.audio}"`,
    listenMode: "dictate-sent",
  };
}

/** Curated comprehension first (authored questions), coherent generator after. */
export function listenComprehensionItem(level: CEFR, idx: number, salt: string | number = ""): ListenItem {
  const curated = LISTEN_COMPREHENSION[level];
  const total = curated.length + GEN_COMBO;
  const k = ((idx % total) + total) % total;
  if (k < curated.length) {
    const c = curated[k];
    return {
      id: `li-c-${level.toLowerCase()}-c${k}`,
      skill: "listening",
      level,
      kind: "choice",
      prompt: `🔊 Listen — ${c.question}`,
      audio: c.audio,
      choices: [...c.choices],
      answerIndex: c.answer,
      explain: c.explain,
      listenMode: "comprehend",
      transcriptNote: `${level} comprehension`,
    };
  }
  const gen = genSentence(k - curated.length);
  return {
    id: `li-c-${level.toLowerCase()}-g${k - curated.length}`,
    skill: "listening",
    level,
    kind: "choice",
    prompt: `🔊 Listen — ${gen.question}`,
    audio: gen.audio,
    choices: gen.choices,
    answerIndex: gen.answerIndex,
    explain: gen.explain,
    listenMode: "comprehend",
  };
}

export function listenBatch(
  level: CEFR,
  words: string[],
  mode: ListenMode,
  n: number,
  exclude: string[] = [],
  salt: string | number = "",
): ListenItem[] {
  const size =
    mode === "dictate-word"
      ? words.length
      : mode === "dictate-sent"
        ? listenSentenceCount(level)
        : LISTEN_COMPREHENSION[level].length + GEN_COMBO;
  const out: ListenItem[] = [];
  if (size === 0 || n <= 0) return out;
  const rng = mulberry32(hashStr(`listenbatch|${level}|${mode}|${salt}`));
  const order = shuffled(Array.from({ length: size }, (_, i) => i), rng);
  const banned = new Set(exclude);
  const used = new Set<string>();
  const make = (k: number): ListenItem =>
    mode === "dictate-word"
      ? listenWordItem(level, words, k, salt)
      : mode === "dictate-sent"
        ? listenSentenceItem(level, k, salt)
        : listenComprehensionItem(level, k, salt);
  for (const k of order) {
    if (out.length >= n) break;
    const item = make(k);
    if (banned.has(item.id) || used.has(item.id)) continue;
    used.add(item.id);
    out.push(item);
  }
  if (out.length < n) {
    for (const k of order) {
      if (out.length >= n) break;
      const item = make(k);
      if (used.has(item.id)) continue;
      used.add(item.id);
      out.push(item);
    }
  }
  return out;
}
