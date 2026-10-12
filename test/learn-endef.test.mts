import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ENDEF_SEED,
  loadChoiceMode,
  mergeEnDef,
} from "../lib/learn-endef.ts";
import {
  genItem,
  genWordList,
  setChoiceMode,
  setEnDefDict,
  wantEnChoices,
} from "../lib/learn-gen.ts";

describe("learn-endef seed + prefs", () => {
  it("covers the full B1 word list (the KO→EN transition level)", () => {
    const b1 = genWordList().filter((w) => w.level === "B1").map((w) => w.en);
    assert.ok(b1.length >= 60);
    for (const en of b1) {
      assert.ok(ENDEF_SEED[en.toLowerCase()], `no EN definition for B1 word "${en}"`);
    }
    for (const [, v] of Object.entries(ENDEF_SEED)) {
      assert.ok(v.def.length > 3 && v.def.length <= 160);
    }
  });
  it("auto mode: KO at A1/A2, EN at B1+", () => {
    assert.equal(wantEnChoices("auto", "A1"), false);
    assert.equal(wantEnChoices("auto", "A2"), false);
    assert.equal(wantEnChoices("auto", "B1"), true);
    assert.equal(wantEnChoices("auto", "C2"), true);
    assert.equal(wantEnChoices("en", "A1"), true);
    assert.equal(wantEnChoices("ko", "C2"), false);
    assert.equal(loadChoiceMode(), "auto"); // no localStorage under node
  });
  it("mergeEnDef: fetched wins, garbage ignored", () => {
    const merged = mergeEnDef(
      { apple: { def: "seed def", ex: "" } },
      {
        apple: { def: "fetched def", ex: "ex" },
        newword: { def: "fresh", ex: "" },
        bad: { def: "   ", ex: "" },
      },
    );
    assert.equal(merged.apple.def, "fetched def");
    assert.equal(merged.newword.def, "fresh");
    assert.ok(!("bad" in merged));
  });
});

describe("learn-gen EN-choice mode", () => {
  it("B1 forward vocab uses EN definitions + KO hint when covered", () => {
    setEnDefDict(ENDEF_SEED);
    setChoiceMode("en");
    try {
      const it = genItem("B1", 0, "en1");
      assert.equal(it.kind, "choice");
      assert.ok(it.prompt.includes("closest meaning"));
      const def = ENDEF_SEED[it.word!.slice("gen:".length)].def;
      assert.equal(it.choices![it.answerIndex!], def);
      assert.ok(it.hint && it.hint.length > 1); // KO gloss behind Hint?
      assert.ok(!it.choices!.includes(it.hint!)); // hint never leaks into options
    } finally {
      setChoiceMode("auto");
      setEnDefDict({});
    }
  });
  it("falls back to KO choices when the word has no definition", () => {
    setEnDefDict({});
    setChoiceMode("en"); // even forced EN…
    try {
      const it = genItem("B1", 0, "ko1");
      assert.ok(it.prompt.includes("mean?")); // …falls back gracefully
      assert.equal(it.hint, undefined);
    } finally {
      setChoiceMode("auto");
    }
  });
  it("default (no dict): existing KO behavior byte-identical", () => {
    setEnDefDict({});
    setChoiceMode("auto");
    const a = genItem("A1", 3, "s");
    assert.ok(a.prompt.includes("mean?"));
    assert.equal(a.hint, undefined);
  });
});
