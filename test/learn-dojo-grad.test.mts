// One-time Code Dojo graduation milestone in the portfolio (claims exactly
// once, flows into the proof sheet as a "milestone" piece).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  dojoGraduationClaimed,
  loadPortfolio,
  recordDojoGraduation,
} from "../lib/learn-portfolio.ts";

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => (mem.has(k) ? (mem.get(k) as string) : null),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
};

describe("recordDojoGraduation", () => {
  it("writes one milestone entry with the cleared lesson titles, once", () => {
    mem.clear();
    assert.equal(dojoGraduationClaimed(), false);

    const first = recordDojoGraduation(["Views that return HTML", "useEffect + then() is fetch"]);
    assert.ok(first !== null, "first claim succeeds");
    assert.equal(first.filter((e) => e.kind === "milestone").length, 1);
    assert.ok(first[0].title.includes("Code Dojo"));
    assert.ok(first[0].body.includes("fetch"), "body lists the cleared lessons");
    assert.equal(dojoGraduationClaimed(), true);

    const second = recordDojoGraduation(["Views that return HTML"]);
    assert.equal(second, null, "second claim is a no-op");
    assert.equal(loadPortfolio().filter((e) => e.kind === "milestone").length, 1);
  });

  it("treats the localStorage flag as the claim-guard", () => {
    mem.clear();
    recordDojoGraduation(["Props are template context"]);
    mem.set("canary-dojo-grad", "2026-11-13");
    assert.equal(dojoGraduationClaimed(), true);
    assert.equal(recordDojoGraduation(["Props are template context"]), null);
    assert.equal(loadPortfolio().filter((e) => e.title.includes("Code Dojo")).length, 1);
  });
});
