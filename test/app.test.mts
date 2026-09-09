import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseToolCall, stripToolCalls } from "../lib/agent.ts";
import { renderMarkdown } from "../lib/markdown.ts";
import { GeminiSession } from "../lib/cloud-model.ts";

describe("agent tool parser", () => {
  it("parses a toolcall fence", () => {
    const tc = parseToolCall(
      '```toolcall\n{"name": "readFile", "path": "notes/a.txt"}\n```',
    );
    assert.deepEqual(tc, { name: "readFile", path: "notes/a.txt", content: undefined });
  });

  it("accepts aliases and <tool> tags", () => {
    assert.equal(parseToolCall('<tool>{"tool": "read", "file": "x"}</tool>')?.name, "readFile");
    assert.equal(parseToolCall('```json\n{"name": "mkdir", "path": "d"}\n```')?.name, "makeDir");
  });

  it("returns null for plain answers", () => {
    assert.equal(parseToolCall("Sure, here is your file list."), null);
  });

  it("returns null for malformed JSON", () => {
    assert.equal(parseToolCall('```toolcall\n{name: oops}\n```'), null);
  });

  it("strips toolcalls from final answers", () => {
    assert.equal(stripToolCalls('hi\n```toolcall\n{"a":1}\n```').trim(), "hi");
  });
});

describe("markdown renderer", () => {
  it("formats bold, code, lists, fences, links, headings", () => {
    const h = renderMarkdown("**b** `c`\n\n- a\n- b\n\n```js\nx();\n```\n\n## H\n\n[a](https://x.com)");
    for (const want of ["<strong>b</strong>", 'class="md-code"', 'class="md-list"', "x();", "H", 'href="https://x.com"']) {
      assert.ok(h.includes(want), `missing ${want}`);
    }
  });

  it("escapes injected HTML", () => {
    assert.ok(!renderMarkdown("<script>alert(1)</script>").includes("<script>"));
  });

  it("renders unclosed fences (streaming)", () => {
    assert.ok(renderMarkdown("```py\nprint(1)").includes("print(1)"));
  });
});

describe("cloud SSE parser", () => {
  function sse(obj: object): string {
    return `data: ${JSON.stringify(obj)}\r\n\r\n`;
  }

  async function run(parts: string[]): Promise<{ text: string; usage: unknown }> {
    const enc = new TextEncoder();
    const chunks = parts.map((s) => enc.encode(s));
    let i = 0;
    const body = {
      getReader: () => ({
        read: async () => {
          if (i >= chunks.length) return { done: true, value: undefined };
          return { done: false, value: chunks[i++] };
        },
        releaseLock() {},
      }),
    };
    const origFetch = globalThis.fetch;
    // @ts-expect-error harness
    globalThis.fetch = async () => ({ ok: true, status: 200, body });
    try {
      const s = new GeminiSession("k", "m");
      let text = "";
      for await (const piece of s.promptStreaming("hi")) text += piece;
      return { text, usage: s.lastUsage };
    } finally {
      globalThis.fetch = origFetch;
    }
  }

  it("assembles CRLF events split mid-JSON", async () => {
    const e1 = sse({ candidates: [{ content: { parts: [{ text: "hello " }] } }] });
    const e2 = sse({
      candidates: [{ content: { parts: [{ text: "world" }] } }],
      usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2, totalTokenCount: 5 },
    });
    const cut = Math.floor(e2.length / 2);
    const { text, usage } = await run([e1 + e2.slice(0, cut), e2.slice(cut)]);
    assert.equal(text, "hello world");
    assert.deepEqual(usage, { in: 3, out: 2, total: 5 });
  });

  it("throws (→ non-stream fallback) on empty streams", async () => {
    const s = new GeminiSession("k", "m");
    const origFetch = globalThis.fetch;
    // @ts-expect-error harness
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      body: { getReader: () => ({ read: async () => ({ done: true }), releaseLock() {} }) },
    });
    try {
      await assert.rejects(async () => {
        for await (const _ of s.promptStreaming("hi")) { /* empty */ }
      }, /empty-stream/);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
