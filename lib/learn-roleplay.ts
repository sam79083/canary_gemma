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

export const SCENARIOS: Scenario[] = [
  {
    id: "cafe", name: "Cafe Order", icon: "☕",
    setting: "You are a friendly cafe barista. Take my order step by step.",
    opener: "Hi there! Welcome to Coco Cafe. What can I get for you today?",
    goals: [
      { label: "Order a drink", keywords: ["coffee", "please"] },
      { label: "Pick a size", keywords: ["small", "medium", "large", "regular"] },
      { label: "Say thanks", keywords: ["thank"] },
    ],
  },
  {
    id: "interview", name: "Job Interview", icon: "💼",
    setting: "You are a kind job interviewer for a part-time cafe job. Ask one question at a time.",
    opener: "Thanks for coming in! First — tell me a little about yourself.",
    goals: [
      { label: "Introduce yourself", keywords: ["name", "i"] },
      { label: "Name a strength", keywords: ["hard", "friendly", "careful", "punctual", "responsible", "diligent"] },
      { label: "Ask a question back", keywords: ["?"] },
    ],
  },
  {
    id: "airport", name: "Airport Help", icon: "✈️",
    setting: "You are an airport information desk clerk. I am lost and a little stressed — be patient.",
    opener: "Hello! How can I help you today?",
    goals: [
      { label: "Say where you go", keywords: ["go", "flight", "gate", "seoul", "tokyo", "bus", "jeju"] },
      { label: "Show your ticket/time", keywords: ["ticket", "time", "late", "morning", "afternoon", "boarding"] },
      { label: "Ask for directions", keywords: ["where", "how"] },
    ],
  },
  {
    id: "hotel", name: "Hotel Check-in", icon: "🏨",
    setting: "You are a hotel receptionist. Check me in warmly, one step at a time.",
    opener: "Good evening! Welcome to Hotel Coco. Do you have a reservation?",
    goals: [
      { label: "Give your name", keywords: ["name", "reservation", "book"] },
      { label: "Ask about breakfast/wifi", keywords: ["breakfast", "wifi", "wi-fi", "pool", "checkout"] },
      { label: "Confirm the room", keywords: ["room", "key", "floor", "night"] },
    ],
  },
  {
    id: "smalltalk", name: "Small Talk", icon: "💬",
    setting: "You are a friendly classmate chatting before class. Keep it light and ask about me too.",
    opener: "Hey! How was your weekend?",
    goals: [
      { label: "Answer + reason (because)", keywords: ["because"] },
      { label: "Ask back", keywords: ["?"] },
      { label: "Use past tense", keywords: ["was", "were", "went", "did", "had", "watched", "visited", "played"] },
    ],
  },
  {
    id: "doctor", name: "Doctor Visit", icon: "🩺",
    setting: "You are a gentle clinic doctor. Ask about my symptoms one at a time.",
    opener: "Hello, come in. What seems to be the problem today?",
    goals: [
      { label: "Describe the symptom", keywords: ["hurt", "pain", "sick", "fever", "cough", "headache", "cold", "stomach"] },
      { label: "Say since when", keywords: ["since", "yesterday", "days", "morning", "week", "ago"] },
      { label: "Ask for medicine/advice", keywords: ["medicine", "should", "advice", "prescription", "rest"] },
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

/** Persona prefix for an active scenario (appended like practiceLine). */
export function roleplayLine(sc: Scenario, level: CEFR | null, replyLang: string): string {
  return [
    "",
    `--- Roleplay: ${sc.icon} ${sc.name} ---`,
    sc.setting,
    `The learner is ${level ?? "A1/A2"} level: keep YOUR lines to 1–3 short sentences, simple words.`,
    "One step at a time — never dump three questions at once. If the learner stalls, offer two example replies they can copy.",
    `Reply mostly in ${replyLang}, but keep the scene in English. Under 100 words.`,
    "--- End Roleplay ---",
    "",
  ].join("\n");
}
