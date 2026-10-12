import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addTarget,
  buildHandoffMessage,
  buildTeachPrompt,
  buildUseItPrompt,
  detectUsage,
  loadTargets,
  practiceLine,
  removeTarget,
  STARTERS,
  USEIT_DRAFT_KEY,
} from "../lib/learn-useit.ts";

describe("learn-useit prompts", () => {
  it("use-it prompt carries term, meaning, sentence + asks for verdict", () => {
    const p = buildUseItPrompt("break the ice", "start a conversation", "He told a joke.", "I breaked the ice.");
    assert.ok(p.includes("break the ice") && p.includes("I breaked the ice."));
    assert.ok(p.includes("verdict") && p.includes("follow-up"));
  });
  it("handoff message works with and without a sentence", () => {
    const withS = buildHandoffMessage("no cap", "for real", "That was great, no cap.");
    assert.ok(withS.includes("no cap") && withS.includes("That was great"));
    const bare = buildHandoffMessage("no cap", "for real");
    assert.ok(bare.includes("ask me a fun question"));
  });
  it("teach prompt quotes the selection and asks one question", () => {
    const p = buildTeachPrompt("  serendipity ");
    assert.ok(p.includes("serendipity") && p.includes("ONE question"));
  });
  it("practice persona lists targets + reply language", () => {
    const p = practiceLine([{ term: "brisk", meaning: "fast" }], "Korean");
    assert.ok(p.includes("brisk") && p.includes("Korean") && p.includes("120 words"));
  });
  it("draft key is namespaced with the others", () => {
    assert.ok(USEIT_DRAFT_KEY.startsWith("canary-"));
  });
});

describe("detectUsage", () => {
  const targets = [{ term: "break the ice" }, { term: "brisk" }, { term: "no cap" }];
  it("matches whole words/phrases, case/punct blind", () => {
    assert.deepEqual(detectUsage("I tried to BREAK the ice!", targets).map((t) => t.term), ["break the ice"]);
    assert.deepEqual(detectUsage("A brisk walk.", targets).map((t) => t.term), ["brisk"]);
    assert.equal(detectUsage("I said hello.", targets).length, 0);
    assert.equal(detectUsage("", targets).length, 0);
  });
  it("rejects partial-word and reordered matches", () => {
    assert.equal(detectUsage("icebreakers are fun", targets).length, 0); // no whole-word "break"+"ice" seq… "ice" alone isn't a target
    assert.equal(detectUsage("the ice break", targets).length, 0); // wrong order
    assert.equal(detectUsage("brisket is tasty", targets).length, 0); // brisk ≠ brisket
  });
  it("finds several targets at once", () => {
    const hit = detectUsage("No cap, that brisk morning helped me break the ice.", targets);
    assert.equal(hit.length, 3);
  });
});

describe("targets store + starters", () => {
  it("adds deduped, removes, caps", () => {
    let list = addTarget([], "brisk", "fast");
    assert.equal(list.length, 1);
    list = addTarget(list, "BRISK");
    assert.equal(list.length, 1); // case-insensitive dupe
    list = addTarget(list, "  ");
    assert.equal(list.length, 1); // blank ignored
    list = removeTarget(list, "brisk");
    assert.equal(list.length, 0);
    assert.equal(loadTargets().length, 0); // no localStorage under node
  });
  it("starters are usable openers with blanks", () => {
    assert.ok(STARTERS.length >= 6);
    assert.ok(STARTERS.every((s) => s.includes("___") && s.length < 60));
  });
});
