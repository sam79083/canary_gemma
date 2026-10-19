"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface AudioRecorder {
  /** MediaRecorder + getUserMedia available (hydration-safe: set on mount). */
  supported: boolean;
  recording: boolean;
  seconds: number;
  /** Object URL of the last take, or null. Revoked on clear/retake/unmount. */
  url: string | null;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  clear: () => void;
}

/** Longest single take — sentences are short; this stops runaway recordings. */
const MAX_SECONDS = 30;

/**
 * Record the learner's voice locally (MediaRecorder, no upload anywhere) and
 * hand back a playable object URL so they can compare with the model audio.
 * Self-contained; safe on unsupported browsers (supported=false, buttons
 * should be disabled/honest).
 */
export function useAudioRecorder(): AudioRecorder {
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const urlRef = useRef<string | null>(null);
  const deadRef = useRef(false);

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        typeof MediaRecorder !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia,
    );
    return () => {
      deadRef.current = true;
      try {
        if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
      } catch {
        // already stopped
      }
      recRef.current = null;
      try {
        streamRef.current?.getTracks().forEach((t) => t.stop());
      } catch {
        // ignore
      }
      streamRef.current = null;
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      if (urlRef.current) {
        try {
          URL.revokeObjectURL(urlRef.current);
        } catch {
          // ignore
        }
        urlRef.current = null;
      }
    };
  }, []);

  const clear = useCallback(() => {
    if (urlRef.current) {
      try {
        URL.revokeObjectURL(urlRef.current);
      } catch {
        // ignore
      }
      urlRef.current = null;
    }
    setUrl(null);
    setSeconds(0);
    setError(null);
  }, []);

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      // ignore
    }
  }, []);

  const start = useCallback(async () => {
    if (recRef.current || !supported) return;
    setError(null);
    clear();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        try {
          stream.getTracks().forEach((t) => t.stop());
        } catch {
          // ignore
        }
        streamRef.current = null;
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        if (deadRef.current) return; // unmounted: skip state + URL
        setRecording(false);
        try {
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
          chunksRef.current = [];
          if (blob.size > 0) {
            const u = URL.createObjectURL(blob);
            urlRef.current = u;
            setUrl(u);
          } else {
            setError("Nothing recorded — hold the mic longer?");
          }
        } catch {
          setError("Couldn't build the clip — try again");
        }
      };
      rec.onerror = () => {
        if (deadRef.current) return;
        setRecording(false);
        setError("Recording hiccup — try again");
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS) stop();
          return s + 1;
        });
      }, 1000);
    } catch {
      if (deadRef.current) return;
      setRecording(false);
      setError("Mic blocked — allow mic access to record");
    }
  }, [supported, clear, stop]);

  return { supported, recording, seconds, url, error, start, stop, clear };
}
