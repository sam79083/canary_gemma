// Roleplay scenarios — structured production for beginners who freeze at
// free chat. Each scenario is a character + a 3-goal checklist; goals are
// keyword-graded deterministically (Chat awards +3 XP per first completion).
//
// Self-contained (no runtime cross-imports) so plain `node --test` covers it.

import type { CEFR } from "./learn-bank";

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
  goals: [RoleGoal, RoleGoal, RoleGoal];
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
    goals: [
      {
        label: "Order a drink",
        keywords: [
          "coffee", "americano", "latte", "espresso", "cappuccino", "mocha",
          "tea", "ade", "juice", "smoothie", "drink", "order", "please",
        ],
      },
      { label: "Pick a size", keywords: ["small", "medium", "large", "regular"] },
      { label: "Say thanks", keywords: ["thank"] },
    ],
  },
  {
    id: "interview", name: "Job Interview", icon: "💼",
    setting: "Role: kind job interviewer for a part-time cafe job, asking one question at a time.",
    opener: "Thanks for coming in! First — tell me a little about yourself.",
    goals: [
      { label: "Introduce yourself", keywords: ["name", "called", "am", "my", "from", "student", "work", "live"] },
      { label: "Name a strength", keywords: ["hard", "friendly", "careful", "punctual", "responsible", "diligent"] },
      { label: "Ask a question back", keywords: ["?"] },
    ],
  },
  {
    id: "airport", name: "Airport Help", icon: "✈️",
    setting: "Role: patient airport information desk clerk helping a lost, slightly stressed traveler.",
    opener: "Hello! How can I help you today?",
    goals: [
      { label: "Say where you go", keywords: ["go", "flight", "gate", "seoul", "tokyo", "bus", "jeju"] },
      { label: "Show your ticket/time", keywords: ["ticket", "time", "late", "morning", "afternoon", "boarding"] },
      { label: "Ask for directions", keywords: ["where", "how"] },
    ],
  },
  {
    id: "hotel", name: "Hotel Check-in", icon: "🏨",
    setting: "Role: warm hotel receptionist checking the guest in, one step at a time.",
    opener: "Good evening! Welcome to Hotel Coco. Do you have a reservation?",
    goals: [
      { label: "Give your name", keywords: ["name", "reservation", "book"] },
      { label: "Ask about breakfast/wifi", keywords: ["breakfast", "wifi", "wi-fi", "pool", "checkout"] },
      { label: "Confirm the room", keywords: ["room", "key", "floor", "night"] },
    ],
  },
  {
    id: "smalltalk", name: "Small Talk", icon: "💬",
    setting: "Role: friendly classmate chatting lightly before class, asking about the learner too.",
    opener: "Hey! How was your weekend?",
    goals: [
      { label: "Answer + reason (because)", keywords: ["because"] },
      { label: "Ask back", keywords: ["?"] },
      { label: "Use past tense", keywords: ["was", "were", "went", "did", "had", "watched", "visited", "played"] },
    ],
  },
  {
    id: "doctor", name: "Doctor Visit", icon: "🩺",
    setting: "Role: gentle clinic doctor asking about the patient's symptoms one at a time.",
    opener: "Hello, come in. What seems to be the problem today?",
    goals: [
      { label: "Describe the symptom", keywords: ["hurt", "pain", "sick", "fever", "cough", "headache", "cold", "stomach"] },
      { label: "Say since when", keywords: ["since", "yesterday", "days", "morning", "week", "ago"] },
      { label: "Ask for medicine/advice", keywords: ["medicine", "should", "advice", "prescription", "rest"] },
    ],
  },
  {
    id: "restaurant", name: "Restaurant", icon: "🍽️",
    setting: "Role: friendly restaurant server taking a dine-in order, handling one request at a time.",
    opener: "Good evening! Table for how many?",
    goals: [
      {
        label: "Order food",
        keywords: [
          "menu", "order", "burger", "pasta", "pizza", "chicken", "rice",
          "salad", "steak", "soup", "noodle", "fish", "want", "please",
        ],
      },
      {
        label: "Customize or flag allergy",
        keywords: [
          "without", "less", "extra", "spicy", "mild", "allergy", "allergic",
          "vegetarian", "sauce", "cheese", "medium", "rare", "done",
        ],
      },
      { label: "Ask for the bill", keywords: ["bill", "check", "pay", "card", "cash", "much"] },
    ],
  },
  {
    id: "taxi", name: "Taxi Ride", icon: "🚕",
    setting: "Role: friendly taxi driver confirming the destination and route, one thing at a time.",
    opener: "Hello! Where to?",
    goals: [
      {
        label: "Say the destination",
        keywords: [
          "airport", "station", "hotel", "hospital", "school", "mart",
          "gangnam", "hongdae", "myeongdong", "itaewon", "address",
          "street", "downtown", "take", "go",
        ],
      },
      {
        label: "Confirm route or fare",
        keywords: ["much", "fare", "long", "minutes", "far", "fast", "slow", "hurry", "meter", "card", "cash", "how"],
      },
      { label: "Arrive + say thanks", keywords: ["thank", "here", "stop", "perfect", "great", "good"] },
    ],
  },
  {
    id: "phone", name: "Phone Booking", icon: "📞",
    setting: "Role: polite receptionist taking a phone booking, asking for one detail at a time.",
    opener: "Good morning, Happy Clinic. How can I help you?",
    goals: [
      {
        label: "Say what you need",
        keywords: ["appointment", "book", "reserve", "doctor", "dentist", "see", "checkup", "consultation", "haircut", "table"],
      },
      {
        label: "Give a day or time",
        keywords: [
          "monday", "tuesday", "wednesday", "thursday", "friday",
          "saturday", "sunday", "today", "tomorrow", "weekend",
          "morning", "afternoon", "evening", "clock", "time",
        ],
      },
      { label: "Confirm details", keywords: ["name", "number", "phone", "confirm", "thank", "great", "perfect"] },
    ],
  },
  {
    id: "return", name: "Store Exchange", icon: "🛍️",
    setting: "Role: helpful store clerk handling a return or exchange, one step at a time.",
    opener: "Hi! What can I do for you today?",
    goals: [
      {
        label: "Explain the problem",
        keywords: ["return", "exchange", "refund", "broken", "wrong", "size", "small", "tight", "damaged", "defect", "rip", "stain"],
      },
      { label: "Say when / receipt", keywords: ["receipt", "yesterday", "today", "bought", "week", "ago", "days"] },
      { label: "Ask for a solution", keywords: ["change", "possible", "can", "could", "another", "new", "please", "refund"] },
    ],
  },
];

