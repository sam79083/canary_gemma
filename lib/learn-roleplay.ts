// Roleplay scenarios — structured production for beginners who freeze at
// free chat. Each scenario is a character + a 3-goal checklist; goals are
// keyword-graded deterministically (Chat awards +3 XP per first completion).
//
// Self-contained (no runtime cross-imports) so plain `node --test` covers it.

import type { CEFR } from "./learn-bank";
import type { ChatMessage } from "./types";

export interface RoleGoal {
  label: string;
  /** Normalized keywords — ALL must appear in one learner message. */
  keywords: string[];
}

export interface Scenario {
  id: string;
  name: string;
  icon: string;
  setting: string;
  opener: string;
  /** Built-ins always carry 3; custom scenes carry 0–3 (or none). */
  goals: RoleGoal[];
  /** One-sentence takeaway shown in the wrap-up message when the scene clears. */
  tip: string;
}

// NOTE: settings are phrased as "Role: ..." (never a leading "You are a …").
// A bare "You are a barista" conflicts with the on-device model's guardrailed
// identity and makes it dump its self-description instead of roleplaying.
// roleplayLine() wraps these as "Scene: ..." under an identity-safe frame,
// so the AI answers dynamically in character for EVERY scenario — nothing
// about any scene's replies is hardcoded beyond the opener + goal keywords.
export const SCENARIOS: Scenario[] = [
  {
    id: "cafe", name: "Cafe Order", icon: "☕",
    setting: "Role: friendly cafe barista taking the customer's order step by step.",
    opener: "Hi there! Welcome to Coco Cafe. What can I get for you today?",
    tip: "In cafes, lead with 'I'd like…' or 'Can I get…' — then size, then temperature: 'a tall iced americano'.",
    goals: [
      {
        label: "Order a drink",
        keywords: [
          "coffee", "americano", "latte", "espresso", "cappuccino", "mocha",
          "tea", "ade", "juice", "smoothie", "drink", "order", "please",
        ],
      },
      {
        label: "Pick a size",
        keywords: ["small", "medium", "large", "regular", "short", "tall", "grande", "venti"],
      },
      { label: "Say thanks", keywords: ["thank"] },
    ],
  },
  {
    id: "interview", name: "Job Interview", icon: "💼",
    setting: "Role: kind job interviewer for a part-time cafe job, asking one question at a time.",
    opener: "Thanks for coming in! First — tell me a little about yourself.",
    tip: "Start answers with 'I' + a verb — 'I worked…', 'I learned…'. Short and confident beats long and vague.",
    goals: [
      // "m" catches "I'm …" (normalized to "i m"); bare "am" never appears in it.
      { label: "Introduce yourself", keywords: ["name", "called", "am", "m", "my", "from", "student", "work", "live"] },
      {
        label: "Name a strength",
        keywords: [
          "hard", "friendly", "careful", "punctual", "responsible", "diligent",
          "team", "organized", "patient", "honest", "creative", "learner", "fast", "kind",
        ],
      },
      { label: "Ask a question back", keywords: ["?"] },
    ],
  },
  {
    id: "airport", name: "Airport Help", icon: "✈️",
    setting: "Role: patient airport information desk clerk helping a lost, slightly stressed traveler.",
    opener: "Hello! How can I help you today?",
    tip: "Question word first, then the place: 'Where is Gate 12?' beats 'Gate 12 where?' every time.",
    goals: [
      {
        label: "Say where you go",
        keywords: [
          "go", "flight", "gate", "bus", "seoul", "busan", "tokyo", "jeju",
          "incheon", "gimpo", "transfer", "transit", "connecting", "terminal",
          "train", "subway", "taxi", "baggage", "luggage", "departure", "arrival",
        ],
      },
      {
        label: "Show your ticket/time",
        keywords: [
          "ticket", "time", "late", "morning", "afternoon", "evening", "night",
          "boarding", "delay", "clock", "passport", "reservation", "miss", "book",
        ],
      },
      { label: "Ask for directions", keywords: ["where", "how", "which", "way"] },
    ],
  },
  {
    id: "hotel", name: "Hotel Check-in", icon: "🏨",
    setting: "Role: warm hotel receptionist checking the guest in, one step at a time.",
    opener: "Good evening! Welcome to Hotel Coco. Do you have a reservation?",
    tip: "Keep one sentence ready: 'I have a reservation under [name].' It solves half of check-in.",
    goals: [
      { label: "Give your name", keywords: ["name", "reservation", "book", "confirm", "confirmation", "under", "stay"] },
      // "wi-fi" could never match (normalized to "wi fi"), so match both halves.
      {
        label: "Ask about breakfast/wifi",
        keywords: ["breakfast", "wifi", "wi", "fi", "internet", "pool", "gym", "parking", "lobby", "time", "checkout"],
      },
      {
        label: "Confirm the room",
        keywords: ["room", "key", "card", "floor", "night", "twin", "double", "suite", "view", "smoke"],
      },
    ],
  },
  {
    id: "smalltalk", name: "Small Talk", icon: "💬",
    setting: "Role: friendly classmate chatting lightly before class, asking about the learner too.",
    opener: "Hey! How was your weekend?",
    tip: "'Because' is your best friend — one reason turns a 3-word answer into real conversation.",
    goals: [
      { label: "Answer + reason (because)", keywords: ["because", "cuz", "cos", "since"] },
      { label: "Ask back", keywords: ["?"] },
      {
        label: "Use past tense",
        keywords: [
          "was", "were", "went", "did", "had", "watched", "visited", "played",
          "ate", "drank", "slept", "woke", "met", "saw", "got", "took",
          "came", "left", "felt", "thought", "said", "told", "made", "bought",
          "spent", "tried",
        ],
      },
    ],
  },
  {
    id: "doctor", name: "Doctor Visit", icon: "🩺",
    setting: "Role: gentle clinic doctor asking about the patient's symptoms one at a time.",
    opener: "Hello, come in. What seems to be the problem today?",
    tip: "Say 'since Monday', not 'from Monday' — duration ('for three days') or start point ('since Monday') is what clinics chart.",
    goals: [
      {
        label: "Describe the symptom",
        keywords: [
          "hurt", "pain", "sick", "fever", "cough", "headache", "cold", "stomach",
          "sore", "throat", "dizzy", "nose", "runny", "stuffy", "ache",
          "vomit", "rash", "swollen", "tired",
        ],
      },
      {
        label: "Say since when",
        keywords: ["since", "yesterday", "today", "last", "night", "morning", "days", "hours", "week", "month", "ago", "just"],
      },
      {
        label: "Ask for medicine/advice",
        keywords: ["medicine", "pill", "syrup", "treatment", "should", "advice", "prescription", "recommend", "rest", "help"],
      },
    ],
  },
  {
    id: "restaurant", name: "Restaurant", icon: "🍽️",
    setting: "Role: friendly restaurant server taking a dine-in order, handling one request at a time.",
    opener: "Good evening! Table for how many?",
    tip: "Put 'no' or 'without' right before the item ('no cheese, please') — and allergies always as 'I'm allergic to…', never just 'no'.",
    goals: [
      {
        label: "Order food",
        keywords: [
          "menu", "order", "burger", "pasta", "pizza", "chicken", "rice",
          "salad", "steak", "soup", "noodle", "fish", "sandwich", "fries",
          "curry", "sushi", "ramen", "dessert", "cake", "bread", "water",
          "want", "please",
        ],
      },
      {
        label: "Customize or flag allergy",
        keywords: [
          "without", "less", "extra", "spicy", "mild", "salty", "sweet",
          "allergy", "allergic", "vegetarian", "sauce", "cheese", "dressing",
          "side", "ice", "medium", "rare", "done",
        ],
      },
      {
        label: "Ask for the bill",
        keywords: ["bill", "check", "pay", "card", "cash", "much", "split", "together", "receipt"],
      },
    ],
  },
  {
    id: "taxi", name: "Taxi Ride", icon: "🚕",
    setting: "Role: friendly taxi driver confirming the destination and route, one thing at a time.",
    opener: "Hello! Where to?",
    tip: "Place first, landmark second: 'Myeongdong — the main street entrance.' Drivers navigate by landmarks, not addresses.",
    goals: [
      {
        label: "Say the destination",
        keywords: [
          "airport", "station", "terminal", "hotel", "hospital", "school",
          "university", "office", "apartment", "mart", "mall", "gangnam",
          "hongdae", "myeongdong", "itaewon", "address", "street", "downtown",
          "subway", "bus", "take", "go",
        ],
      },
      {
        label: "Confirm route or fare",
        keywords: [
          "much", "fare", "long", "minutes", "far", "fast", "slow", "hurry",
          "meter", "traffic", "jam", "left", "right", "straight", "corner",
          "card", "cash", "how",
        ],
      },
      // No "good": it fires on a plain "good morning" before the ride starts.
      { label: "Arrive + say thanks", keywords: ["thank", "here", "stop", "perfect", "great", "bye"] },
    ],
  },
  {
    id: "phone", name: "Phone Booking", icon: "📞",
    setting: "Role: polite receptionist taking a phone booking, asking for one detail at a time.",
    opener: "Good morning, Happy Clinic. How can I help you?",
    tip: "Day + time in one breath — 'Friday morning', 'tomorrow at 3' — then spell your name. That order prevents most callbacks.",
    goals: [
      {
        label: "Say what you need",
        keywords: [
          "appointment", "book", "reserve", "doctor", "dentist", "see",
          "checkup", "consultation", "haircut", "table", "salon", "visit",
          "sick", "cancel", "cancelled", "canceled", "change",
        ],
      },
      {
        label: "Give a day or time",
        keywords: [
          "monday", "tuesday", "wednesday", "thursday", "friday",
          "saturday", "sunday", "today", "tomorrow", "tonight", "weekend",
          "morning", "afternoon", "evening", "night", "noon", "clock", "time",
        ],
      },
      // No "great"/"perfect": they fire on turn-1 softeners ("Perfect, I'd like…").
      { label: "Confirm details", keywords: ["name", "number", "phone", "mobile", "confirm", "confirmation", "spell", "thank", "yes"] },
    ],
  },
  {
    id: "return", name: "Store Exchange", icon: "🛍️",
    setting: "Role: helpful store clerk handling a return or exchange, one step at a time.",
    opener: "Hi! What can I do for you today?",
    tip: "Facts first, ask second: 'I bought this yesterday' + receipt, then 'Can I exchange it?' — the order makes 'yes' easy.",
    goals: [
      {
        label: "Explain the problem",
        keywords: [
          "return", "exchange", "refund", "broken", "wrong", "size", "small",
          "big", "large", "long", "tight", "color", "different", "hole",
          "missing", "fade", "damage", "defect", "rip", "stain",
        ],
      },
      {
        label: "Say when / receipt",
        keywords: ["receipt", "yesterday", "today", "last", "bought", "week", "month", "days", "hours", "ago", "just"],
      },
      {
        label: "Ask for a solution",
        keywords: ["change", "possible", "can", "could", "another", "new", "please", "refund", "credit", "send", "replace", "replacement"],
      },
    ],
  },
];

