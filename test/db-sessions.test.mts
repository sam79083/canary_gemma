import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  dbRowToSessionInfo,
  sanitizeDbMessages,
} from "../lib/db-sessions.ts";

describe("db-sessions sanitize", () => {
  it("keeps plain user/assistant text turns only", () => {
    const out = sanitizeDbMessages([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
      { role: "system", content: "nope" },
      { role: "user", content: "   " },
      { role: "user", content: 42 },
      null,
      "junk",
      { role: "assistant", content: "with image", image: { name: "x.png" } },
    ]);
    assert.deepEqual(out, [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
      { role: "assistant", content: "with image" },
    ]);
  });

  it("rejects non-arrays and caps size", () => {
    assert.deepEqual(sanitizeDbMessages(null), []);
    assert.deepEqual(sanitizeDbMessages("x"), []);
    const many = Array.from({ length: 300 }, (_, i) => ({
      role: "user",
      content: `m${i}`,
    }));
    const out = sanitizeDbMessages(many);
    assert.equal(out.length, 200);
    const big = sanitizeDbMessages([
      { role: "user", content: "a".repeat(30000) },
    ]);
    assert.equal(big[0].content.length, 20000);
  });

  it("maps rows onto SessionInfo", () => {
    const s = dbRowToSessionInfo({
      id: "11111111-2222-3333-4444-555555555555",
      title: "hello",
      updated_at: "2026-09-17T10:00:00.000Z",
    });
    assert.equal(s.filename, "11111111-2222-3333-4444-555555555555");
    assert.equal(s.title, "hello");
    assert.equal(s.timestamp, Date.parse("2026-09-17T10:00:00.000Z"));
    const blank = dbRowToSessionInfo({
      id: "abc",
      title: "  ",
      updated_at: "not-a-date",
    });
    assert.equal(blank.title, "abc");
    assert.ok(Number.isFinite(blank.timestamp));
  });
});
