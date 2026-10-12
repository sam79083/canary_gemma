// Build-time English-definition filler for the Learn generator.
//
// Fills gaps in public/data/endef.json (merged over lib/learn-endef.ts seed
// at runtime) using the Free Dictionary API (dictionaryapi.dev — free, no
// key). Resumable: words already in the output file are skipped. Polite by
// default (~2 req/s); the API is flaky, so failures only log and continue.
//
//   npm run words:build -- --limit 50    # fill 50 missing words
//   npm run words:build                  # fill everything missing
//
// Never blocks the app: QuizCard falls back to KO choices for words without
// definitions, with or without this file.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { genWordList } from "../lib/learn-gen.ts";
import { ENDEF_SEED, type EnDef } from "../lib/learn-endef.ts";

const OUT = join(process.cwd(), "public", "data", "endef.json");

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function lookup(word: string): Promise<EnDef | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 12000);
      const res = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
        { signal: ctl.signal },
      );
      clearTimeout(timer);
      if (!res.ok) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      const data = (await res.json()) as unknown;
      if (!Array.isArray(data) || data.length === 0) return null;
      const meanings = (data[0] as { meanings?: unknown }).meanings;
      if (!Array.isArray(meanings) || meanings.length === 0) return null;
      for (const m of meanings) {
        const defs = (m as { definitions?: unknown }).definitions;
        if (!Array.isArray(defs) || defs.length === 0) continue;
        const d = defs[0] as { definition?: unknown; example?: unknown };
        if (typeof d.definition !== "string" || !d.definition.trim()) continue;
        return {
          def: d.definition.trim().slice(0, 160),
          ex: typeof d.example === "string" ? d.example.trim().slice(0, 160) : "",
        };
      }
      return null;
    } catch {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return null;
}

async function main(): Promise<void> {
  const limit = Math.max(1, parseInt(arg("limit", "1000000"), 10) || 1000000);
  const delay = Math.max(200, parseInt(arg("delay", "500"), 10) || 500);
  let have: Record<string, EnDef> = {};
  try {
    if (existsSync(OUT)) have = JSON.parse(readFileSync(OUT, "utf8")) as Record<string, EnDef>;
  } catch {
    have = {};
  }
  const missing = genWordList().filter(
    ({ en }) => !ENDEF_SEED[en.toLowerCase()] && !have[en.toLowerCase()],
  );
  console.log(`seed covers ${Object.keys(ENDEF_SEED).length}, file has ${Object.keys(have).length}, missing ${missing.length}, filling up to ${limit}`);
  let filled = 0;
  for (const { en } of missing.slice(0, limit)) {
    const found = await lookup(en);
    if (found) {
      have[en.toLowerCase()] = found;
      filled++;
      console.log(`+ ${en} = ${found.def.slice(0, 60)}`);
    } else {
      console.log(`- ${en} (no definition found)`);
    }
    if (filled % 10 === 0) {
      mkdirSync(dirname(OUT), { recursive: true });
      writeFileSync(OUT, JSON.stringify(have, null, 1) + "\n");
    }
    await new Promise((r) => setTimeout(r, delay));
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(have, null, 1) + "\n");
  console.log(`done: filled ${filled}, total ${Object.keys(have).length} → ${OUT}`);
}

void main();
