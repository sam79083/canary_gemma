import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildDemoScript,
  buildRoleWrapUp,
  checkGoals,
  createCustomScene,
  extractExamples,
  isCustomId,
  keywordsFromLabel,
  loadCustomScenes,
  loadRoleDone,
  loadRoleplay,
  resolveScenario,
  roleplayLine,
  scenarioById,
  SCENARIOS,
  toScenario,
} from "../lib/learn-roleplay.ts";

describe("learn-roleplay scenarios", () => {
  it("ships playable scenes with 3 goals each", () => {
    assert.equal(SCENARIOS.length, 10);
    const ids = new Set(SCENARIOS.map((s) => s.id));
    assert.equal(ids.size, 10);
    for (const s of SCENARIOS) {
      assert.ok(s.name && s.opener.length > 10 && s.setting.length > 10);
      assert.equal(s.goals.length, 3);
      assert.ok(s.tip.length > 10, `${s.id} needs a wrap-up tip`);
      for (const g of s.goals) {
        assert.ok(g.label.length > 2 && g.keywords.length > 0);
      }
    }
    assert.ok(scenarioById("cafe")?.opener.includes("Coco Cafe"));
    assert.equal(scenarioById("nope"), null);
    assert.equal(loadRoleplay(), null); // no localStorage under node
  });
  it("checks goals whole-word, any-keyword, ?-aware", () => {
    const cafe = scenarioById("cafe")!;
    const [order, size, thanks] = checkGoals("One coffee please, medium size. Thanks!", cafe.goals);
    assert.ok(order && size && thanks);
    assert.deepEqual(checkGoals("hello there", cafe.goals), [false, false, false]);
    assert.deepEqual(checkGoals("", cafe.goals), [false, false, false]);
    // suffixes count (thanks), unrelated words don't (peas)
    const [o2] = checkGoals("I want peas.", cafe.goals);
    assert.equal(o2, false);
    const interview = scenarioById("interview")!;
    const [, , askBack] = checkGoals("What time do we start?", interview.goals);
    assert.equal(askBack, true);
  });
  it("negated keywords don't complete goals", () => {
    const cafe = scenarioById("cafe")!;
    assert.deepEqual(checkGoals("I don't want coffee, no please!", cafe.goals), [false, false, false]);
    assert.deepEqual(checkGoals("No coffee for me, never!", cafe.goals), [false, false, false]);
    // unnegated still counts, even next to a negated clause
    const [order] = checkGoals("I don't want tea. One coffee please!", cafe.goals);
    assert.equal(order, true);
  });
  it("wrap-up, goal memory, and one-tap examples", () => {
    const cafe = scenarioById("cafe")!;
    const wrap = buildRoleWrapUp(cafe);
    assert.ok(wrap.includes("Cafe Order") && wrap.includes("Order a drink"));
    assert.ok(wrap.includes(cafe.tip.slice(0, 20)));
    // no localStorage under node: memory helpers fall back to blank
    assert.deepEqual(loadRoleDone("cafe"), [false, false, false]);
    assert.deepEqual(loadRoleDone(null), [false, false, false]);
    // example-line parser: quoted slash pairs, missing line, caps
    assert.deepEqual(
      extractExamples('▶️ Reply: coming up!\n💬 You can say: "Yes, please." / "No, that\'s everything."'),
      ["Yes, please", "No, that's everything"],
    );
    assert.deepEqual(extractExamples("Just a plain reply."), []);
    assert.deepEqual(extractExamples(""), []);
    const many = extractExamples('💬 You can say: "a" / "b" | "c" / "d"');
    assert.equal(many.length, 3);
  });
  it("persona prompt names the scene, level, language", () => {
    const sc = scenarioById("airport")!;
    const p = roleplayLine(sc, "A2", "Korean");
    assert.ok(p.includes("Airport") && p.includes("A2") && p.includes("Korean"));
    assert.ok(p.toLowerCase().includes("one step at a time"));
    assert.ok(p.toLowerCase().includes("parentheses"), "scene prompt teaches parenthetical corrections");
    assert.ok(p.includes("💡 Fix") && p.includes("▶️ Reply") && p.includes("💬 You can say"), "scene prompt labels all three layers");
  });
  it("realistic words grade across scenes", () => {
    // "I'm …" normalizes to "i m": intro must catch the bare contraction.
    const interview = scenarioById("interview")!;
    assert.deepEqual(checkGoals("I'm Mina.", interview.goals), [true, false, false]);
    assert.deepEqual(
      checkGoals("I'm a quick learner, good with a team. When do I start?", interview.goals),
      [true, true, true],
    );
    // transfers, terminals, and Korean airports count as destinations.
    const airport = scenarioById("airport")!;
    assert.deepEqual(
      checkGoals("I have a connecting flight at Incheon, Terminal 2.", airport.goals),
      [true, false, false],
    );
    // "wi-fi" normalizes to "wi fi": both halves must match.
    const hotel = scenarioById("hotel")!;
    assert.deepEqual(
      checkGoals("What's the wi-fi password? My reservation is under Mina.", hotel.goals),
      [true, true, false],
    );
    // irregular past tense + cuz-style reasons.
    const smalltalk = scenarioById("smalltalk")!;
    assert.deepEqual(
      checkGoals("I met Jenny and we ate tteokbokki cuz I was hungry. Did you sleep well?", smalltalk.goals),
      [true, true, true],
    );
    // sore throat / runny nose / last night / pills.
    const doctor = scenarioById("doctor")!;
    assert.deepEqual(
      checkGoals("My throat is sore and my nose is runny since last night. Should I take pills?", doctor.goals),
      [true, true, true],
    );
    // less ice, split the bill.
    const restaurant = scenarioById("restaurant")!;
    assert.deepEqual(
      checkGoals("Ramen please, less ice in my water. Let's split the bill.", restaurant.goals),
      [true, true, true],
    );
    // "good morning" must NOT complete arrival+thanks ("good" removed).
    const taxi = scenarioById("taxi")!;
    assert.deepEqual(
      checkGoals("Good morning! To Hongdae, please.", taxi.goals),
      [true, false, false],
    );
    // cancellations count as a booking need.
    const phone = scenarioById("phone")!;
    assert.deepEqual(
      checkGoals("I need to cancel my Friday appointment. My number is 010-1234.", phone.goals),
      [true, true, true],
    );
    // too big / wrong color / last month / replace.
    const ret = scenarioById("return")!;
    assert.deepEqual(
      checkGoals("This is too big and the color is wrong. Bought it last month, here's the receipt. Can you replace it?", ret.goals),
      [true, true, true],
    );
  });
  it("custom scenes: build, derive, resolve", () => {
    assert.equal(createCustomScene({ name: "", icon: "🎭", setting: "x", opener: "", goals: [] }), null);
    assert.equal(createCustomScene({ name: "Bank", icon: "", setting: "  ", opener: "", goals: [] }), null);
    const made = createCustomScene({
      name: "  Bank visit ", icon: "🏦", setting: "Helpful bank clerk.", opener: "", goals: ["Ask about fees", "", "  "],
    });
    assert.ok(made && made.id.startsWith("custom-"));
    assert.equal(made.opener, "Hi! Let's practice — you start.");
    assert.deepEqual(made.goals, ["Ask about fees"]);
    // keyword derivation drops stopwords and short words
    assert.deepEqual(keywordsFromLabel("Order a pizza"), ["order", "pizza"]);
    assert.deepEqual(keywordsFromLabel("Hi!"), []);
    // conversion carries goals into gradeable keywords + a default tip
    const sc = toScenario(made);
    assert.equal(sc.goals.length, 1);
    assert.ok(sc.goals[0].keywords.includes("fees"));
    assert.ok(sc.tip.length > 10);
    assert.deepEqual(checkGoals("What are the fees?", sc.goals), [true]);
    // resolve prefers built-ins, finds customs, rejects unknowns
    assert.equal(resolveScenario("cafe", []), scenarioById("cafe"));
    assert.equal(resolveScenario(made.id, []), null);
    assert.equal(resolveScenario(made.id, [made])?.name, "Bank visit");
    assert.equal(resolveScenario("nope", [made]), null);
    assert.ok(isCustomId(made.id) && !isCustomId("cafe") && !isCustomId(null));
    // no localStorage under node
    assert.deepEqual(loadCustomScenes(), []);
  });
  it("demo script plays the full arc", () => {
    const demo = buildDemoScript();
    assert.equal(demo.length, 8);
    assert.deepEqual(demo.map((m) => m.role), [
      "assistant", "user", "assistant", "user", "assistant", "user", "assistant", "assistant",
    ]);
    assert.ok(demo[0].content.includes("Coco Cafe"));
    // flawed order shows 💡 Fix; clean follow-up omits it
    assert.ok(demo[2].content.includes("💡 Fix"));
    assert.ok(!demo[4].content.includes("💡 Fix"));
    // 💬 lines parse into one-tap chips
    assert.deepEqual(extractExamples(demo[2].content), ["Iced, please", "Hot, please"]);
    assert.deepEqual(extractExamples(demo[4].content), ["Yes, please", "No, that's everything"]);
    // closes with the real wrap-up
    assert.ok(demo[7].content.includes("cleared!") && demo[7].content.includes("Tip:"));
  });
  it("new realistic scenes grade their goals", () => {
    const restaurant = scenarioById("restaurant")!;
    assert.deepEqual(
      checkGoals("A burger please, no cheese — I'm allergic.", restaurant.goals),
      [true, true, false],
    );
    const taxi = scenarioById("taxi")!;
    assert.deepEqual(
      checkGoals("Take me to the airport. How long does it take? Thanks!", taxi.goals),
      [true, true, true],
    );
    const phone = scenarioById("phone")!;
    assert.deepEqual(
      checkGoals("I'd like to book a checkup for tomorrow morning. My name is Mina.", phone.goals),
      [true, true, true],
    );
    const ret = scenarioById("return")!;
    assert.deepEqual(
      checkGoals("I bought this yesterday but it's too small. Can I exchange it? Here's the receipt.", ret.goals),
      [true, true, true],
    );
  });
});
