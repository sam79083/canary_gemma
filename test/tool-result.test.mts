import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildToolResultTurn } from "../lib/agent.ts";

describe("tool result turns", () => {
  it("frames revision requests as changes, not failures", () => {
    const turn = buildToolResultTurn(
      { name: "writeFile", path: "notes/todo.txt" },
      false,
      "User wants changes: longer",
      false,
      true,
    );
    assert.ok(turn.includes("CHANGES REQUESTED"));
    assert.ok(!turn.includes("FAILED"));
    assert.ok(turn.includes("Do not apologize"));
  });

  it("keeps failure and decline framing unchanged", () => {
    const failed = buildToolResultTurn(
      { name: "readFile", path: "x.txt" },
      false,
      "Not found",
    );
    assert.ok(failed.includes("FAILED"));
    const declined = buildToolResultTurn(
      { name: "writeFile", path: "x.txt" },
      false,
      "kept",
      true,
    );
    assert.ok(declined.includes("DECLINED BY USER"));
  });
});
