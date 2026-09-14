import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  displayTitle,
  listLocalSessions,
  loadLocalSession,
  normalizeTitle,
  saveLocalSession,
} from "../lib/sessions-local.ts";

// sessions-local talks to localStorage at call time — stub it for node.
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (mem.has(k) ? (mem.get(k) as string) : null),
  setItem: (k: string, v: string) => {
    mem.set(k, String(v));
  },
  removeItem: (k: string) => {
    mem.delete(k);
  },
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size;
  },
} as Storage;

describe("session titles", () => {
  beforeEach(() => {
    mem.clear();
  });

  it("normalizeTitle trims, caps, and never returns blank", () => {
    assert.equal(normalizeTitle("  hello  ", Date.now()), "hello");
    assert.equal(normalizeTitle("x".repeat(100), 123).length, 80);
    assert.ok(normalizeTitle("", 123).startsWith("Chat "));
    assert.ok(normalizeTitle("   ", 123).startsWith("Chat "));
    assert.ok(normalizeTitle(null, 123).startsWith("Chat "));
    assert.ok(normalizeTitle(undefined, 123).startsWith("Chat "));
  });

  it("displayTitle falls back to the filename for legacy blanks", () => {
    assert.equal(displayTitle({ title: "hi", filename: "f.json" }), "hi");
    assert.equal(displayTitle({ title: "", filename: "f.json" }), "f.json");
    assert.equal(displayTitle({ title: "   ", filename: "f.json" }), "f.json");
  });

  it("saving with a blank title stores a dated, non-blank title", async () => {
    const fn = await saveLocalSession("   ", [{ role: "user", content: "hi" }], null);
    const list = await listLocalSessions();
    assert.equal(list.length, 1);
    assert.equal(list[0].filename, fn);
    assert.ok(list[0].title.trim().length > 0);
    const msgs = await loadLocalSession(fn);
    assert.equal(msgs.length, 1);
  });

  it("listing self-heals legacy blank index entries", async () => {
    const fn = await saveLocalSession("real title", [{ role: "user", content: "hi" }], null);
    // Simulate a pre-normalization entry with a blank title.
    const raw = mem.get("canary-sessions-index-v1") as string;
    const idx = JSON.parse(raw) as { filename: string; title: string; timestamp: number }[];
    idx[0].title = "";
    mem.set("canary-sessions-index-v1", JSON.stringify(idx));
    const list = await listLocalSessions();
    assert.ok(list[0].title.trim().length > 0);
    // Repair persisted: a second read stays non-blank without rewriting.
    const again = await listLocalSessions();
    assert.equal(again[0].title, list[0].title);
    assert.equal(again[0].filename, fn);
  });
});
