// Opt-in reply styles. Default sends bare user text (no shaping at
// all); every other mode appends exactly ONE short style line, and only
// on direct-answer turns — never on agent tool-loop turns, where a style
// clause could corrupt the toolcall format. User-chosen and visible.

export type PersonalityId = "default" | "concise" | "pirate" | "poet" | "buddy";

export const PERSONALITIES: PersonalityId[] = [
  "default",
  "concise",
  "pirate",
  "poet",
  "buddy",
];

const LINES: Record<Exclude<PersonalityId, "default">, string> = {
  concise: "Keep every reply under three short sentences.",
  pirate: "Reply like a cheerful pirate, but still answer the question.",
  poet: "Reply with poetic flair, keeping it short.",
  buddy: "Reply warm and casual, like a close friend.",
};

export function isPersonalityId(v: unknown): v is PersonalityId {
  return (PERSONALITIES as string[]).includes(v as string);
}

/** Appended to the user turn, or "" for default (bare text). */
export function personalityPrompt(id: string): string {
  if (!(PERSONALITIES as string[]).includes(id) || id === "default") return "";
  return "\n\n" + LINES[id as Exclude<PersonalityId, "default">];
}

/**
 * User-written guidelines (ChatGPT-style custom instructions), kept in
 * localStorage under "canary-custom-instructions". Unlike the persona
 * style line (direct-answer turns only), these are also prepended to the
 * agent's first turn and plan requests — they describe the user's standing
 * requirements, not a reply style. Capped to bound prompt bloat.
 */
export function customInstructionsPrompt(text: string): string {
  const clean = (text || "").trim().slice(0, 2000);
  return clean ? `\n\nUser guidelines (always follow):\n${clean}` : "";
}