const ROLE_KEY = "canary-roleplay";
const ROLE_DONE_KEY = "canary-roleplay-done";

export function scenarioById(id: string | null | undefined): Scenario | null {
  if (!id) return null;
  return SCENARIOS.find((s) => s.id === id) ?? null;
}

export function isCustomId(id: string | null | undefined): boolean {
  return !!id && id.startsWith("custom-");
}

// ---- User-created scenes (option A: no more hardcoded-only list) ----

export interface CustomDraft {
  name: string;
  icon: string;
  setting: string;
  opener: string;
  /** Plain goal labels, 0–3 used (keywords are derived, not asked). */
  goals: string[];
}

export interface CustomScene extends CustomDraft {
  id: string;
}

const CUSTOM_KEY = "canary-custom-scenes";
const MAX_CUSTOM = 20;

const LABEL_STOP = new Set([
  "the", "a", "an", "to", "for", "of", "and", "or", "my", "your", "you",
  "with", "that", "this", "about", "please", "on", "in", "at", "is", "are", "it",
]);

/** Gradeable keywords derived from a user's goal label ("Order a pizza" → order+pizza). */
export function keywordsFromLabel(label: string): string[] {
  return ((label || "").toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((w) => w.length > 2 && !LABEL_STOP.has(w))
    .slice(0, 6);
}

const CUSTOM_TIP =
  "Free practice counts too — notice which sentences felt easy, and reuse them next time.";

export function toScenario(c: CustomScene): Scenario {
  return {
    id: c.id,
    name: c.name,
    icon: c.icon,
    setting: `Role: ${c.setting}`,
    opener: c.opener,
    goals: c.goals.map((label) => ({ label, keywords: keywordsFromLabel(label) })),
    tip: CUSTOM_TIP,
  };
}

/** Built-in or custom scene by id (customs supplied by the caller). */
export function resolveScenario(
  id: string | null | undefined,
  customs: CustomScene[] = [],
): Scenario | null {
  if (!id) return null;
  const builtin = SCENARIOS.find((s) => s.id === id);
  if (builtin) return builtin;
  const custom = customs.find((c) => c.id === id);
  return custom ? toScenario(custom) : null;
}

export function createCustomScene(d: CustomDraft): CustomScene | null {
  const name = (d.name || "").trim().slice(0, 30);
  const setting = (d.setting || "").trim().slice(0, 300);
  if (!name || !setting) return null;
  const opener = (d.opener || "").trim().slice(0, 200) || "Hi! Let's practice — you start.";
  const goals = (Array.isArray(d.goals) ? d.goals : [])
    .map((g) => (g || "").trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 3);
  const icon = (d.icon || "").trim().slice(0, 4) || "🎭";
  return { id: `custom-${Date.now().toString(36)}`, name, icon, setting, opener, goals };
}

export function loadCustomScenes(): CustomScene[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (x): x is CustomScene =>
          !!x &&
          typeof x === "object" &&
          typeof (x as CustomScene).id === "string" &&
          (x as CustomScene).id.startsWith("custom-") &&
          typeof (x as CustomScene).name === "string" &&
          (x as CustomScene).name.trim() !== "" &&
          typeof (x as CustomScene).setting === "string" &&
          (x as CustomScene).setting.trim() !== "",
      )
      .map((x) => ({
        id: (x as CustomScene).id.slice(0, 40),
        name: (x as CustomScene).name.trim().slice(0, 30),
        icon: typeof (x as CustomScene).icon === "string" && (x as CustomScene).icon.trim()
          ? (x as CustomScene).icon.trim().slice(0, 4)
          : "🎭",
        setting: (x as CustomScene).setting.trim().slice(0, 300),
        opener: typeof (x as CustomScene).opener === "string" && (x as CustomScene).opener.trim()
          ? (x as CustomScene).opener.trim().slice(0, 200)
          : "Hi! Let's practice — you start.",
        goals: Array.isArray((x as CustomScene).goals)
          ? (x as CustomScene).goals
            .filter((g): g is string => typeof g === "string" && g.trim() !== "")
            .map((g) => g.trim().slice(0, 60))
            .slice(0, 3)
          : [],
      }))
      .slice(0, MAX_CUSTOM);
  } catch {
    return [];
  }
}

