import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildDojoHandoff,
  checkDojo,
  DOJO_LESSONS,
  lessonById,
  loadDojoDone,
} from "../lib/learn-dojo.ts";
import { buildPreviewDoc, escapeForScript } from "../lib/dojo-run.ts";

describe("code dojo lessons", () => {
  it("ships eight lessons for backend devs", () => {
    assert.equal(DOJO_LESSONS.length, 8);
    const ids = new Set(DOJO_LESSONS.map((l) => l.id));
    assert.equal(ids.size, 8);
    for (const l of DOJO_LESSONS) {
      assert.ok(l.title.length > 2 && l.brief.length > 20);
      assert.ok(l.starter.includes("function App"), `${l.id} starter must define App`);
      assert.ok(l.solution.includes("function App"), `${l.id} solution must define App`);
      assert.ok(l.checks.length >= 2 && l.tip.length > 10 && l.inApp.length > 5);
      for (const c of l.checks) {
        assert.ok(c.label.length > 2 && c.patterns.length > 0);
      }
    }
    assert.equal(lessonById("state")?.title, "Assignment lies; setters redraw");
    assert.equal(lessonById("routing")?.title, "Files are URLs");
    assert.equal(lessonById("nope"), null);
    assert.equal(lessonById(null), null);
  });
  it("checks match ANY pattern, case-insensitively", () => {
    const state = lessonById("state")!;
    // the starter carries the classic bug: destructured setCount, never called
    assert.deepEqual(checkDojo(state.starter, state.checks), [true, false, true]);
    assert.deepEqual(checkDojo("", state.checks), [false, false, false]);
    assert.deepEqual(checkDojo("nothing here", state.checks), [false, false, false]);
    // TS label needs the real thing: bare "string" in prose must not pass
    const types = lessonById("types")!;
    assert.equal(checkDojo("a string of text", types.checks)[0], false);
    assert.equal(checkDojo("interface User { name: string }", types.checks)[0], true);
    // the state bug: destructured setCount alone must NOT pass "calls the setter"
    const state2 = lessonById("state")!;
    assert.equal(checkDojo(state2.starter, state2.checks)[1], false);
    assert.equal(checkDojo(state2.solution, state2.checks)[1], true);
    // routing answers are exact file paths
    const routing = lessonById("routing")!;
    assert.equal(checkDojo(routing.starter, routing.checks)[0], false);
    assert.deepEqual(checkDojo(routing.solution, routing.checks), [true, true]);
  });
  it("solutions satisfy their own checks", () => {
    for (const l of DOJO_LESSONS) {
      assert.deepEqual(
        checkDojo(l.solution, l.checks),
        l.checks.map(() => true),
        `${l.id} solution should clear every check`,
      );
    }
  });
  it("progress helpers fall back blank under node", () => {
    assert.deepEqual(loadDojoDone("state", 3), [false, false, false]);
    assert.deepEqual(loadDojoDone(null, 2), [false, false]);
  });
  it("handoff posts code for AI feedback", () => {
    const msg = buildDojoHandoff(lessonById("props")!, "<Greeting name=\"Mina\" />");
    assert.ok(msg.includes("Code Dojo") && msg.includes("```tsx") && msg.includes("Mina"));
    assert.ok(msg.length <= 1600);
  });
});

describe("dojo preview doc", () => {
  it("escapes script breakouts", () => {
    assert.equal(escapeForScript("a</script>b"), "a<\\/script>b");
    assert.equal(escapeForScript("no tags"), "no tags");
  });
  it("wraps code with React, Babel, and a manual TSX transform", () => {
    const doc = buildPreviewDoc("function App(){return <h1>hi</h1>}");
    assert.ok(doc.includes("react@18"), "pins React UMD");
    assert.ok(doc.includes("babel.min.js"), "loads Babel standalone");
    assert.ok(doc.includes("Babel.transform"), "manual transform, not auto-compile");
    assert.ok(doc.includes("isTSX"), "TypeScript preset gets TSX options");
    assert.ok(doc.includes("app.tsx"), "TSX filename for the transform");
    assert.ok(doc.includes("function App(){return <h1>hi</h1>}"), "keeps user code");
    assert.ok(doc.includes("createElement(App)"), "renders App without JSX in template");
    assert.ok(doc.includes("showError"), "transform AND runtime errors display");
    assert.ok(doc.includes('sandbox') === false, "sandbox belongs on the iframe, not the doc");
  });
  it("neutralizes injected script closes", () => {
    const evil = "var x = '</script><script>alert(1)</script>';";
    const doc = buildPreviewDoc(evil);
    assert.ok(doc.includes("<\\/script>"), "user closes are escaped");
    // Only the template's own 5 closers remain raw (3 CDN + handler + babel block).
    assert.equal((doc.match(/<\/script>/g) ?? []).length, 5);
  });
});
