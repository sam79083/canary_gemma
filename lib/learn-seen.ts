// Recently-asked question memory — the "don't bore me" list.
//
// localStorage-only (per device, not synced): ids of bank items asked in
// recent sessions, capped so storage can't grow. buildDailyLesson() skips
// these, so sessions feel fresh even with a static bank. Self-contained for
// plain `node --test` (storage guarded).

const SEEN_KEY = "canary-learn-seen";
const CAP = 200;

export function loadSeen(): string[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter((x): x is string => typeof x === "string").slice(0, CAP);
  } catch {
    return [];
  }
}

export function markSeen(ids: string[]): void {
  try {
    if (typeof localStorage === "undefined") return;
    const prev = loadSeen();
    const seen = new Set(prev);
    const fresh = ids.filter((id) => typeof id === "string" && id && !seen.has(id));
    for (const id of fresh) seen.add(id);
    // Most-recent first: fresh ids front, then previous order.
    const ordered = [...fresh, ...prev.filter((id) => seen.has(id))];
    const deduped = [...new Set(ordered)].slice(0, CAP);
    localStorage.setItem(SEEN_KEY, JSON.stringify(deduped));
  } catch {
    // storage full/blocked — freshness degrades, learning still works
  }
}

export function clearSeen(): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(SEEN_KEY);
  } catch {
    // ignore
  }
}
