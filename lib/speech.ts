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

/**
 * Voice language from the CONTENT, not the UI language: the top language
 * picker only switches UI text, so reading must follow what the message
 * actually says. Script heuristic (ko > ja-kana > zh-hanzi); anything else
 * falls back to the UI language.
 */
export function detectSpeechLang(text: string, fallback: Lang): Lang {
  if (/[가-힣]/.test(text)) return "ko";
  if (/[ぁ-ゔァ-ヴー]/.test(text)) return "ja";
  if (/[一-鿿豈-﫿]/.test(text)) return "zh";
  return fallback;
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

/** localStorage key for the user's chosen read-aloud voice. */
export const TTS_VOICE_KEY = "canary-tts-voice";

/** Stable identity for a voice across sessions. */
export function voiceKey(v: VoiceLike): string {
  return `${v.lang || ""}|||${v.name || ""}`;
}

export function getStoredVoiceKey(): string | null {
  try {
    return localStorage.getItem(TTS_VOICE_KEY);
  } catch {
    return null;
  }
}

export function setStoredVoiceKey(key: string | null): void {
  try {
    if (key) localStorage.setItem(TTS_VOICE_KEY, key);
    else localStorage.removeItem(TTS_VOICE_KEY);
  } catch {
    // ignore
  }
}

/** Best voice: stored choice first, then exact locale → prefix → name hint.
 * Within each tier, neural voices win: OS vendors ship both robotic
 * legacy voices and "Natural"/"Online" neural ones under the same locale
 * (e.g. Windows 11 Korean "Online (Natural)"), and the legacy one usually
 * sorts first. */
export function pickSpeechVoice(
  voices: VoiceLike[],
  lang: Lang,
  preferredKey?: string | null,
): VoiceLike | null {
  if (voices.length === 0) return null;
  if (preferredKey) {
    const chosen = voices.find((v) => voiceKey(v) === preferredKey);
    if (chosen) return chosen;
  }
  const want = speechLang(lang).toLowerCase();
  const prefix = want.split("-")[0];
  const naturalFirst = (list: VoiceLike[]): VoiceLike | null => {
    if (list.length === 0) return null;
    return (
      list.find((v) => /natural|online|neural/i.test(v.name || "")) ?? list[0]
    );
  };
  return (
    naturalFirst(
      voices.filter((v) => (v.lang || "").toLowerCase() === want),
    ) ??
    naturalFirst(
      voices.filter((v) => (v.lang || "").toLowerCase().startsWith(prefix)),
    ) ??
    naturalFirst(
      voices.filter((v) => /korean|한국어|한국/i.test(v.name || "")),
    )
  );
}
