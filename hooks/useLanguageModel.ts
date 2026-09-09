"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LanguageModelSession } from "@/lib/prompt-api.d";
import type { Lang, TFn } from "@/lib/i18n";
import {
  DEFAULT_OLLAMA_URL,
  OllamaSession,
  listOllamaModels,
} from "@/lib/local-model";
import type { ChatMessage } from "@/lib/types";

export type BusyKind = null | "chat" | "ai";
export type Provider = "gemma" | "ollama";

export interface DownloadState {
  show: boolean;
  pct: number;
  label: string;
}

const PROVIDER_KEY = "canary-provider";
const OLLAMA_URL_KEY = "canary-ollama-url";
const OLLAMA_MODEL_KEY = "canary-ollama-model";

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

  const [provider, setProviderState] = useState<Provider>(() =>
    stored(PROVIDER_KEY) === "ollama" ? "ollama" : "gemma",
  );
  const providerRef = useRef<Provider>(
    stored(PROVIDER_KEY) === "ollama" ? "ollama" : "gemma",
  );
  const [ollamaUrl, setOllamaUrlState] = useState(
    () => stored(OLLAMA_URL_KEY) || DEFAULT_OLLAMA_URL,
  );
  const ollamaUrlRef = useRef(stored(OLLAMA_URL_KEY) || DEFAULT_OLLAMA_URL);
  const [ollamaModel, setOllamaModelState] = useState(
    () => stored(OLLAMA_MODEL_KEY) || "",
  );
  const ollamaModelRef = useRef(stored(OLLAMA_MODEL_KEY) || "");
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaChecking, setOllamaChecking] = useState(false);
  const [ollamaError, setOllamaError] = useState<string | null>(null);

  // Re-translate the "connected" status when the UI language changes.
  useEffect(() => {
    if (ready && sessionRef.current) {
      if (providerRef.current === "ollama" && ollamaModelRef.current)
        setStatus(t("stOllamaReady", { m: ollamaModelRef.current }));
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
      sessionRef.current = await LanguageModel.create({
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
        sessionRef.current = await LanguageModel.create({
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
  };
}

export type LanguageModelApi = ReturnType<typeof useLanguageModel>;
