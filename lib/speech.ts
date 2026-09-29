// Shared speech helpers (read-aloud TTS + voice input locales).
// Dependency-free so the browser bundle and node tests can both import it:
// no React, no window access, no path aliases.
import type { Lang } from "./i18n.ts";

/** BCP-47 voice locale per UI language (shared with the read-aloud hook). */
export function speechLang(lang: Lang): string {
  switch (lang) {
    case "ko":
      return "ko-KR";
    case "en":
      return "en-US";
    case "ja":
      return "ja-JP";
    case "zh":
      return "zh-CN";
    case "es":
      return "es-ES";
  }
}

/** Max chars per utterance — long single utterances get cut off. */
export const TTS_CHUNK_MAX = 200;

/** Split text into speakable chunks on sentence/line boundaries. */
export function splitSpeechChunks(text: string): string[] {
  const pieces = text
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  let cur = "";
  const pushCur = () => {
    if (cur) out.push(cur);
    cur = "";
  };
  for (const p of pieces) {
    if ((cur ? cur.length + 1 + p.length : p.length) <= TTS_CHUNK_MAX) {
      cur = cur ? `${cur} ${p}` : p;
    } else {
      pushCur();
      // One overlong sentence: hard-split so nothing is lost.
      let rest = p;
      while (rest.length > TTS_CHUNK_MAX) {
        out.push(rest.slice(0, TTS_CHUNK_MAX));
        rest = rest.slice(TTS_CHUNK_MAX);
      }
      cur = rest;
    }
  }
  pushCur();
  return out.length > 0 ? out : [text];
}

export interface VoiceLike {
  lang: string;
  name: string;
}

/** Best voice for the UI language: exact locale → prefix → name hint. */
export function pickSpeechVoice(
  voices: VoiceLike[],
  lang: Lang,
): VoiceLike | null {
  if (voices.length === 0) return null;
  const want = speechLang(lang).toLowerCase();
  const prefix = want.split("-")[0];
  return (
    voices.find((v) => (v.lang || "").toLowerCase() === want) ??
    voices.find((v) => (v.lang || "").toLowerCase().startsWith(prefix)) ??
    voices.find((v) => /korean|한국어|한국/i.test(v.name || "")) ??
    null
  );
}