export function saveCustomScenes(list: CustomScene[]): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(list.slice(0, MAX_CUSTOM)));
  } catch {
    // best-effort
  }
}

export function loadRoleplay(): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(ROLE_KEY);
    // Built-ins plus user-created scenes (custom ids survive reload too).
    return raw && (SCENARIOS.some((s) => s.id === raw) || raw.startsWith("custom-")) ? raw : null;
  } catch {
    return null;
  }
}

export function saveRoleplay(id: string | null): void {
  try {
    if (typeof localStorage === "undefined") return;
    if (id) localStorage.setItem(ROLE_KEY, id);
    else localStorage.removeItem(ROLE_KEY);
  } catch {
    // best-effort
  }
}

const DONE_OFF: [boolean, boolean, boolean] = [false, false, false];

/** Goal checkmarks for a scene (survive reload via localStorage). */
export function loadRoleDone(id: string | null | undefined): [boolean, boolean, boolean] {
  try {
    if (typeof localStorage === "undefined" || !id) return [...DONE_OFF] as [boolean, boolean, boolean];
    const raw = localStorage.getItem(ROLE_DONE_KEY);
    if (!raw) return [...DONE_OFF] as [boolean, boolean, boolean];
    const obj = JSON.parse(raw) as unknown;
    const arr = (obj as Record<string, unknown>)?.[id];
    if (!Array.isArray(arr) || arr.length !== 3) return [...DONE_OFF] as [boolean, boolean, boolean];
    return [arr[0] === true, arr[1] === true, arr[2] === true];
  } catch {
    return [...DONE_OFF] as [boolean, boolean, boolean];
  }
}

