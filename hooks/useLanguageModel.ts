"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LanguageModelSession } from "@/lib/prompt-api.d";
import type { ExpectedInput } from "@/lib/prompt-api.d";
import type { Lang, TFn } from "@/lib/i18n";
import {
  DEFAULT_OLLAMA_URL,
  OllamaSession,
  listOllamaModels,
} from "@/lib/local-model";
import {
  DEFAULT_GEMINI_MODEL,
  FALLBACK_GEMINI_MODEL,
  GeminiSession,
  TrialChatSession,
  listGeminiModels,
} from "@/lib/cloud-model";
import { TRIAL_GEMINI_LIMIT } from "@/lib/trial-limits";
import type { ChatMessage } from "@/lib/types";

export type BusyKind = null | "chat" | "ai";
export type Provider = "gemma" | "ollama" | "cloud";

export interface DownloadState {
  show: boolean;
  pct: number;
  label: string;
}

const PROVIDER_KEY = "canary-provider";
const OLLAMA_URL_KEY = "canary-ollama-url";
const OLLAMA_MODEL_KEY = "canary-ollama-model";
const GEMINI_KEY = "canary-gemini-key";
const GEMINI_MODEL_KEY = "canary-gemini-model";

function storedProvider(): Provider {
  const v = stored(PROVIDER_KEY);
  return v === "ollama" || v === "cloud" ? v : "gemma";
}

/**
 * Chrome only accepts de/en/es/fr/ja as create() output languages.
 * Anything else → omit (our prompts already carry a "Reply in X" line).
 */
function outputLangFor(lang: Lang): string | undefined {
  return lang === "de" ||
    lang === "en" ||
    lang === "es" ||
    lang === "fr" ||
    lang === "ja"
    ? lang
    : undefined;
}

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

/**
 * Owns the AI session plus shared UI status. Two providers:
 * - "gemma": Chrome built-in Prompt API (on-device Gemma).
 * - "ollama": any Ollama-compatible local server (/api/tags + /api/chat).
 * Both expose the same LanguageModelSession shape, so chat/file tools work
 * unchanged. All user-facing status goes through t() (Korean default).
 */
