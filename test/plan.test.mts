import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPlanPrompt, formatPlan, parsePlan } from "../lib/agent.ts";

describe("plan parser", () => {
  it("parses a plan fence", () => {
    const plan = parsePlan(
      '```plan\n{"goal": "Make todo", "steps": [{"action": "write file", "path": "notes/todo.txt"}]}\n```',
    );
    assert.deepEqual(plan, {
      goal: "Make todo",
      steps: [{ action: "write file", path: "notes/todo.txt" }],
    });
  });

  it("accepts json fences and trims caps", () => {
    const plan = parsePlan(
      'Sure.\n```json\n{"goal": "  Tidy up  ", "steps": [{"action": "  list files  "}, {"action": ""}]}\n```',
    );
    assert.deepEqual(plan, {
      goal: "Tidy up",
      steps: [{ action: "list files" }],
    });
  });

  it("returns null for prose and malformed JSON", () => {
    assert.equal(parsePlan("I'll create the file for you."), null);
    assert.equal(parsePlan("```plan\n{not json}\n```"), null);
    assert.equal(
      parsePlan('```plan\n{"goal": "", "steps": []}\n```'),
      null,
    );
  });

  it("formats an approved plan for the agent turn", () => {
    assert.equal(
      formatPlan({
        goal: "Make todo",
        steps: [{ action: "write file", path: "notes/todo.txt" }],
      }),
      "Goal: Make todo\n1. write file (notes/todo.txt)",
    );
  });

  it("builds a planning-only prompt", () => {
    const p = buildPlanPrompt("(empty workspace)", "Answer in Korean.");
    assert.ok(p.includes("```plan"));
    assert.ok(p.includes("Do not run anything yet"));
    assert.ok(p.includes("plain-language"));
    assert.ok(p.includes("Answer in Korean."));
  });
});