export function saveRoleDone(id: string | null | undefined, done: boolean[]): void {
  try {
    if (typeof localStorage === "undefined" || !id) return;
    const raw = localStorage.getItem(ROLE_DONE_KEY);
    let obj: Record<string, boolean[]> = {};
    try {
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      if (parsed && typeof parsed === "object") obj = parsed as Record<string, boolean[]>;
    } catch {
      obj = {};
    }
    obj[id] = [done[0] === true, done[1] === true, done[2] === true];
    localStorage.setItem(ROLE_DONE_KEY, JSON.stringify(obj));
  } catch {
    // best-effort
  }
}

/** Wrap-up recap pushed as an assistant message when a scene clears. */
export function buildRoleWrapUp(sc: Scenario): string {
  const did = sc.goals.map((g) => g.label).join(" · ");
  return `🏆 ${sc.icon} ${sc.name} cleared! You: ${did}. 💡 Tip: ${sc.tip}`;
}

/**
 * Pre-played demo conversation for `?demo=cafe` (the hiring-link tour).
 * A flawed first order showcases the 💡 Fix layer, a clean follow-up omits
 * it, the 💬 lines parse into one-tap chips via extractExamples, and it
 * closes with the real wrap-up. Seeded messages bypass XP/scoring.
 */
export function buildDemoScript(): ChatMessage[] {
  const sc = scenarioById("cafe");
  if (!sc) return [];
  const wrap = buildRoleWrapUp(sc);
  const script: Array<[ChatMessage["role"], string]> = [
    ["assistant", `${sc.icon} ${sc.opener}`],
    ["user", "Give me ice americano big please"],
    [
      "assistant",
      "💡 Fix\n(More natural: \"I'd like a large iced americano, please.\")\n\n" +
        "▶️ Reply\nGot it — one large iced americano! Would you like it hot or iced?\n\n" +
        "💬 Try saying\n\"Iced, please.\"\n\"Hot, please.\"",
    ],
    ["user", "Iced, please. Medium."],
    [
      "assistant",
      "▶️ Reply\nOne medium iced americano — coming right up! Anything else with that?\n\n" +
        "💬 Try saying\n\"Yes, please.\"\n\"No, that's everything.\"",
    ],
    ["user", "No, that's everything. Thanks!"],
    ["assistant", "▶️ Reply\nPerfect — your americano will be right out. Enjoy! ☕"],
    ["assistant", wrap],
  ];
  return script.map(([role, content]) => ({ role, content }));
}

