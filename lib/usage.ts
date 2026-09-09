// Client-side API usage tracker.
//
// Google exposes no quota API for AI Studio keys, so the site measures
// usage itself from each reply's usageMetadata: requests + tokens per
// model, per Pacific day (matching Google's RPD reset), plus rolling
// 60s windows for RPM/TPM. Per-device only — phone and PC count separately.

export interface ModelLimits {
  rpm: number;
  tpm: number;
  rpd: number;
}

export const DEFAULT_LIMITS: ModelLimits = { rpm: 30, tpm: 16000, rpd: 14400 };

const USAGE_KEY = "canary-usage";
const LIMITS_KEY = "canary-limits";

interface Stamp {
  t: number;
  tokens: number;
}

interface DayBucket {
  date: string;
  reqs: number;
  tokens: number;
}

interface Store {
  days: Record<string, DayBucket>; // key: `${model}|${pacificDate}`
  stamps: Record<string, Stamp[]>; // key: model
  limits: Record<string, ModelLimits>; // key: model
}

function pacificDate(d = new Date()): string {
  try {
    return d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function load(): Store {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Store;
      if (s && s.days && s.stamps && s.limits) return s;
    }
  } catch {
    // corrupted or unavailable — start fresh
  }
  return { days: {}, stamps: {}, limits: {} };
}

function save(s: Store): void {
  try {
    // Cap stamp history so storage can't grow unbounded.
    for (const k of Object.keys(s.stamps)) {
      if (s.stamps[k].length > 500) s.stamps[k] = s.stamps[k].slice(-500);
    }
    localStorage.setItem(USAGE_KEY, JSON.stringify(s));
  } catch {
    // storage full/blocked — tracking silently stops
  }
}

/** Record one completed API call. */
export function recordUsage(model: string, tokens: number): void {
  if (!model) return;
  const s = load();
  const key = `${model}|${pacificDate()}`;
  const day = s.days[key] ?? { date: pacificDate(), reqs: 0, tokens: 0 };
  day.reqs += 1;
  day.tokens += tokens;
  s.days[key] = day;
  const arr = s.stamps[model] ?? [];
  arr.push({ t: Date.now(), tokens });
  const cutoff = Date.now() - 120000;
  s.stamps[model] = arr.filter((x) => x.t >= cutoff);
  save(s);
}

export interface UsageSummary {
  todayReqs: number;
  todayTokens: number;
  rpm: number;
  tpm: number;
  limits: ModelLimits;
}

/** Today's totals + current rolling windows for one model. */
export function getUsage(model: string): UsageSummary {
  const s = load();
  const day = s.days[`${model}|${pacificDate()}`];
  const now = Date.now();
  const recent = (s.stamps[model] ?? []).filter((x) => x.t >= now - 60000);
  return {
    todayReqs: day?.reqs ?? 0,
    todayTokens: day?.tokens ?? 0,
    rpm: recent.length,
    tpm: recent.reduce((a, x) => a + x.tokens, 0),
    limits: s.limits[model] ?? { ...DEFAULT_LIMITS },
  };
}

export function getLimits(model: string): ModelLimits {
  return load().limits[model] ?? { ...DEFAULT_LIMITS };
}

export function setLimits(model: string, limits: ModelLimits): void {
  if (!model) return;
  const s = load();
  s.limits[model] = {
    rpm: Math.max(1, Math.floor(limits.rpm) || DEFAULT_LIMITS.rpm),
    tpm: Math.max(1, Math.floor(limits.tpm) || DEFAULT_LIMITS.tpm),
    rpd: Math.max(1, Math.floor(limits.rpd) || DEFAULT_LIMITS.rpd),
  };
  save(s);
}

export function fmtNum(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}
