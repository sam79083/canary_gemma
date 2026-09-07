"use client";

import { useCallback, useRef, useState } from "react";
import type { LanguageModelSession } from "@/lib/prompt-api.d";
import type { ChatMessage } from "@/lib/types";

export type BusyKind = null | "chat" | "ai";

export interface DownloadState {
  show: boolean;
  pct: number;
  label: string;
}

/**
 * Owns the on-device Gemma session (Chrome Prompt API) plus shared UI status.
 * The session itself lives in a ref (not state) since it isn't render data.
 */
export function useLanguageModel() {
  const sessionRef = useRef<LanguageModelSession | null>(null);
  const busyRef = useRef<BusyKind>(null);
  const creatingRef = useRef(false);

  const [status, setStatus] = useState("Checking availability…");
  const [online, setOnline] = useState(false);
  const [ready, setReady] = useState(false);
  const [download, setDownload] = useState<DownloadState>({
    show: false,
    pct: 0,
    label: "",
  });

  const supported = useCallback(async (): Promise<boolean> => {
    if (typeof LanguageModel === "undefined") {
      setStatus("Not supported — use Chrome 148+ / Canary");
      setOnline(false);
      return false;
    }
    try {
      const availability = await LanguageModel.availability();
      setStatus(`Available: ${availability}`);
      setOnline(availability !== "unavailable");
      return availability !== "unavailable";
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
      setOnline(false);
      return false;
    }
  }, []);

  const createSession = useCallback(async (): Promise<boolean> => {
    if (creatingRef.current || sessionRef.current) return false;
    if (typeof LanguageModel === "undefined") return false;
    creatingRef.current = true;
    setReady(false);
    try {
      setStatus("Downloading Gemma 4…");
      setOnline(true);
      setDownload({ show: true, pct: 0, label: "Starting download…" });
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
                  ? `Downloading Gemma 4… ${Math.round(pct)}%`
                  : "Extracting model…",
            });
            setStatus(`Downloading… ${Math.round(pct)}%`);
          });
        },
      });
      setDownload((d) => ({ ...d, show: false }));
      setStatus("Ready — Gemma 4 on-device");
      setOnline(true);
      setReady(true);
      return true;
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
      setDownload((d) => ({ ...d, show: false }));
      sessionRef.current = null;
      return false;
    } finally {
      creatingRef.current = false;
    }
  }, []);

  const restoreSession = useCallback(
    async (history: ChatMessage[]): Promise<boolean> => {
      if (typeof LanguageModel === "undefined") {
        setStatus("LanguageModel not supported");
        return false;
      }
      try {
        const availability = await LanguageModel.availability();
        if (availability === "unavailable") {
          setStatus("Model unavailable");
          return false;
        }
        setStatus("Restoring…");
        sessionRef.current = await LanguageModel.create({
          monitor(m) {
            m.addEventListener("downloadprogress", (ev: Event) => {
              const loaded =
                (ev as unknown as { loaded?: number }).loaded ?? 0;
              const pct = loaded * 100;
              setDownload({
                show: true,
                pct,
                label: `Downloading Gemma 4… ${Math.round(pct)}%`,
              });
              setStatus(`Downloading… ${Math.round(pct)}%`);
            });
          },
        });
        setDownload((d) => ({ ...d, show: false }));
        for (const msg of history) {
          await sessionRef.current.append(
            `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}\n`,
          );
        }
        setStatus("Ready — Gemma 4 on-device");
        setOnline(true);
        setReady(true);
        return true;
      } catch (e) {
        setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
        sessionRef.current = null;
        return false;
      }
    },
    [],
  );

  const destroy = useCallback(() => {
    sessionRef.current?.destroy();
    sessionRef.current = null;
    setStatus("Session destroyed");
    setOnline(false);
    setReady(false);
  }, []);

  return {
    sessionRef,
    busyRef,
    status,
    setStatus,
    online,
    setOnline,
    ready,
    download,
    supported,
    createSession,
    restoreSession,
    destroy,
  };
}

export type LanguageModelApi = ReturnType<typeof useLanguageModel>;