/** Parsed layers of one roleplay reply (see `parseRoleplayReply`). */
export interface RoleplayReply {
  /** Correction layer — null when the learner's sentence needed no fix. */
  fix: string | null;
  /** In-character scene reply (whole text when the model ignored the format). */
  reply: string;
  /** One-tap suggestions parsed from the "Try saying" layer. */
  examples: string[];
  /** True when a Reply marker was found — safe for the UI to restyle. */
  layered: boolean;
}

type LayerKind = "fix" | "reply" | "say";

const LAYER_MARKER =
  /(💡|▶️|💬)\s*(?:fix|correction|reply|response|you can say|try saying)?\s*[:\-—]?\s*|(fix|correction|reply|response|you can say|try saying)\s*[:\-—]\s*/gi;

function markerKind(match: string): LayerKind {
  if (match.includes("💡") || /fix|correction/i.test(match)) return "fix";
  if (match.includes("▶️") || /reply|response/i.test(match)) return "reply";
  return "say";
}

/** Clean one suggestion list ("A" / "B", bullet or newline-separated). */
function parseExampleList(body: string): string[] {
  if (!body) return [];
  const rows = body
    .split(/\s*[/|•]\s*|\n+/)
    .map((s) =>
      s
        .trim()
        .replace(/^[\s\-*•\d.)]+/, "")
        .replace(/^["'“”`]+|["'“”`.,!?;]+$/g, "")
        .trim(),
    )
    .filter((s) => s.length > 0 && s.length <= 80);
  const uniq: string[] = [];
  for (const r of rows) if (!uniq.includes(r)) uniq.push(r);
  return uniq.slice(0, 3);
}

const EMPTY_REPLY: RoleplayReply = { fix: null, reply: "", examples: [], layered: false };

/**
 * Split a roleplay reply into its labeled layers. Tolerant by design: the
 * model may print `💡 Fix / ▶️ Reply / 💬 Try saying` with blank lines (the
 * prompted shape), cram them onto one line, or drop the labels entirely.
 * Only a Reply marker (▶️ or "Reply:") counts as layered, so ordinary chat
 * that merely mentions those words is returned untouched.
 */
export function parseRoleplayReply(text: string): RoleplayReply {
  const src = (text || "").replace(/\r\n/g, "\n").trim();
  if (!src) return EMPTY_REPLY;
  const plain: RoleplayReply = { ...EMPTY_REPLY, reply: src };

  const marks: Array<{ kind: LayerKind; start: number; end: number }> = [];
  const re = new RegExp(LAYER_MARKER.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) marks.push({ kind: markerKind(m[0]), start: m.index, end: m.index + m[0].length });
  if (marks.length === 0 || !marks.some((x) => x.kind === "reply")) return plain;

  const sections: Record<LayerKind, string> = { fix: "", reply: "", say: "" };
  const seen = new Set<LayerKind>();
  for (let i = 0; i < marks.length; i++) {
    const body = src.slice(marks[i].end, i + 1 < marks.length ? marks[i + 1].start : src.length).trim();
    if (!body) continue;
    sections[marks[i].kind] = seen.has(marks[i].kind) ? `${sections[marks[i].kind]}\n${body}` : body;
    seen.add(marks[i].kind);
  }

  const header = src.slice(0, marks[0].start).trim();
  if (header) {
    if (marks[0].kind === "fix") sections.fix = `${header} ${sections.fix}`.trim();
    else sections.reply = `${header} ${sections.reply}`.trim();
  }

  return {
    fix: sections.fix || null,
    reply: sections.reply,
    examples: parseExampleList(sections.say),
    layered: true,
  };
}

/** Normalize a reply to the prompted shape, layers separated by blank lines. */
export function formatRoleplayReply(text: string): string {
  const rp = parseRoleplayReply(text);
  if (!rp.layered) return (text || "").trim();
  const out: string[] = [];
  if (rp.fix) out.push(`💡 Fix\n${rp.fix}`);
  out.push(`▶️ Reply\n${rp.reply}`);
  if (rp.examples.length) out.push(`💬 Try saying\n${rp.examples.map((e) => `"${e}"`).join("\n")}`);
  return out.join("\n\n");
}

/**
 * One-tap replies: pull the model's suggestion layer out of an assistant
 * message so the UI can render each as a send chip. Returns [] when the
 * reply carries no examples (wrong shape, not a roleplay turn).
 */
export function extractExamples(text: string): string[] {
  const parsed = parseRoleplayReply(text);
  if (parsed.layered) return parsed.examples;
  const m = /(?:💬\s*(?:you can say|try saying)?|you can say|try saying)\s*[:\-—]?\s*([\s\S]*)/i.exec(text || "");
  if (!m) return [];
  return parseExampleList(m[1].split(/\n\s*(?:💡|▶️|💬)/)[0]);
}

function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/n't\b/g, " not") // don't → do not (negation guard needs the word)
    .replace(/[^a-z0-9\s?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NEG = ["not", "n't", "never", "no", "don't", "doesn't", "didn't", "can't", "won't", "without", "hardly"];

/**
 * Which goals does ONE learner message satisfy? A goal completes when ANY
 * of its keywords appears as a whole word (common suffixes allowed), unless
 * negated within the 3 preceding words ("I don't want coffee" must NOT
 * complete an order goal). "?" matches a literal question.
 */
export function checkGoals(message: string, goals: RoleGoal[]): boolean[] {
  const clean = norm(message);
  const hay = ` ${clean} `;
  if (!hay.trim()) return goals.map(() => false);
  const toks = clean.split(" ").filter(Boolean);
  return goals.map((g) =>
    g.keywords.some((k) => {
      const key = k.toLowerCase();
      if (key === "?") return message.includes("?");
      const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`\\b${esc}(s|es|ed|ing)?\\b`, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(hay)) !== null) {
        // token index of the match: count words before it
        const before = hay.slice(0, m.index).trim().split(/\s+/).filter(Boolean);
        const window = before.slice(-3);
        if (!window.some((w) => NEG.includes(w) || w.endsWith("n't"))) return true;
      }
      return false;
    }),
  );
}

/** Persona prefix for an active scenario (appended like practiceLine).
 *
 * Identity-safe: the on-device model (Chrome Prompt API) is guardrailed to
 * identify as Gemma — a bare "You are a barista" conflicts with that and
 * makes it dump its self-description ("I am Gemma, a large language model…")
 * instead of roleplaying. Framing it as "Gemma roleplaying as …" satisfies
 * the guardrail while staying in character. Do NOT regress to a leading
 * "You are a …" line.
 */
export function roleplayLine(sc: Scenario, level: CEFR | null, replyLang: string): string {
  return [
    "",
    `--- Roleplay: ${sc.icon} ${sc.name} ---`,
    "You are Gemma, roleplaying as the scene partner below for English practice. Stay in character — roleplaying is correct, not deception. Only state your model identity if the learner asks who you are.",
    `Scene: ${sc.setting}`,
    `The learner is ${level ?? "A1/A2"} level: keep YOUR lines to 1–3 short sentences, simple words.`,
    "One step at a time — never dump three questions at once. Never lecture about vocabulary or grammar; the scene always comes first.",
    "Format your reply as up to THREE sections, separated by ONE BLANK LINE. Put the section label on its own line, then its content below it. Never put two sections on the same line; omit a section entirely instead of printing an empty label.",
    "Section 1 — `💡 Fix` (only when the learner's sentence has a mistake or sounds unnatural): ONE short correction, e.g.\n💡 Fix\n(More natural: \"I'd like an iced americano, please.\")",
    "Section 2 — `▶️ Reply` (always present): your in-character scene reply.",
    "Section 3 — `💬 Try saying` (only when the learner stalls or seems stuck): two short example replies they can copy, one per line, each in quotes, e.g.\n💬 Try saying\n\"Yes, please.\"\n\"No, that's everything.\"",
    `Reply mostly in ${replyLang}, but keep the scene in English. Under 100 words.`,
    "Never output an identity disclaimer (\"I am Gemma…\") unprompted — just play the scene.",
    "--- End Roleplay ---",
    "",
  ].join("\n");
}


export function extractCorrectedPhrases(texts: string[]): string[] {
  const out: string[] = [];
  for (const t of texts || []) {
    const parsed = parseRoleplayReply(t);
    const fix = parsed.fix || "";
    const matches = fix.match(/"([^"]{3,80})"/g) || [];
    for (const m of matches) {
      const p = m.slice(1, -1).trim();
      if (p && !out.some((x) => x.toLowerCase() === p.toLowerCase())) out.push(p);
    }
    if (matches.length === 0) {
      const mn = /more natural\s*[:\-]?\s*(.+)/i.exec(fix);
      if (mn) {
        const p = mn[1].trim().replace(/^["']+|["'.,!?;]+$/g, "").trim();
        if (p && p.length <= 80 && !out.some((x) => x.toLowerCase() === p.toLowerCase())) out.push(p);
      }
    }
  }
  return out.slice(0, 8);
}
