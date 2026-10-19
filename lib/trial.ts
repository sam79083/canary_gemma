// Server-side trial budgets: visitors without their own keys get a few
// free uses of the server keys, then must bring their own.
// Logged-in members bypass budgets (routes pass member=true via Supabase).
//
// Hardening (vs the first version):
//   - In-memory counters are the source of truth for the process lifetime,
//     so an unwritable file can no longer disable counting (no fail-open).
//   - IP extraction prefers proxy-set headers and takes the LAST
//     x-forwarded-for hop (the one the trusted proxy appended) so clients
//     cannot spoof their way to a fresh budget.
//   - A global rolling-hour cap (TRIAL_GLOBAL_PER_HOUR, default 300) is a
//     safety valve on server-key spend even if IPs are rotated.
// File persistence under os.tmpdir() stays best-effort (survives restarts
// on one instance; resets on deploys — acceptable at trial scale).

import fs from "fs/promises";
import os from "os";
import path from "path";

// Mirrored from ./trial-limits.ts (importing it breaks Node ESM tests;
// keep the numbers in sync).
const TRIAL_GEMINI_LIMIT = 10;
const TRIAL_HF_LIMIT = 10;

const GLOBAL_WINDOW_MS = 60 * 60 * 1000;
const GLOBAL_LIMIT = (() => {
  const n = Number(process.env.TRIAL_GLOBAL_PER_HOUR ?? "");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 300;
})();

type Kind = "gemini" | "hf";

interface Entry {
  gemini: number;
  hf: number;
  ts: number;
}

interface TrialStore {
  [ip: string]: Entry;
}

function storePath(): string {
  return process.env.TRIAL_FILE || path.join(os.tmpdir(), "canary-trial.json");
}

// --- in-memory state (authoritative; the file is just persistence) ----------

let mem: TrialStore = {};
let loaded = false;
const globalUses: number[] = [];

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await fs.readFile(storePath(), "utf-8");
    const s = JSON.parse(raw) as TrialStore;
    if (s && typeof s === "object") mem = s;
  } catch {
    // missing/corrupt — start fresh (memory already authoritative)
  }
}

async function persist(): Promise<void> {
  try {
    await fs.writeFile(storePath(), JSON.stringify(mem));
  } catch {
    // unwritable — memory still enforces the budget for this process
  }
}

function prune(now = Date.now()): void {
  const cutoff = now - 60 * 24 * 60 * 60 * 1000;
  for (const k of Object.keys(mem)) {
    if (mem[k].ts < cutoff) delete mem[k];
  }
  const windowStart = now - GLOBAL_WINDOW_MS;
  while (globalUses.length > 0 && globalUses[0] < windowStart) globalUses.shift();
}

/** Trial uses left in the global rolling-hour safety valve. */
export function globalRemaining(now = Date.now()): number {
  prune(now);
  return Math.max(0, GLOBAL_LIMIT - globalUses.length);
}

/** Test-only: clear memory, global window, and the load flag. */
export function resetTrialState(): void {
  mem = {};
  loaded = false;
  globalUses.length = 0;
}

/**
 * Client IP for budget keying. Prefer headers only a trusted proxy can set
 * (x-real-ip, cf-connecting-ip); for x-forwarded-for take the LAST hop —
 * the address appended by the proxy nearest us — never the first, which a
 * client can spoof.
 */
export function clientIp(req: Request): string {
  const lastHop = (v: string | null): string => {
    if (!v) return "";
    const parts = v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : "";
  };
  const ip =
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("cf-connecting-ip")?.trim() ||
    lastHop(req.headers.get("x-forwarded-for")) ||
    "unknown";
  return ip.slice(0, 64);
}

/** Remaining trial uses without counting (for display). */
export async function trialPeek(
  req: Request,
  member = false,
): Promise<{ gemini: number; hf: number }> {
  if (member) return { gemini: 999999, hf: 999999 };
  await ensureLoaded();
  prune();
  const entry = mem[clientIp(req)] ?? { gemini: 0, hf: 0, ts: 0 };
  const global = globalRemaining();
  return {
    gemini: Math.min(global, Math.max(0, TRIAL_GEMINI_LIMIT - entry.gemini)),
    hf: Math.min(global, Math.max(0, TRIAL_HF_LIMIT - entry.hf)),
  };
}

/**
 * Count one trial use. Returns remaining (>=0), or -1 when either the
 * per-IP budget or the global hourly valve is exhausted. Members bypass.
 * Counters live in memory, so they always enforce even when the file is
 * unwritable.
 */
export async function trialUse(
  req: Request,
  kind: Kind,
  member = false,
): Promise<number> {
  if (member) return 999999;
  await ensureLoaded();
  const now = Date.now();
  prune(now);
  if (globalUses.length >= GLOBAL_LIMIT) return -1;
  const limit = kind === "gemini" ? TRIAL_GEMINI_LIMIT : TRIAL_HF_LIMIT;
  const ip = clientIp(req);
  const entry = mem[ip] ?? { gemini: 0, hf: 0, ts: now };
  if (entry[kind] >= limit) return -1;
  entry[kind] += 1;
  entry.ts = now;
  mem[ip] = entry;
  globalUses.push(now);
  await persist();
  return Math.min(limit - entry[kind], Math.max(0, GLOBAL_LIMIT - globalUses.length));
}
