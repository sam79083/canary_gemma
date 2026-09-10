// Server-side trial budgets: visitors without their own keys get a few
// free uses of the server keys, then must bring their own.
// Per-IP counters in the OS temp dir (ephemeral on Render — self-cleaning).
// Localhost bypasses counting entirely (the owner's own use).

import fs from "fs/promises";
import os from "os";
import path from "path";

// Mirrored from ./trial-limits.ts (importing it breaks Node ESM tests;
// keep the numbers in sync).
const TRIAL_GEMINI_LIMIT = 10;
const TRIAL_HF_LIMIT = 10;

type Kind = "gemini" | "hf";

interface TrialStore {
  [ip: string]: { gemini: number; hf: number; ts: number };
}

function storePath(): string {
  return process.env.TRIAL_FILE || path.join(os.tmpdir(), "canary-trial.json");
}

async function load(): Promise<TrialStore> {
  try {
    const raw = await fs.readFile(storePath(), "utf-8");
    const s = JSON.parse(raw) as TrialStore;
    if (s && typeof s === "object") return s;
  } catch {
    // missing/corrupt — start fresh
  }
  return {};
}

async function save(s: TrialStore): Promise<void> {
  try {
    await fs.writeFile(storePath(), JSON.stringify(s));
  } catch {
    // unwritable — trials fail open below
  }
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim().slice(0, 64);
  return "unknown";
}

/** Remaining trial uses without counting (for display). */
export async function trialPeek(req: Request): Promise<{ gemini: number; hf: number }> {
  if (isLocalRequest(req)) return { gemini: 999999, hf: 999999 };
  try {
    const s = await load();
    const entry = s[clientIp(req)] ?? { gemini: 0, hf: 0, ts: 0 };
    return {
      gemini: Math.max(0, TRIAL_GEMINI_LIMIT - entry.gemini),
      hf: Math.max(0, TRIAL_HF_LIMIT - entry.hf),
    };
  } catch {
    return { gemini: TRIAL_GEMINI_LIMIT, hf: TRIAL_HF_LIMIT };
  }
}

export function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get("host") || "").toLowerCase();
  return (
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("[::1]")
  );
}

/**
 * Count one trial use. Returns remaining (>=0), or -1 when the budget
 * is exhausted. Localhost is unlimited (returns a large number).
 * Fail-open: storage errors allow the request through.
 */export async function trialUse(req: Request, kind: Kind): Promise<number> {
  if (isLocalRequest(req)) return 999999;
  const limit = kind === "gemini" ? TRIAL_GEMINI_LIMIT : TRIAL_HF_LIMIT;
  try {
    const s = await load();
    const ip = clientIp(req);
    const entry = s[ip] ?? { gemini: 0, hf: 0, ts: Date.now() };
    if (entry[kind] >= limit) return -1;
    entry[kind] += 1;
    entry.ts = Date.now();
    s[ip] = entry;
    // Opportunistic prune: drop entries older than 60 days.
    const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
    for (const k of Object.keys(s)) {
      if (s[k].ts < cutoff) delete s[k];
    }
    await save(s);
    return limit - entry[kind];
  } catch {
    return limit;
  }
}
