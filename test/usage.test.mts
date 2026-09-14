import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  estimateTokens,
  getUsage,
  recordUsage,
} from "../lib/usage.ts";
import { TrialChatSession } from "../lib/cloud-model.ts";

// usage tracker talks to localStorage at call time — stub it for node.
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

describe("token estimator", () => {
  it("returns 0 for empty text", () => {
    assert.equal(estimateTokens(""), 0);
  });

  it("estimates roughly 4 chars per token for Latin text", () => {
    // "hello world" = 11 chars -> ~3 tokens, always at least 1.
    assert.equal(estimateTokens("hello world"), 3);
    assert.ok(estimateTokens("x") >= 1);
    assert.ok(estimateTokens("a".repeat(400)) >= 90);
  });

  it("counts CJK characters heavier than Latin ones", () => {
    // "안녕하세요" = 5 chars -> ~8 tokens (vs ~1 as Latin math).
    assert.equal(estimateTokens("안녕하세요"), 8);
    assert.ok(estimateTokens("안녕하세요") > estimateTokens("hello"));
  });
});

describe("usage tracker", () => {
  beforeEach(() => {
    mem.clear();
  });

  it("records and reads back per-model daily totals", () => {
    recordUsage("m-test", 100);
    recordUsage("m-test", 50);
    const u = getUsage("m-test");
    assert.equal(u.todayReqs, 2);
    assert.equal(u.todayTokens, 150);
    assert.ok(u.rpm >= 2);
    // Other models are unaffected.
    assert.equal(getUsage("other").todayTokens, 0);
  });

  it("ignores empty model names", () => {
    recordUsage("", 100);
    assert.equal(getUsage("").todayTokens, 0);
  });
});

describe("trial session usage", () => {
  it("captures server-reported usage, resets when absent", async () => {
    const origFetch = globalThis.fetch;
    let usage: unknown = { in: 10, out: 5, total: 15 };
    // @ts-expect-error harness
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ text: "hi", usage }),
    });
    try {
      const s = new TrialChatSession();
      let out = "";
      for await (const chunk of s.promptStreaming("hello")) out += chunk;
      assert.equal(out, "hi");
      assert.deepEqual(s.lastUsage, { in: 10, out: 5, total: 15 });
      // Server omits usage -> reset to null (never a stale repeat).
      usage = undefined;
      out = "";
      for await (const chunk of s.promptStreaming("again")) out += chunk;
      assert.equal(out, "hi");
      assert.equal(s.lastUsage, null);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
