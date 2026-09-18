"use client";

import { useCallback, useEffect, type RefObject } from "react";

/**
 * Return focus to the prompt box for continuous convo.
 * NOTE: finally-blocks call this right after setStreaming(false), but the
 * textarea is still disabled until React commits — a sync .focus() on a
 * disabled element is a no-op and focus is lost to <body>. So defer past
 * the re-enable and retry while disabled.
 */
export function useFocusInput({
  inputRef,
  streaming,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  streaming: boolean;
}) {
  const focusInput = useCallback(() => {
    const attempt = (tries: number) => {
      const el = inputRef.current;
      if (!el) return;
      // Don't pull focus out of an open modal (review / plan / editor /
      // viewer / onboarding) — the modal owns focus until it closes.
      if (
        document.getElementById("review-overlay") ||
        document.getElementById("plan-overlay") ||
        document.getElementById("editor-overlay") ||
        document.getElementById("onboard-overlay") ||
        document.getElementById("image-viewer")
      ) {
        return;
      }
      if (el.disabled) {
        if (tries > 0) setTimeout(() => attempt(tries - 1), 30);
        return;
      }
      try {
        el.focus({ preventScroll: true } as FocusOptions);
      } catch {
        el.focus();
      }
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => setTimeout(() => attempt(10), 0));
    } else {
      setTimeout(() => attempt(10), 0);
    }
  }, [inputRef]);

  // Autofocus on mount so the first message needs no click.
  useEffect(() => {
    inputRef.current?.focus();
  }, [inputRef]);

  // Refocus when a response/search/draw finishes (streaming -> false),
  // unless the user deliberately moved into another field or modal.
  // This covers the disabled-button focus loss (Send becomes disabled after
  // click, focus lands on <body>) without stealing intentional focus.
  useEffect(() => {
    if (streaming) return;
    const ae = document.activeElement as HTMLElement | null;
    if (!ae || ae === document.body) {
      focusInput();
      return;
    }
    if (ae.tagName === "BUTTON") {
      if (
        !ae.closest?.(".review-overlay") &&
        !ae.closest?.(".editor-overlay")
      ) {
        focusInput();
      }
    }
  }, [streaming, focusInput]);

  return focusInput;
}
