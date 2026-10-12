// Portfolio + local league (differentiation: showcase progress).
//
// Portfolio entries are learner-owned artifacts: graded essays, polished
// paragraphs, badges, built files. Own localStorage key; exportable as one
// Markdown file (HelloTalk-style sharing without any server: copy text or
// download a file, send it anywhere).
//
// The league is Duolingo-style motivation without accounts: deterministic
// bots seeded by week number, so the learner always has rivals at a similar
// pace. Pure functions — fully test-covered.

export type PortfolioKind = "essay" | "polish" | "sentence" | "file" | "milestone";

export interface PortfolioEntry {
  id: string;
  kind: PortfolioKind;
  title: string;
  body: string;
  meta?: string;
  at: string;
}

const FOLIO_KEY = "canary-portfolio-v1";
const MAX_ENTRIES = 100;

function uid(): string {
  try {
    // @ts-ignore
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    // fall through
  }
  return `p-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function addEntry(
  entries: PortfolioEntry[],
  kind: PortfolioKind,
  title: string,
  body: string,
  meta?: string,
): PortfolioEntry[] {
  const t = title.trim().slice(0, 120) || "(untitled)";
  const b = body.trim().slice(0, 4000);
  if (!b) return entries;
  return [
    { id: uid(), kind, title: t, body: b, meta: meta?.slice(0, 120), at: new Date().toISOString() },
    ...entries,
  ].slice(0, MAX_ENTRIES);
}

export function removeEntry(entries: PortfolioEntry[], id: string): PortfolioEntry[] {
  return entries.filter((e) => e.id !== id);
}

export function loadPortfolio(): PortfolioEntry[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(FOLIO_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (x): x is PortfolioEntry =>
          !!x && typeof x === "object" &&
          typeof (x as PortfolioEntry).title === "string" &&
          typeof (x as PortfolioEntry).body === "string",
      )
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function savePortfolio(entries: PortfolioEntry[]): void {
  try {
    if (typeof localStorage !== "undefined")
      localStorage.setItem(FOLIO_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // best-effort
  }
}

const KIND_LABEL: Record<PortfolioKind, string> = {
  essay: "✍️ Essay",
  polish: "✨ Polished",
  sentence: "💬 Sentence",
  file: "📁 File",
  milestone: "🏆 Milestone",
};

/** One Markdown document of the whole journey — the shareable artifact. */
export function exportPortfolioMd(entries: PortfolioEntry[], level: string | null, xp: number): string {
  const head = `# 🦜 My English Portfolio\n\nLevel: ${level ?? "unplaced"} · ${xp} XP · ${entries.length} pieces\n`;
  if (entries.length === 0)
    return `${head}\n_Nothing yet — grade an essay or polish a paragraph to start your story._\n`;
  const parts = [...entries].reverse().map((e) => {
    const when = e.at.slice(0, 10);
    return `## ${KIND_LABEL[e.kind] ?? e.kind}: ${e.title}\n\n_${when}${e.meta ? ` · ${e.meta}` : ""}_\n\n${e.body}\n`;
  });
  return `${head}\n---\n\n${parts.join("\n---\n\n")}\n`;
}

/** Peer-feedback request card (HelloTalk-lite): copy or save, send anywhere. */
export function buildShareCard(title: string, body: string, level: string | null): string {
  return [
    `🦜 Feedback please! (${level ?? "learning"} learner)`,
    ``,
    `## ${title.trim().slice(0, 120) || "(untitled)"}`,
    ``,
    body.trim().slice(0, 1500),
    ``,
    `---`,
    `Please tell me: 1) one thing that sounds natural, 2) one fix with an example. Thanks! 🙏`,
  ].join("\n");
}

// --- local league ------------------------------------------------------------

export interface LeagueRow {
  name: string;
  xp: number;
  me: boolean;
}

const BOTS = ["🦊 Foxy", "🐼 Panda", "🐢 Tilly", "🦉 Hoot", "🐝 Buzzy", "🦄 Uni", "🐸 Ribbit"];

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic weekly league: bots pace around the learner's week XP so
 * there is always someone just ahead (motivation) and behind (confidence). */
export function leagueTable(weekXp: number, weekKey: string): LeagueRow[] {
  const rows: LeagueRow[] = [{ name: "🦜 You", xp: Math.max(0, Math.floor(weekXp)), me: true }];
  BOTS.forEach((name, i) => {
    const h = hashStr(`league|${weekKey}|${i}`);
    // Bots train 40–160 XP/week with stable personalities (some keen, some lazy).
    const base = 40 + (h % 120);
    rows.push({ name, xp: base + (i * 13) % 40, me: false });
  });
  rows.sort((a, b) => b.xp - a.xp);
  return rows;
}

export function leagueRank(weekXp: number, weekKey: string): number {
  const t = leagueTable(weekXp, weekKey);
  return t.findIndex((r) => r.me) + 1;
}
