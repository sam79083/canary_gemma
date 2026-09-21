// i18n build-time tooling. Runtime stays static (fast, free, offline);
// this script only fills gaps in non-ko/en dicts using the Gemini API.
//
//   npm run i18n:check   list missing keys per language (no API key needed)
//   npm run i18n:fill    translate + write missing keys (needs GEMINI_KEY
//                        env var or .env.local entry; --check for dry run)
//
// Human rule: ko + en are curated by hand and never touched. Existing
// translations are never overwritten — only missing keys get appended.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DICTS, type Lang } from "../lib/i18n.ts";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const I18N_PATH = path.join(ROOT, "lib", "i18n.ts");

const CURATED: Lang[] = ["ko", "en"];
const TARGETS: { lang: Lang; name: string }[] = [
  { lang: "ja", name: "Japanese" },
  { lang: "zh", name: "Simplified Chinese" },
  { lang: "es", name: "Spanish" },
];
const CHUNK_KEYS = 60;

function missingKeys(lang: Lang): string[] {
  const have = new Set(Object.keys(DICTS[lang] ?? {}));
  const want = new Set<string>();
  for (const c of CURATED) for (const k of Object.keys(DICTS[c] ?? {})) want.add(k);
  return [...want].filter((k) => !have.has(k)).sort();
}

function check(): boolean {
  let total = 0;
  for (const { lang, name } of TARGETS) {
    const missing = missingKeys(lang);
    total += missing.length;
    console.log(`${lang} (${name}): ${missing.length} missing`);
    for (const k of missing.slice(0, 10)) console.log(`    - ${k}`);
    if (missing.length > 10) console.log(`    … +${missing.length - 10} more`);
  }
  console.log(total === 0 ? "All covered." : `Total missing: ${total}`);
  return total === 0;
}

function readKey(): string {
  const direct = (process.env.GEMINI_KEY ?? "").trim();
  if (direct) return direct;
  try {
    const envFile = fs.readFileSync(path.join(ROOT, ".env.local"), "utf-8");
    for (const line of envFile.split("\n")) {
      const m = line.match(/^\s*GEMINI_KEY\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, "").trim();
    }
  } catch {
    // no .env.local — fall through
  }
  return "";
}

async function translateBatch(
  apiKey: string,
  model: string,
  targetName: string,
  entries: Record<string, string>,
  retries = 4,
): Promise<Record<string, string>> {
  const prompt =
    `Translate this UI-string JSON from Korean to ${targetName}. ` +
    `Return ONLY a JSON object with the same keys and translated string values, no fences, no commentary. ` +
    `Keep every {placeholder} EXACTLY unchanged. Keep newlines (\\n) where they appear. ` +
    `Short button labels stay short.\n` +
    JSON.stringify(entries);
  let lastErr = "";
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const wait = Math.min(15000, 2000 * 2 ** (attempt - 1));
      await new Promise((r) => setTimeout(r, wait));
    }
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      },
    );
    if (res.ok) {
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      let text =
        data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      text = text
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      const obj = JSON.parse(text) as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === "string" && v.trim() && k in entries) out[k] = v;
      }
      return out;
    }
    lastErr = `Gemini HTTP ${res.status}`;
    if (res.status !== 429 && res.status !== 500 && res.status !== 502 && res.status !== 503) {
      throw new Error(lastErr);
    }
  }
  throw new Error(`${lastErr} (after ${retries + 1} tries)`);
}

function insertKeys(lang: Lang, translated: Record<string, string>): number {
  const keys = Object.keys(translated).sort();
  if (keys.length === 0) return 0;
  let src = fs.readFileSync(I18N_PATH, "utf-8");
  const open = new RegExp(`^const ${lang}: Dict = \\{$`, "m");
  const m = open.exec(src);
  if (!m) throw new Error(`dict block for ${lang} not found`);
  // Find the block's closing "};" — first line that is exactly "};"
  // after the opening.
  const closeIdx = src.indexOf("\n};", m.index);
  if (closeIdx === -1) throw new Error(`dict end for ${lang} not found`);
  const addition =
    keys.map((k) => `  ${k}: ${JSON.stringify(translated[k])},`).join("\n") + "\n";
  src = src.slice(0, closeIdx + 1) + addition + src.slice(closeIdx + 1);
  fs.writeFileSync(I18N_PATH, src);
  return keys.length;
}

async function fill(dryRun: boolean, targets = TARGETS): Promise<void> {
  const apiKey = readKey();
  if (!apiKey) {
    console.error("GEMINI_KEY not found (env var or .env.local). Nothing written.");
    process.exit(2);
  }
  const model = (process.env.I18N_MODEL ?? "").trim() || "gemini-flash-lite-latest";
  let done = 0;
  for (const { lang, name } of targets) {
    const missing = missingKeys(lang);
    if (missing.length === 0) {
      console.log(`${lang}: complete`);
      continue;
    }
    console.log(`${lang} (${name}): ${missing.length} missing…`);
    const got: Record<string, string> = {};
    const written = new Set<string>();
    const chunks = Math.ceil(missing.length / CHUNK_KEYS);
    for (let i = 0; i < missing.length; i += CHUNK_KEYS) {
      const chunk = missing.slice(i, i + CHUNK_KEYS);
      console.log(`  chunk ${Math.floor(i / CHUNK_KEYS) + 1}/${chunks} (${chunk.length} keys)…`);
      const entries: Record<string, string> = {};
      for (const k of chunk) entries[k] = DICTS.ko[k] ?? DICTS.en[k] ?? k;
      try {
        Object.assign(got, await translateBatch(apiKey, model, name, entries));
      } catch (e) {
        console.error(`  chunk failed (${chunk[0]}…): ${e instanceof Error ? e.message : e}`);
      }
      // Write incrementally per chunk — an abort only loses the current chunk.
      const fresh: Record<string, string> = {};
      for (const k of Object.keys(got)) {
        if (!written.has(k)) {
          fresh[k] = got[k];
          written.add(k);
        }
      }
      if (!dryRun && Object.keys(fresh).length > 0) {
        const n = insertKeys(lang, fresh);
        done += n;
        console.log(`  saved ${n} keys`);
      }
      // Gentle pause between chunks to stay under rate limits.
      await new Promise((r) => setTimeout(r, 1500));
    }
    const wroteKeys = Object.keys(got);
    console.log(`  translated ${wroteKeys.length}/${missing.length}`);
  }
  console.log(dryRun ? "Dry run — nothing written." : `Wrote ${done} translations. Review the diff!`);
}

const args = process.argv.slice(2);
// Accept --lang=es, --lang es, or bare "es" (npm on Windows may strip the flag prefix).
const langFlagIdx = args.indexOf("--lang");
const langArg = (args.find((a) => a.startsWith("--lang="))?.slice("--lang=".length) ??
  (langFlagIdx >= 0 ? args[langFlagIdx + 1] : undefined) ??
  args.find((a) => !a.startsWith("-") && TARGETS.some((t) => t.lang === a))) as Lang | undefined;
const targets = langArg ? TARGETS.filter((t) => t.lang === langArg) : TARGETS;
if (langArg && targets.length === 0) {
  console.error(`Unknown language: ${langArg}`);
  process.exit(2);
}
if (args.includes("--check")) {
  check();
} else {
  await fill(args.includes("--dry-run"), targets);
}