const ROLE_KEY = "canary-roleplay";

export function scenarioById(id: string | null | undefined): Scenario | null {
  if (!id) return null;
  return SCENARIOS.find((s) => s.id === id) ?? null;
}

export function loadRoleplay(): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(ROLE_KEY);
    return raw && SCENARIOS.some((s) => s.id === raw) ? raw : null;
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
    "Format your reply in layers, each on its own line with its small label. Omit a layer entirely when it isn't needed — never print empty labels.",
    "Layer 1 — 💡 Fix: if the learner's sentence has a mistake or sounds unnatural, give ONE short correction in parentheses on this line, e.g. `💡 Fix: (More natural: \"I'd like an iced americano, please.\")`. Omit this line when their sentence is fine.",
    "Layer 2 — ▶️ Reply: your in-character scene reply (always present).",
    "Layer 3 — 💬 You can say: two short example replies the learner can copy, e.g. `\"Yes, please.\" / \"No, that's everything.\"`. Only when the learner stalls or seems stuck; omit otherwise.",
    `Reply mostly in ${replyLang}, but keep the scene in English. Under 100 words.`,
    "Never output an identity disclaimer (\"I am Gemma…\") unprompted — just play the scene.",
    "--- End Roleplay ---",
    "",
  ].join("\n");
}
