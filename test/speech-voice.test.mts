import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  TTS_CHUNK_MAX,
  detectSpeechLang,
  pickSpeechVoice,
  speechLang,
  splitSpeechChunks,
} from "../lib/speech.ts";

describe("speech locales", () => {
  it("maps UI languages to BCP-47 locales", () => {
    assert.equal(speechLang("ko"), "ko-KR");
    assert.equal(speechLang("en"), "en-US");
  });
});

describe("detectSpeechLang", () => {
  it("follows the content script, not the UI language", () => {
    assert.equal(detectSpeechLang("저는 Gemma입니다.", "en"), "ko");
    assert.equal(detectSpeechLang("こんにちは。", "en"), "ja");
    assert.equal(detectSpeechLang("你好。", "en"), "zh");
  });

  it("falls back to the UI language for anything else", () => {
    assert.equal(detectSpeechLang("Hello there.", "es"), "es");
    assert.equal(detectSpeechLang("Hello there.", "ko"), "ko");
    assert.equal(detectSpeechLang("", "en"), "en");
  });
});
describe("pickSpeechVoice", () => {
  const EN = { lang: "en-US", name: "Google US English" };
  const KO = { lang: "ko-KR", name: "Google 한국의" };

  it("prefers the exact locale", () => {
    assert.equal(pickSpeechVoice([EN, KO], "ko"), KO);
  });

  it("falls back to the language prefix", () => {
    assert.equal(
      pickSpeechVoice([EN, { lang: "ko-KP", name: "Quelque" }], "ko")?.lang,
      "ko-KP",
    );
  });

  it("falls back to a name hint when lang tags are blank", () => {
    const v = pickSpeechVoice(
      [EN, { lang: "", name: "Microsoft Heami Desktop - Korean" }],
      "ko",
    );
    assert.equal(v?.name, "Microsoft Heami Desktop - Korean");
  });

  it("returns null with no voices or no match", () => {
    assert.equal(pickSpeechVoice([], "ko"), null);
    assert.equal(pickSpeechVoice([EN], "ko"), null);
  });
});

describe("splitSpeechChunks", () => {
  it("keeps short text in one chunk", () => {
    assert.deepEqual(splitSpeechChunks("안녕하세요."), ["안녕하세요."]);
  });

  it("splits long text into bounded chunks without loss", () => {
    const sents = Array.from(
      { length: 20 },
      (_, i) => `문장 번호 ${i}번입니다. 내용은 테스트용입니다.`,
    );
    const text = sents.join(" ");
    const chunks = splitSpeechChunks(text);
    assert.ok(chunks.length > 1);
    assert.ok(chunks.every((c) => c.length <= TTS_CHUNK_MAX));
    assert.equal(chunks.join(" "), text);
  });

  it("hard-splits one overlong sentence", () => {
    const long = "가".repeat(TTS_CHUNK_MAX + 50);
    const chunks = splitSpeechChunks(long);
    assert.ok(chunks.length > 1);
    assert.ok(chunks.every((c) => c.length <= TTS_CHUNK_MAX));
    assert.equal(chunks.join(""), long);
  });
});
