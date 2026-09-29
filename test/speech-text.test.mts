import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toSpokenText } from "../lib/markdown.ts";

describe("toSpokenText", () => {
  it("strips fences, links, and emphasis", () => {
    const out = toSpokenText(
      "# Title\n\nHello **world**, see [docs](https://x.y).\n\n```js\nconst a = 1;\n```\n\n- item one",
    );
    assert.ok(!out.includes("#"));
    assert.ok(!out.includes("**"));
    assert.ok(!out.includes("https://x.y"));
    assert.ok(!out.includes("const a"));
    assert.ok(out.includes("Hello world"));
    assert.ok(out.includes("item one"));
  });

  it("returns empty for empty input", () => {
    assert.equal(toSpokenText(""), "");
  });
});
