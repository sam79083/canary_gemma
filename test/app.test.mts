import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseToolCall, stripToolCalls } from "../lib/agent.ts";
import { renderMarkdown } from "../lib/markdown.ts";
import { sanitizeAnswer } from "../lib/sanitize.ts";
import { GeminiSession, HISTORY_TAIL, generateHFImage } from "../lib/cloud-model.ts";
import { TRIAL_GEMINI_LIMIT } from "../lib/trial-limits.ts";
import { OllamaSession, OLLAMA_HISTORY_TAIL } from "../lib/local-model.ts";

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

describe("answer sanitizer", () => {
  // Doctrine: every rule here is structural (repeats, drafts, labels,
  // dedupe) and knows zero question words. Fixtures below are EXAMPLES
  // only — the same rows pass for any topic. Cover a new shape by adding
  // an it-block with a DIFFERENT question, never wording lists.
  it("strips leading analysis bullets, keeps the answer", () => {
    const raw =
      '*   User question: "gemma가 아니야?"\n' +
      "*   Is it short? Yes.\n" +
      "*   Is it in Korean? Yes.\n" +
      "저는 gemma-4-26b-a4b-it입니다.";
    assert.equal(sanitizeAnswer(raw), "저는 gemma-4-26b-a4b-it입니다.");
  });

  it("takes the answer from a labeled trace (weather question)", () => {
    const raw = [
      "Subject: Weather query.",
      "Locale: Seoul.",
      'Option 1: "There may be rain this afternoon."',
      'Option 2: "No umbrella needed."',
      'Draft: "There may be rain this afternoon."',
      "Summary: There may be rain this afternoon.",
      "There may be rain this afternoon.",
    ].join("\n");
    assert.equal(
      sanitizeAnswer(raw),
      "There may be rain this afternoon.",
    );
  });

  it("takes the answer from a labeled trace (lunch question)", () => {
    const raw =
      "Subject: Lunch plans.\n" +
      "Reminder: The place closes early.\n" +
      "Question: Shall we order pizza? Yes.\n" +
      "Decision: We order pizza at noon.";
    assert.equal(sanitizeAnswer(raw), "We order pizza at noon.");
  });

  it("drops parenthesized notes and Response: labels", () => {
    assert.equal(
      sanitizeAnswer("(Note: thinking here)\nResponse: 안녕하세요."),
      "안녕하세요.",
    );
  });

  it("collapses doubled answers", () => {
    assert.equal(sanitizeAnswer("안녕하세요. 안녕하세요."), "안녕하세요.");
  });

  it("leaves normal answers (incl. lists) untouched", () => {
    const normal = "사과가 좋아요.\n\n- 빨강\n- 파랑";
    assert.equal(sanitizeAnswer(normal), normal);
  });

  it("takes a quoted draft's answer (forecast question)", () => {
    const raw =
      "Topic: Forecast. " +
      'Radar shows "heavy rain after noon". ' +
      '"There may be rain this afternoon." There may be rain this afternoon.';
    assert.equal(sanitizeAnswer(raw), "There may be rain this afternoon.");
  });

  it("cuts a glued bullet deliberation trace to the last Response:", () => {
    const raw =
      "*   Context: The user is interacting with me (gemma-4-26b-a4b-it). *   System Instructions/Identity: I am 'gemma-4-26b-a4b-it'. *   Constraints:\n" +
      "        *   Reply in Korean. *   Output ONLY the final answer. *   No thinking, no checklist. *   Keep it short. " +
      '*   The user\'s question is about "tokens". However, "token" in LLM context usually refers to text segments. ' +
      '*   Wait, the user\'s prompt includes a long instruction block. *   The core question is "토큰?". *   If they mean "Which model?", the answer is \'gemma-4-26b-a4b-it\'. ' +
      '*   Looking at the system instruction: answer truthfully. *   Let\'s refine: it could mean "What model?". *   Given the identity instruction, give that designation. ' +
      '*   Draft response: "gemma-4-26b-a4b-it 모델을 사용 중입니다." *   Let\'s stick to the identity. ' +
      '*   Response: "gemma-4-26b-a4b-it 모델을 사용하고 계십니다."gemma-4-26b-a4b-it 모델을 사용하고 계십니다.';
    assert.equal(sanitizeAnswer(raw), "gemma-4-26b-a4b-it 모델을 사용하고 계십니다.");
  });

  it("extracts the repeated end-answer from a header/Q&A trace", () => {
    const raw =
      "G\nIdentity Constraint: \"you are the model 'm', served through X.\" " +
      "Instruction for Identity: \"give that designation in one short sentence.\" " +
      "Constraint for File questions: Only if asked about files. " +
      "Output format: Only the final answer, 1-3 short sentences. Identity: m\n" +
      "Served through: X\n" +
      "Translation to Korean: 저는 m입니다. " +
      "\" 저는 m입니다.\" One short natural sentence? Yes. Only final answer? Yes. " +
      "Language correct? Yes. \" 저는 m입니다.\" 저는 m입니다.\n⤴";
    assert.equal(sanitizeAnswer(raw), "저는 m입니다.");
  });

  it("takes the trailing answer after scaffolding, any vocab", () => {
    const raw =
      "G\nLength: 1-3 sentences.\nNo preamble/extras.\n" +
      "Capabilities: Text in, text out.\n" +
      "Input: Text and images.\nOutput: Text only.\n" +
      "저는 m으로 답변합니다. 질문에 답합니다.\n" +
      "Korean? Yes.\nNo preamble? Yes.\n" +
      '" 저는 m으로 답변을 생성합니다. 질문에 답합니다." ' +
      "저는 m으로 답변을 생성합니다. 질문에 답합니다.\n\n⤴";
    assert.equal(
      sanitizeAnswer(raw),
      "저는 m으로 답변을 생성합니다. 질문에 답합니다.",
    );
  });

  it("keeps titled answers, distinct facts, and lists", () => {
    assert.equal(
      sanitizeAnswer("제목: 회의록. 내용은 다음과 같습니다."),
      "제목: 회의록. 내용은 다음과 같습니다.",
    );
    assert.equal(
      sanitizeAnswer("오늘 날씨가 좋아요. 내일 날씨가 좋아요."),
      "오늘 날씨가 좋아요. 내일 날씨가 좋아요.",
    );
    assert.equal(
      sanitizeAnswer("Here you go:\n- 사과\n- 배"),
      "Here you go:\n- 사과\n- 배",
    );
  });
  it("takes only what's after the last Final String:", () => {
    const raw =
      "G\nLength: 1-3 sentences.\nIdentity: m.\n" +
      "I can answer questions.\n" +
      '" 저는 m으로 답변합니다. 질문 답변을 수행합니다."\n' +
      "Korean? Yes.\n" +
      "Final String: 저는 m으로 답변합니다. 질문 답변을 수행합니다. " +
      "저는 m으로 답변합니다. 질문 답변을 수행합니다.\n⤴";
    assert.equal(
      sanitizeAnswer(raw),
      "저는 m으로 답변합니다. 질문 답변을 수행합니다.",
    );
  });

  it("drops leading fragments and trailing symbol lines", () => {
    assert.equal(sanitizeAnswer("G\n본문입니다."), "본문입니다.");
    assert.equal(sanitizeAnswer("본문입니다.\n⤴"), "본문입니다.");
    assert.equal(sanitizeAnswer("🎉"), "🎉");
  });
  it("keeps one copy when the final sentence repeats, any question", () => {
    assert.equal(
      sanitizeAnswer("첫 문장. 마지막 문장. 마지막 문장."),
      "첫 문장. 마지막 문장.",
    );
    assert.equal(
      sanitizeAnswer('"Do X." Do X.'),
      "Do X.",
    );
  });

  it("leaves a normal answer ending in a question alone", () => {
    const normal = "오늘 뭐 먹을까? 김치찌개는 어때?";
    assert.equal(sanitizeAnswer(normal), normal);
  });

  it("keeps normal English answers starting with I will", () => {
    const normal = "I will help you write that email.";
    assert.equal(sanitizeAnswer(normal), normal);
  });

  it("leaves code fences and decimals alone", () => {
    const code = "```js\nconst pi = 3.14;\n```";
    assert.equal(sanitizeAnswer(code), code);
    assert.equal(sanitizeAnswer("3.14 is pi."), "3.14 is pi.");
  });

  it("keeps answers that merely mention users or manuals", () => {
    assert.equal(
      sanitizeAnswer("The user manual explains the setup. It is simple."),
      "The user manual explains the setup. It is simple.",
    );
    assert.equal(
      sanitizeAnswer("No problem, I can help with that."),
      "No problem, I can help with that.",
    );
  });

  it("extracts the same way whatever the question (repeat rule)", () => {
    // One structural rule, three unrelated questions — no wording lists.
    assert.equal(
      sanitizeAnswer('"The Haut-Médoc is in Bordeaux." The Haut-Médoc is in Bordeaux.'),
      "The Haut-Médoc is in Bordeaux.",
    );
    assert.equal(
      sanitizeAnswer('"Use const, not let." Use const, not let.'),
      "Use const, not let.",
    );
    assert.equal(
      sanitizeAnswer('"Water boils at 100°C." Water boils at 100°C.'),
      "Water boils at 100°C.",
    );
  });

  it("takes the repeated answer from a check + draft trace (route question)", () => {
    const raw =
      "Check: Answer with the route only. " +
      '"Take Line 2 to City Hall." ' +
      "The fastest option is the subway, not a taxi, and the rider is in a hurry. " +
      '"Take Line 2 to City Hall."Take Line 2 to City Hall.';
    assert.equal(sanitizeAnswer(raw), "Take Line 2 to City Hall.");
  });

  it("keeps a legit 'I should follow up' opener (no scaffolding)", () => {
    const normal = "I should follow up tomorrow. The report is ready.";
    assert.equal(sanitizeAnswer(normal), normal);
  });

  it("leaves a lone constraint line plus answer alone", () => {
    const normal = "Constraint Check passed. Deploying now.";
    assert.equal(sanitizeAnswer(normal), normal);
  });

  it("unglues quoted repeats into one answer", () => {
    assert.equal(sanitizeAnswer('"Hi there!"Hi there!'), "Hi there!");
  });

  it("keeps lone labels that are the actual answer", () => {
    assert.equal(sanitizeAnswer("Name: Sam."), "Name: Sam.");
    assert.equal(
      sanitizeAnswer("Language: English. It has 26 letters."),
      "Language: English. It has 26 letters.",
    );
    assert.equal(
      sanitizeAnswer("Direct answer. The meeting is at noon."),
      "Direct answer. The meeting is at noon.",
    );
  });

  it("cuts planning about 'the user' at the pivot to 'you'", () => {
    const raw =
      "The user is comparing two phone makers and their ecosystems. " +
      "The user is likely asking which brand fits them best. " +
      "Outline: history, products, verdict. " +
      "Because you mentioned battery life, I will focus on that. " +
      "Both brands last a full day. Pick the one with the better warranty.";
    assert.equal(
      sanitizeAnswer(raw),
      "Because you mentioned battery life, I will focus on that. " +
        "Both brands last a full day. Pick the one with the better warranty.",
    );
  });

  it("keeps prose that merely mentions users, even with 'you' nearby", () => {
    assert.equal(
      sanitizeAnswer("The user manual explains the setup. You should read chapter 2 first."),
      "The user manual explains the setup. You should read chapter 2 first.",
    );
    assert.equal(
      sanitizeAnswer("The user account section is under Settings. The user profile photo can be changed there. You can upload a PNG."),
      "The user account section is under Settings. The user profile photo can be changed there. You can upload a PNG.",
    );
    assert.equal(
      sanitizeAnswer("The user asked about refunds. You can get one within 30 days."),
      "The user asked about refunds. You can get one within 30 days.",
    );
  });

  it("cuts planning at the pivot on another topic (cooking)", () => {
    const raw =
      "The user is deciding between pasta and rice tonight. " +
      "The user seems hungry and in a hurry. " +
      "Notes: quick meals only. " +
      "You should make pasta, it takes ten minutes. Pasta is ready fast.";
    assert.equal(
      sanitizeAnswer(raw),
      "You should make pasta, it takes ten minutes. Pasta is ready fast.",
    );
  });

  it("keeps titled and listed content (no scaffolding proof)", () => {
    assert.equal(
      sanitizeAnswer("Ingredients:\n- eggs\n- flour"),
      "Ingredients:\n- eggs\n- flour",
    );
    assert.equal(
      sanitizeAnswer("Title: Quarterly Report. The event was great."),
      "Title: Quarterly Report. The event was great.",
    );
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

  it("caps sent history at HISTORY_TAIL entries", async () => {
    let sentCount = -1;
    const origFetch = globalThis.fetch;
    // @ts-expect-error harness
    globalThis.fetch = async (_url: string, init?: { body?: string }) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        contents?: unknown[];
      };
      sentCount = body.contents?.length ?? -1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }),
      };
    };
    try {
      const s = new GeminiSession("k", "m");
      for (let i = 0; i < 50; i++) {
        await s.append(`User: message ${i}\n`);
      }
      await s.prompt("latest");
      assert.ok(sentCount > 0 && sentCount <= HISTORY_TAIL + 1);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("rewriteLastModelText swaps raw reasoning for the clean answer", async () => {
    const enc = new TextEncoder();
    // Structural trace (labeled lines, quoted draft, bare repeat) — no
    // question-specific wording; any deliberation shape works the same.
    const rawReasoning =
      "Length: 1-3 sentences.\n" +
      "Identity: trial model.\n" +
      '"Trial replies are short."\n' +
      "Trial replies are short.";
    const sseText = `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: rawReasoning }] } }] })}\n\n`;
    const origFetch = globalThis.fetch;
    let lastBody = "";
    // @ts-expect-error harness
    globalThis.fetch = async (_url: string, init?: { body?: string }) => {
      lastBody = String(init?.body ?? "");
      const chunk = enc.encode(sseText);
      let used = false;
      return {
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: async () => {
              if (used) return { done: true, value: undefined };
              used = true;
              return { done: false, value: chunk };
            },
            releaseLock() {},
          }),
        },
      };
    };
    try {
      const s = new GeminiSession("k", "m");
      let first = "";
      for await (const piece of s.promptStreaming("how long are trial replies?")) first += piece;
      assert.ok(first.includes("Length:"));
      s.rewriteLastModelText?.(sanitizeAnswer(first) || first);
      assert.equal(sanitizeAnswer(first), "Trial replies are short.");
      // Next turn re-sends history: reasoning must be gone, clean kept.
      for await (const _ of s.promptStreaming("thanks")) { /* drain */ }
      assert.ok(!lastBody.includes("Length:"));
      assert.ok(lastBody.includes("Trial replies are short."));
    } finally {
      globalThis.fetch = origFetch;
    }
  });
  it("draws HD via generateHFImage", async () => {
    const origFetch = globalThis.fetch;
    let seenAuth = "";
    let seenUrl = "";
    let sawServerFirst = false;
    // @ts-expect-error harness
    globalThis.fetch = async (url: string, init?: { headers?: Record<string, string> }) => {
      seenUrl = String(url);
      if (seenUrl.startsWith("/api/hf-draw")) {
        // No server key in tests → 501, client must fall back to direct.
        sawServerFirst = true;
        return { ok: false, status: 501, json: async () => ({ error: "no-server-key" }) };
      }
      seenAuth = init?.headers?.Authorization ?? "";
      return {
        ok: true,
        status: 200,
        blob: async () => new Blob([new Uint8Array(2048)], { type: "image/jpeg" }),
      };
    };
    try {
      const gen = await generateHFImage("hf_test", "a cat");
      assert.ok(sawServerFirst);
      assert.ok(seenUrl.includes("hf-inference/models/stabilityai/stable-diffusion-3-medium-diffusers"));
      assert.equal(seenAuth, "Bearer hf_test");
      assert.ok(gen.blob.size > 0);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("rejects bad HF keys", async () => {
    const origFetch = globalThis.fetch;
    // @ts-expect-error harness
    globalThis.fetch = async (url: string) => {
      if (String(url).startsWith("/api/hf-draw"))
        return { ok: false, status: 501, json: async () => ({ error: "no-server-key" }) };
      return { ok: false, status: 401, json: async () => ({}) };
    };
    try {
      await assert.rejects(generateHFImage("bad", "a cat"), /hf-bad-key/);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe("trial budgets", () => {
  it("allows N uses then refuses, members bypass", async () => {
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    process.env.TRIAL_FILE = join(tmpdir(), `canary-trial-test-${Date.now()}.json`);
    const { trialUse, trialPeek, clientIp } = await import("../lib/trial.ts");
    const mkReq = (ip: string) =>
      new Request("https://example.com/api/x", {
        headers: { "x-forwarded-for": ip },
      });
    for (let i = 0; i < TRIAL_GEMINI_LIMIT; i++) {
      const left = await trialUse(mkReq("9.9.9.9"), "gemini");
      assert.ok(left >= 0);
    }
    assert.equal(await trialUse(mkReq("9.9.9.9"), "gemini"), -1);
    // Other IP unaffected.
    assert.ok((await trialUse(mkReq("8.8.8.8"), "gemini")) >= 0);
    // No localhost exception: local requests count like any other.
    assert.ok((await trialUse(mkReq("127.0.0.1"), "gemini")) >= 0);
    // Members bypass counting entirely (peek and use).
    assert.ok((await trialUse(mkReq("9.9.9.9"), "gemini", true)) > TRIAL_GEMINI_LIMIT);
    assert.ok((await trialPeek(mkReq("9.9.9.9"), true)).gemini > TRIAL_GEMINI_LIMIT);
    assert.equal(clientIp(mkReq("9.9.9.9")), "9.9.9.9");
    delete process.env.TRIAL_FILE;
  });
});

describe("ollama caps", () => {
  it("caps sent history and sets num_ctx", async () => {
    let sentCount = -1;
    let numCtx: unknown = null;
    const origFetch = globalThis.fetch;
    const enc = new TextEncoder();
    // @ts-expect-error harness
    globalThis.fetch = async (_url: string, init?: { body?: string }) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        messages?: unknown[];
        options?: { num_ctx?: number };
      };
      sentCount = body.messages?.length ?? -1;
      numCtx = body.options?.num_ctx ?? null;
      const line = enc.encode(
        JSON.stringify({ message: { content: "ok" }, done: true }) + "\n",
      );
      let used = false;
      return {
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: async () => {
              if (used) return { done: true, value: undefined };
              used = true;
              return { done: false, value: line };
            },
            releaseLock() {},
          }),
        },
      };
    };
    try {
      const s = new OllamaSession("http://localhost:11434", "m");
      for (let i = 0; i < 50; i++) {
        await s.append(`User: message ${i}\n`);
      }
      await s.prompt("latest");
      assert.ok(sentCount > 0 && sentCount <= OLLAMA_HISTORY_TAIL + 1);
      assert.equal(numCtx, 16384);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