export function useLanguageModel(lang: Lang, t: TFn) {
  const sessionRef = useRef<LanguageModelSession | null>(null);
  const busyRef = useRef<BusyKind>(null);
  const creatingRef = useRef(false);

  const [status, setStatus] = useState(t("stStarting"));
  const [online, setOnline] = useState(false);
  const [ready, setReady] = useState(false);
  const [availability, setAvailability] = useState<string | null>(null);
  const [download, setDownload] = useState<DownloadState>({
    show: false,
    pct: 0,
    label: "",
  });

  const [provider, setProviderState] = useState<Provider>("gemma");
  const providerRef = useRef<Provider>("gemma");
  const [ollamaUrl, setOllamaUrlState] = useState(DEFAULT_OLLAMA_URL);
  const ollamaUrlRef = useRef(DEFAULT_OLLAMA_URL);
  const [ollamaModel, setOllamaModelState] = useState("");
  const ollamaModelRef = useRef("");
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaChecking, setOllamaChecking] = useState(false);
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [geminiKey, setGeminiKeyState] = useState("");
  const geminiKeyRef = useRef("");
  const [geminiModel, setGeminiModelState] = useState(DEFAULT_GEMINI_MODEL);
  const geminiModelRef = useRef(DEFAULT_GEMINI_MODEL);
  const [geminiModels, setGeminiModels] = useState<string[]>([]);
  const [geminiChecking, setGeminiChecking] = useState(false);
  const [geminiError, setGeminiError] = useState<string | null>(null);
  const geminiErrorRef = useRef<string | null>(null);
  // False during SSR/first paint (defaults), true once stored settings load.
  // Screens must wait for this before starting a session — otherwise the
  // server HTML (defaults) mismatches the client (stored values).
  const [hydrated, setHydrated] = useState(false);

  // Load persisted settings once after mount (localStorage is client-only).
  useEffect(() => {
    const p = storedProvider();
    providerRef.current = p;
    setProviderState(p);
    const ou = stored(OLLAMA_URL_KEY) || DEFAULT_OLLAMA_URL;
    ollamaUrlRef.current = ou;
    setOllamaUrlState(ou);
    const om = stored(OLLAMA_MODEL_KEY) || "";
    ollamaModelRef.current = om;
    setOllamaModelState(om);
    const gk = stored(GEMINI_KEY) || "";
    geminiKeyRef.current = gk;
    setGeminiKeyState(gk);
    const gm = stored(GEMINI_MODEL_KEY) || DEFAULT_GEMINI_MODEL;
    geminiModelRef.current = gm;
    setGeminiModelState(gm);
    setHydrated(true);
  }, []);
  const setGemErr = useCallback((e: string | null) => {
    geminiErrorRef.current = e;
    setGeminiError(e);
  }, []);

  // Re-translate the "connected" status when the UI language changes.
  useEffect(() => {
    if (ready && sessionRef.current) {
      if (providerRef.current === "ollama" && ollamaModelRef.current)
        setStatus(t("stOllamaReady", { m: ollamaModelRef.current }));
      else if (providerRef.current === "cloud" && geminiModelRef.current)
        setStatus(t("stCloudReady", { m: geminiModelRef.current }));
      else if (providerRef.current === "gemma") setStatus(t("stReadyOk"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, ready]);

  const setProvider = useCallback((p: Provider) => {
    providerRef.current = p;
    setProviderState(p);
    store(PROVIDER_KEY, p);
  }, []);

  const setOllamaUrl = useCallback((url: string) => {
    ollamaUrlRef.current = url;
    setOllamaUrlState(url);
    store(OLLAMA_URL_KEY, url);
  }, []);

  const setOllamaModel = useCallback((m: string) => {
    ollamaModelRef.current = m;
    setOllamaModelState(m);
    store(OLLAMA_MODEL_KEY, m);
  }, []);

  const setGeminiKey = useCallback((k: string) => {
    geminiKeyRef.current = k;
    setGeminiKeyState(k);
    store(GEMINI_KEY, k);
  }, []);

  const setGeminiModel = useCallback((m: string) => {
    geminiModelRef.current = m;
    setGeminiModelState(m);
    store(GEMINI_MODEL_KEY, m);
  }, []);

  /** Re-list Gemma models for this key; returns names (may be empty). */
  const refreshGeminiModels = useCallback(async (): Promise<string[]> => {
    if (!geminiKeyRef.current) {
      setGeminiModels([]);
      setGemErr("need-key");
      return [];
    }
    setGeminiChecking(true);
    setGemErr(null);
    try {
      const names = await listGeminiModels(geminiKeyRef.current);
      setGeminiModels(names);
      if (names.length === 0) {
        setGemErr("none");
      } else if (!names.includes(geminiModelRef.current)) {
        const pick =
          names.find((n) => n === DEFAULT_GEMINI_MODEL) ??
          names.find((n) => n === FALLBACK_GEMINI_MODEL) ??
          names[0];
        geminiModelRef.current = pick;
        setGeminiModelState(pick);
        store(GEMINI_MODEL_KEY, pick);
      }
      return names;
    } catch (e) {
      setGeminiModels([]);
      setGemErr(
        String(e instanceof Error ? e.message : e).includes("bad-key")
          ? "bad-key"
          : "unreachable",
      );
      return [];
    } finally {
      setGeminiChecking(false);
    }
  }, [setGemErr]);

  /** Re-list models on the Ollama server; returns names (may be empty). */
  const refreshOllamaModels = useCallback(async (): Promise<string[]> => {
    setOllamaChecking(true);
    setOllamaError(null);
    try {
      const names = await listOllamaModels(ollamaUrlRef.current);
      setOllamaModels(names);
      if (names.length === 0) {
        setOllamaError("none");
      } else if (!ollamaModelRef.current || !names.includes(ollamaModelRef.current)) {
        const pick = names[0];
        ollamaModelRef.current = pick;
        setOllamaModelState(pick);
        store(OLLAMA_MODEL_KEY, pick);
      }
      return names;
    } catch {
      setOllamaModels([]);
      setOllamaError("unreachable");
      return [];
    } finally {
      setOllamaChecking(false);
    }
  }, []);

  // Returns the raw availability string ("available" | "downloading" |
  // "downloadable" | "unavailable" | "unsupported"). Callers must check it:
  // Chrome throws "Requires a user gesture" if create() runs without a click
  // while availability is "downloading" or "downloadable".
  const supported = useCallback(async (): Promise<string> => {
    if (providerRef.current === "cloud") {
      if (!geminiKeyRef.current) {
        // No key: trial mode through the server key (capped per visitor).
        setStatus(t("stTrialMode", { n: TRIAL_GEMINI_LIMIT }));
        setOnline(true);
        setAvailability("available");
        return "available";
      }
      setStatus(t("stCloudChecking"));
      setOnline(true);
      const names = await refreshGeminiModels();
      if (names.length === 0) {
        setStatus(
          geminiErrorRef.current === "bad-key" ? t("stCloudBadKey") : t("stCloudFail"),
        );
        setOnline(false);
        setAvailability("unavailable");
        return "unavailable";
      }
      setStatus(t("stReadyToStart"));
      setOnline(true);
      setAvailability("available");
      return "available";
    }
    if (providerRef.current === "ollama") {
      setStatus(t("stOllamaChecking"));
      setOnline(true);
      const names = await refreshOllamaModels();
      if (names.length === 0) {
        setStatus(t("stOllamaFail"));
        setOnline(false);
        setAvailability("unavailable");
        return "unavailable";
      }
      setStatus(t("stReadyToStart"));
      setOnline(true);
      setAvailability("available");
      return "available";
    }
    if (typeof LanguageModel === "undefined") {
      setStatus(t("stNeedChrome"));
      setOnline(false);
      setAvailability("unsupported");
      return "unsupported";
    }
    try {
      const availability = await LanguageModel.availability();
      setAvailability(availability);
      if (availability === "available") setStatus(t("stReadyToStart"));
      else if (availability === "downloading" || availability === "downloadable")
        setStatus(t("stOneClick"));
      else setStatus(t("stUnavailable"));
      setOnline(availability !== "unavailable");
      return availability;
    } catch {
      setStatus(t("stWentWrong"));
      setOnline(false);
      setAvailability("unavailable");
      return "unavailable";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshOllamaModels]);

  const createSession = useCallback(async (): Promise<boolean> => {
    if (creatingRef.current || sessionRef.current) return false;
    if (providerRef.current === "cloud") {
      creatingRef.current = true;
      setReady(false);
      try {
        if (!geminiKeyRef.current) {
          // Trial mode: server key, visitor-capped. Model is fixed.
          sessionRef.current = new TrialChatSession();
          geminiModelRef.current = DEFAULT_GEMINI_MODEL;
          setGeminiModelState(DEFAULT_GEMINI_MODEL);
          setStatus(t("stTrialMode", { n: TRIAL_GEMINI_LIMIT }));
          setOnline(true);
          setReady(true);
          return true;
        }
        if (!geminiModelRef.current) {
          const names = await refreshGeminiModels();
          if (names.length === 0 || !geminiModelRef.current) {
            setStatus(t("stCloudFail"));
            return false;
          }
        }
        sessionRef.current = new GeminiSession(
          geminiKeyRef.current,
          geminiModelRef.current,
          t("sysIdentityCloud", { m: geminiModelRef.current }),
        );
        setStatus(t("stCloudReady", { m: geminiModelRef.current }));
        setOnline(true);
        setReady(true);
        return true;
      } catch (e) {
        setStatus(
          String(e instanceof Error ? e.message : e).includes("bad-key")
            ? t("stCloudBadKey")
            : t("stCloudFail"),
        );
        sessionRef.current = null;
        return false;
      } finally {
        creatingRef.current = false;
      }
    }
    if (providerRef.current === "ollama") {
      creatingRef.current = true;
      setReady(false);
      try {
        if (!ollamaModelRef.current) {
          const names = await refreshOllamaModels();
          if (names.length === 0 || !ollamaModelRef.current) {
            setStatus(t("stOllamaFail"));
            return false;
          }
        }
        sessionRef.current = new OllamaSession(
          ollamaUrlRef.current,
          ollamaModelRef.current,
          t("sysIdentityLocal", { m: ollamaModelRef.current }),
        );
        setStatus(t("stOllamaReady", { m: ollamaModelRef.current }));
        setOnline(true);
        setReady(true);
        return true;
      } catch {
        setStatus(t("stOllamaFail"));
        sessionRef.current = null;
        return false;
      } finally {
        creatingRef.current = false;
      }
    }
    if (typeof LanguageModel === "undefined") return false;
    creatingRef.current = true;
    setReady(false);
    try {
      setStatus(t("stGettingReady"));
      setOnline(true);
      setDownload({ show: true, pct: 0, label: t("stStartingDl") });
      const outputLanguage = outputLangFor(lang);
      sessionRef.current = await LanguageModel.create({
        ...(outputLanguage ? { outputLanguage } : null),
        initialPrompts: [{ role: "system", content: t("sysIdentityBuiltIn") }],
        monitor(m) {
          m.addEventListener("downloadprogress", (ev: Event) => {
            const loaded = (ev as unknown as { loaded?: number }).loaded ?? 0;
            const pct = loaded * 100;
            setDownload({
              show: true,
              pct,
              label:
                pct < 100
                  ? t("stGettingPct", { pct: Math.round(pct) })
                  : t("stAlmostDone"),
            });
            setStatus(t("stGettingPct", { pct: Math.round(pct) }));
          });
        },
      });
      setDownload((d) => ({ ...d, show: false }));
      setStatus(t("stReadyOk"));
      setOnline(true);
      setReady(true);
      return true;
    } catch {
      setStatus(t("stCantStart"));
      setDownload((d) => ({ ...d, show: false }));
      sessionRef.current = null;
      return false;
    } finally {
      creatingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshOllamaModels]);

  const restoreSession = useCallback(
    async (history: ChatMessage[]): Promise<boolean> => {
      if (providerRef.current === "cloud") {
        try {
          if (!geminiKeyRef.current) {
            setStatus(t("stPickingUp"));
            const s = new TrialChatSession();
            for (const msg of history) {
              await s.append(
                `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}\n`,
              );
            }
            sessionRef.current = s;
            geminiModelRef.current = DEFAULT_GEMINI_MODEL;
            setGeminiModelState(DEFAULT_GEMINI_MODEL);
            setStatus(t("stTrialMode", { n: TRIAL_GEMINI_LIMIT }));
            setOnline(true);
            setReady(true);
            return true;
          }
          if (!geminiModelRef.current) {
            const names = await refreshGeminiModels();
            if (names.length === 0 || !geminiModelRef.current) {
              setStatus(t("stCloudFail"));
              return false;
            }
          }
          setStatus(t("stPickingUp"));
          const s = new GeminiSession(
            geminiKeyRef.current,
            geminiModelRef.current,
            t("sysIdentityCloud", { m: geminiModelRef.current }),
          );
          for (const msg of history) {
            await s.append(
              `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}\n`,
            );
          }
          sessionRef.current = s;
          setStatus(t("stCloudReady", { m: geminiModelRef.current }));
          setOnline(true);
          setReady(true);
          return true;
        } catch {
          setStatus(t("stCloudFail"));
          sessionRef.current = null;
          return false;
        }
      }
      if (providerRef.current === "ollama") {
        try {
          if (!ollamaModelRef.current) {
            const names = await refreshOllamaModels();
            if (names.length === 0 || !ollamaModelRef.current) {
              setStatus(t("stOllamaFail"));
              return false;
            }
          }
          setStatus(t("stPickingUp"));
          const s = new OllamaSession(
            ollamaUrlRef.current,
            ollamaModelRef.current,
            t("sysIdentityLocal", { m: ollamaModelRef.current }),
          );
          for (const msg of history) {
            await s.append(
              `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}\n`,
            );
          }
          sessionRef.current = s;
          setStatus(t("stOllamaReady", { m: ollamaModelRef.current }));
          setOnline(true);
          setReady(true);
          return true;
        } catch {
          setStatus(t("stOllamaFail"));
          sessionRef.current = null;
          return false;
        }
      }
      if (typeof LanguageModel === "undefined") {
        setStatus(t("stNeedChrome"));
        return false;
      }
      try {
        const availability = await LanguageModel.availability();
        if (availability === "unavailable") {
          setStatus(t("stUnavailable"));
          return false;
        }
        setStatus(t("stPickingUp"));
        const restoreLang = outputLangFor(lang);
        sessionRef.current = await LanguageModel.create({
          ...(restoreLang ? { outputLanguage: restoreLang } : null),
          monitor(m) {
            m.addEventListener("downloadprogress", (ev: Event) => {
              const loaded =
                (ev as unknown as { loaded?: number }).loaded ?? 0;
              const pct = loaded * 100;
              setDownload({
                show: true,
                pct,
                label: t("stGettingPct", { pct: Math.round(pct) }),
              });
              setStatus(t("stGettingPct", { pct: Math.round(pct) }));
            });
          },
        });
        setDownload((d) => ({ ...d, show: false }));
        for (const msg of history) {
          await sessionRef.current.append(
            `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}\n`,
          );
        }
        setStatus(t("stReadyOk"));
        setOnline(true);
        setReady(true);
        return true;
      } catch {
        setStatus(t("stCantStart"));
        sessionRef.current = null;
        return false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refreshOllamaModels],
  );

  const destroy = useCallback(() => {
    sessionRef.current?.destroy();
    sessionRef.current = null;
    visionSessionRef.current?.destroy();
    visionSessionRef.current = null;
    setStatus(t("stChatCleared"));
    setOnline(false);
    setReady(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Drop the current session and connect fresh with the current provider. */
  const reconnect = useCallback(async (): Promise<boolean> => {
    sessionRef.current?.destroy();
    sessionRef.current = null;
    setReady(false);
    const avail = await supported();
    if (avail === "unavailable" || avail === "unsupported") return false;
    return createSession();
  }, [supported, createSession]);

  const visionSessionRef = useRef<LanguageModelSession | null>(null);

  /**
   * Lazily create a multimodal (text+image) Gemma session for photo turns.
   * Returns null where the platform can't do it — callers fall back to text.
   */
  const ensureVisionSession = useCallback(async (): Promise<LanguageModelSession | null> => {
    if (providerRef.current !== "gemma" || typeof LanguageModel === "undefined")
      return null;
    if (visionSessionRef.current) return visionSessionRef.current;
    try {
      setStatus(t("chPhotoMode"));
      const outputLanguage = outputLangFor(lang);
      const expectedInputs: ExpectedInput[] = [
        { type: "text", ...(outputLanguage ? { languages: [outputLanguage] } : {}) },
        { type: "image" },
      ];
      const avail = await LanguageModel.availability({
        expectedInputs,
        expectedOutputs: [{ type: "text" }],
      });
      if (avail === "unavailable") {
        setStatus(t("stReadyOk"));
        return null;
      }
      const vs = await LanguageModel.create({
        ...(outputLanguage ? { outputLanguage } : null),
        expectedInputs,
        expectedOutputs: [{ type: "text" }],
        monitor(m) {
          m.addEventListener("downloadprogress", (ev: Event) => {
            const loaded = (ev as unknown as { loaded?: number }).loaded ?? 0;
            const pct = loaded * 100;
            setDownload({
              show: true,
              pct,
              label: t("stGettingPct", { pct: Math.round(pct) }),
            });
            setStatus(t("stGettingPct", { pct: Math.round(pct) }));
          });
        },
      });
      setDownload((d) => ({ ...d, show: false }));
      visionSessionRef.current = vs;
      setStatus(t("stReadyOk"));
      return vs;
    } catch {
      setDownload((d) => ({ ...d, show: false }));
      setStatus(t("stReadyOk"));
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    sessionRef,
    busyRef,
    status,
    setStatus,
    online,
    setOnline,
    ready,
    availability,
    download,
    supported,
    createSession,
    restoreSession,
    destroy,
    reconnect,
    provider,
    setProvider,
    ollamaUrl,
    setOllamaUrl,
    ollamaModel,
    setOllamaModel,
    ollamaModels,
    ollamaChecking,
    ollamaError,
    refreshOllamaModels,
    geminiKey,
    setGeminiKey,
    geminiModel,
    setGeminiModel,
    geminiModels,
    geminiChecking,
    geminiError,
    refreshGeminiModels,
    ensureVisionSession,
    hydrated,
  };
}

export type LanguageModelApi = ReturnType<typeof useLanguageModel>;
