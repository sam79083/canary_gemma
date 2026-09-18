"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import { writeFileBinary as serverWriteFileBinary } from "@/lib/api";
import { generateHFImage } from "@/lib/cloud-model";
import { createWriteEntry, type UndoInput } from "@/lib/undo";
import { getDrawsToday, recordDraw } from "@/lib/usage";
import { TRIAL_HF_LIMIT } from "@/lib/trial-limits";
import type { BusyKind } from "@/hooks/useLanguageModel";
import type { WorkspaceApi } from "@/hooks/useWorkspace";
import type { ChatMessage } from "@/lib/types";
import type { TFn } from "@/lib/i18n";
import { friendlyError } from "./chat-text";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? "").split(",").slice(1).join(","));
    r.onerror = () => reject(new Error("encode"));
    r.readAsDataURL(blob);
  });
}

/** Text prompt → HD picture (server trial, else your HF key) → chat + files. */
export function useImageDraw({
  busyRef,
  input,
  setInput,
  setStreaming,
  setStreamText,
  pushMessage,
  persistChat,
  hfKey,
  workspace,
  onFilesChanged,
  recordUndo,
  focus,
  noteTrialOver,
  t,
}: {
  busyRef: RefObject<BusyKind>;
  input: string;
  setInput: (v: string) => void;
  setStreaming: (v: boolean) => void;
  setStreamText: (v: string | null) => void;
  pushMessage: (
    role: ChatMessage["role"],
    content: string,
    image?: ChatMessage["image"],
    files?: ChatMessage["files"],
  ) => void;
  persistChat: () => void;
  hfKey: string;
  workspace: WorkspaceApi;
  onFilesChanged: () => void;
  recordUndo: (e: UndoInput) => void;
  focus: () => void;
  noteTrialOver: (e: unknown) => boolean;
  t: TFn;
}) {
  const [draws, setDraws] = useState(0);

  useEffect(() => {
    try {
      setDraws(getDrawsToday());
    } catch {
      // storage unavailable
    }
  }, []);

  const savePicture = useCallback(
    async (blob: Blob, prompt: string): Promise<void> => {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
      const name = `gen-${stamp}.png`;
      const rel = `uploads/${name}`;
      let temp = false;
      if (workspace.connected) {
        try {
          await workspace.makeDir("uploads");
        } catch {
          // exists already
        }
        await workspace.writeBinary(rel, blob);
      } else {
        // No folder (yet): save server-side so the picture is never lost,
        // and nudge to pick a folder instead of blocking.
        await serverWriteFileBinary(rel, await blobToBase64(blob));
        temp = workspace.supported;
      }
      onFilesChanged();
      try {
        // Timestamped names are unique — undo is simply deleting the file.
        recordUndo(createWriteEntry(rel, null, false));
      } catch {
        // recording must never break the save itself
      }
      try {
        setDraws(recordDraw());
      } catch {
        // tracking unavailable — picture still saved
      }
      pushMessage(
        "assistant",
        t("cfSaved", { name: rel }) + (temp ? "\n" + t("cfTemp") : ""),
        {
          name,
          rel,
          url: URL.createObjectURL(blob),
          prompt,
          engine: "hf",
        },
      );
      persistChat();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pushMessage, persistChat, workspace, onFilesChanged, t],
  );

  /** Generate → save → post. HD only (server trial key, else your own). */
  const runDraw = useCallback(
    async (promptText: string, userLabel: string): Promise<void> => {
      if (busyRef.current) return;
      // No early key gate: generateHFImage() tries the server trial key
      // first (/api/hf-draw) and only needs the user's own key as fallback
      // (501 no-server-key) or after the trial budget is spent.
      // (Members bypass the trial via cookie, so this covers them too.)
      busyRef.current = "chat";
      setStreaming(true);
      setInput("");
      pushMessage("user", `${userLabel} ${promptText}`);
      const started = Date.now();
      setStreamText(t("cfDrawing", { n: 0 }));
      const tick = setInterval(() => {
        setStreamText(t("cfDrawing", { n: Math.round((Date.now() - started) / 1000) }));
      }, 1000);
      try {
        const blob = (await generateHFImage(hfKey, promptText)).blob;
        await savePicture(blob, promptText);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "no-space") pushMessage("assistant", t("cfNoSpace"));
        else if (msg === "hf-bad-key") pushMessage("assistant", t("cfHFBad"));
        else if (msg === "hf-limited") pushMessage("assistant", t("cfHFLimited"));
        else if (msg === "trial-over") {
          noteTrialOver(e);
          pushMessage("assistant", t("trOver", { n: TRIAL_HF_LIMIT }));
        }
        else if (msg === "hf-no-key") pushMessage("assistant", t("cfHFNoKey"));
        else if (msg === "hf-no-model") pushMessage("assistant", t("cfHFNoModel"));
        else if (msg === "no-image" || msg === "empty-image") pushMessage("assistant", t("chDidntGet"));
        else if (msg.startsWith("HTTP"))
          pushMessage("assistant", t("cfCloudFail", { msg }));
        else {
          noteTrialOver(e);
          pushMessage("assistant", friendlyError(t, e));
        }
      } finally {
        clearInterval(tick);
        busyRef.current = null;
        setStreaming(false);
        setStreamText(null);
        focus();
        persistChat();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [setInput, pushMessage, persistChat, hfKey, workspace, onFilesChanged, t],
  );

  /** Text prompt → HD picture (server trial, else your HF key) → chat + workspace. */
  const handleDraw = useCallback(async () => {
    // Users often type the 🎨 themselves and then press the button too.
    const prompt = input.replace(/^[🎨✨📷🖼️\s]+/u, "").trim();
    if (!prompt) {
      pushMessage("assistant", t("cfNoPrompt"));
      focus();
      return;
    }
    await runDraw(prompt, "🖼️");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, pushMessage, runDraw, t]);

  /** Re-roll the same prompt (new seed each time). */
  const handleReroll = useCallback(
    async (img: NonNullable<ChatMessage["image"]>) => {
      if (busyRef.current || !img.prompt) return;
      await runDraw(img.prompt, "🖼️");
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [runDraw],
  );

  return { draws, runDraw, handleDraw, handleReroll };
}
