// Tiny achievement system (localStorage only).
// Toasts the first time each milestone hits; badge shows the count.

export interface AchDef {
  id: string;
  icon: string;
  /** i18n key for the achievement name. */
  nameKey: string;
}

export const ACHIEVEMENTS: AchDef[] = [
  { id: "first-file", icon: "📄", nameKey: "achFirstFile" },
  { id: "first-draw", icon: "🖼️", nameKey: "achFirstDraw" },
  { id: "first-link", icon: "🔗", nameKey: "achFirstLink" },
  { id: "ten-chats", icon: "💬", nameKey: "achTenChats" },
  { id: "night-owl", icon: "🦉", nameKey: "achNightOwl" },
];

const KEY = "canary-ach";

export function loadUnlocked(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

/** Returns true when this call newly unlocked the id. */
export function unlockAch(id: string): boolean {
  try {
    const set = loadUnlocked();
    if (set.has(id)) return false;
    set.add(id);
    localStorage.setItem(KEY, JSON.stringify([...set].slice(0, 50)));
    return true;
  } catch {
    return false;
  }
}
