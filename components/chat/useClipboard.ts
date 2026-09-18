"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Share/copy with ✓ feedback (message bubbles + context menu). */
export function useClipboard() {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const flagCopied = useCallback((idx: number) => {
    setCopiedIdx(idx);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopiedIdx(null), 2000);
  }, []);

  const shareMsg = useCallback(
    async (text: string, idx: number) => {
      try {
        const nav = navigator as Navigator & {
          share?: (d: { text: string }) => Promise<void>;
        };
        if (typeof nav.share === "function") {
          await nav.share({ text });
          return;
        }
        throw new Error("no-share");
      } catch {
        try {
          await navigator.clipboard.writeText(text);
          flagCopied(idx);
        } catch {
          // clipboard unavailable — nothing more we can do
        }
      }
    },
    [flagCopied],
  );

  /** Plain-text copy with ✓ feedback (chat context menu). */
  const copyText = useCallback(
    async (text: string, idx: number) => {
      try {
        await navigator.clipboard.writeText(text);
        flagCopied(idx);
      } catch {
        // clipboard unavailable — nothing more we can do
      }
    },
    [flagCopied],
  );

  return { copiedIdx, shareMsg, copyText };
}
