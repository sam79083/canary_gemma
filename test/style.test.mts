import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { THEMES, isDarkTheme, isTheme } from "../lib/theme.ts";
import {
  PERSONALITIES,
  isPersonalityId,
  personalityPrompt,
} from "../lib/personalities.ts";

describe("themes", () => {
  it("accepts exactly the five known themes", () => {
    assert.deepEqual([...THEMES].sort(), ["dark", "forest", "light", "midnight", "sepia"]);
    for (const t of THEMES) assert.equal(isTheme(t), true);
    assert.equal(isTheme("neon"), false);
    assert.equal(isTheme(""), false);
    assert.equal(isTheme(null), false);
  });

  it("marks dark and midnight as dark chrome", () => {
    assert.equal(isDarkTheme("dark"), true);
    assert.equal(isDarkTheme("midnight"), true);
    assert.equal(isDarkTheme("light"), false);
    assert.equal(isDarkTheme("sepia"), false);
    assert.equal(isDarkTheme("forest"), false);
  });
});

describe("personalities", () => {
  it("default and unknown ids send bare text", () => {
    assert.equal(personalityPrompt("default"), "");
    assert.equal(personalityPrompt("pirate-of-the-caribbean"), "");
    assert.equal(personalityPrompt(""), "");
  });

  it("every non-default mode has one short line", () => {
    assert.ok(PERSONALITIES.includes("default"));
    for (const id of PERSONALITIES) {
      assert.equal(isPersonalityId(id), true);
      if (id === "default") continue;
      const line = personalityPrompt(id);
      assert.ok(line.startsWith("\n\n"));
      assert.ok(line.length > 10 && line.length < 120);
    }
    assert.equal(isPersonalityId("robot"), false);
  });
});
