import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stripLeakedToolText } from "../lib/markdown.ts";

describe("leaked tool text cleanup", () => {
  it("leaves normal messages untouched", () => {
    const msg = "Hello!\n\n1. Buy milk\n2. Code for an hour";
    assert.equal(stripLeakedToolText(msg), msg);
  });

  it("keeps code fences verbatim, even with tool JSON inside", () => {
    const msg =
      'See:\n```json\n{"name": "readFile", "path": "a.txt"}\n```\nDone.';
    assert.equal(stripLeakedToolText(msg), msg);
  });

  it("strips bare toolcall JSON from prose", () => {
    const msg =
      'Working on it\n{"name": "writeFile", "path": "a.txt"}\nContinuing.';
    assert.equal(stripLeakedToolText(msg), "Working on it\n\nContinuing.");
  });

  it("strips call-again retry scaffolding to line end", () => {
    const msg =
      "못 했어요 ✗\n좀 더 길게해봐 — call writeFile for \"uploads/notes/todo.txt\" again with content revised accordingly.";
    assert.equal(stripLeakedToolText(msg), "못 했어요 ✗\n좀 더 길게해봐");
  });

  it("strips the review-echo prefix", () => {
    const msg = "User wants changes (nothing saved yet): longer please";
    assert.equal(stripLeakedToolText(msg), "longer please");
  });

  it("handles empty input", () => {
    assert.equal(stripLeakedToolText(""), "");
  });
});
