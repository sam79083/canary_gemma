"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  IELTS_TASKS,
  countIeltsWords,
  estimateIeltsBand,
  ieltsTaskById,
  type IeltTask,
  type IeltsEstimate,
} from "@/lib/learn-ielts";
import type { CEFR } from "@/lib/learn-bank";

const DRAFT_KEY = "canary-ielts-draft-v1";
const EXAM_SECONDS = 40 * 60;

interface Draft {
  taskId: string;
  text: string;
}

function loadDraft(): Draft {
  try {
    if (typeof localStorage === "undefined") return { taskId: IELTS_TASKS[0].id, text: "" };
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null") as Partial<Draft> | null;
    return {
      taskId: ieltsTaskById(raw?.taskId) ? (raw!.taskId as string) : IELTS_TASKS[0].id,
      text: typeof raw?.text === "string" ? raw.text.slice(0, 20_000) : "",
    };
  } catch {
    return { taskId: IELTS_TASKS[0].id, text: "" };
  }
}

function mmss(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Mock IELTS Task 2: real 40-minute conditions available on request, then a
 * private band estimate from text stats (no API, no account). Saving the essay
 * puts it in the portfolio and (once a day) pays XP.
 */
export default function IeltsBox({
  level,
  onSave,
  onSpeak,
}: {
  level: CEFR | null;
  /** Saves to the portfolio; returns true when +3 XP was newly paid today. */
  onSave: (title: string, body: string, meta: string) => boolean;
  onSpeak: (text: string, rate?: number) => void;
}) {
  const initial = useRef<Draft | null>(null);
  if (initial.current === null) initial.current = loadDraft();
  const [taskId, setTaskId] = useState(initial.current.taskId);
  const [text, setText] = useState(initial.current.text);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [estimate, setEstimate] = useState<IeltsEstimate | null>(null);
  const [saved, setSaved] = useState(false);

  const task: IeltTask = useMemo(() => ieltsTaskById(taskId) ?? IELTS_TASKS[0], [taskId]);
  const words = countIeltsWords(text);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ taskId, text: text.slice(0, 20_000) }));
    } catch {
      // best-effort
    }
  }, [taskId, text]);

  useEffect(() => {
    if (startedAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const elapsed = startedAt === null ? 0 : Math.floor((now - startedAt) / 1000);
  const remaining = Math.max(0, EXAM_SECONDS - elapsed);
  const timeUp = startedAt !== null && remaining === 0;

  const runEstimate = () => {
    setEstimate(estimateIeltsBand(text));
    setSaved(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {IELTS_TASKS.map((t) => (
          <button
            key={t.id}
            className={`sidebar-btn small${t.id === task.id ? " secondary" : ""}`}
            style={{ width: "auto", fontSize: 12 }}
            title={t.ko}
            onClick={() => {
              setTaskId(t.id);
              setStartedAt(null);
              setEstimate(null);
              setSaved(false);
            }}
          >
            {t.icon} {t.category}
          </button>
        ))}
      </div>

      <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
          <b style={{ fontSize: 14 }}>{task.icon} Task 2 — {task.category}</b>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11, opacity: 0.6 }}>40 min · 250+ words</span>
        </div>
        <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.45 }}>{task.prompt}</p>
        <p style={{ margin: "4px 0 0", fontSize: 12, opacity: 0.75 }}>{task.ko}</p>
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          <button
            className="sidebar-btn small"
            style={{ width: "auto", fontSize: 11 }}
            onClick={() => onSpeak(task.prompt)}
          >
            🔊 Hear prompt
          </button>
          {startedAt === null ? (
            <button
              className="sidebar-btn small"
              style={{ width: "auto", fontSize: 11 }}
              onClick={() => {
                setStartedAt(Date.now());
                setNow(Date.now());
                setEstimate(null);
                setSaved(false);
              }}
            >
              ⏱️ Start 40-min timer
            </button>
          ) : (
            <>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  alignSelf: "center",
                  color: timeUp ? "#e05252" : remaining < 5 * 60 ? "#d68a00" : "inherit",
                }}
              >
                {timeUp ? "⏰ Time's up" : `⏱️ ${mmss(remaining)} left`}
              </span>
              <button
                className="sidebar-btn small"
                style={{ width: "auto", fontSize: 11 }}
                onClick={() => {
                  setStartedAt(null);
                  setEstimate(null);
                }}
              >
                ↺ Reset timer
              </button>
            </>
          )}
        </div>
      </div>

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        placeholder="Write your answer here. Plan for 3–4 paragraphs: position → reason → counter-argument → conclusion…"
        rows={12}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: 10,
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--bg)",
          color: "var(--text)",
          fontSize: 14,
          lineHeight: 1.6,
          resize: "vertical",
        }}
      />

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, opacity: 0.75 }}>
          {words} word{words === 1 ? "" : "s"}
          {words > 0 && words < 250 ? ` · ${250 - words} to target` : words >= 250 ? " · target reached ✓" : ""}
        </span>
        <span style={{ flex: 1 }} />
        <button
          className="sidebar-btn small"
          style={{ width: "auto", fontSize: 12 }}
          disabled={words < 40}
          title={words < 40 ? "Write at least 40 words first" : "Estimate from text stats"}
          onClick={runEstimate}
        >
          📊 Estimate band
        </button>
        <button
          className="sidebar-btn small primary"
          style={{ width: "auto", fontSize: 12 }}
          disabled={words < 40 || saved}
          onClick={() => {
            if (!estimate) runEstimate();
            const body = text.trim().slice(0, 4000);
            const est = estimate ?? estimateIeltsBand(text);
            const title = `${task.category}: ${task.prompt.slice(0, 60)}${task.prompt.length > 60 ? "…" : ""}`;
            const meta = `${task.category} · practice band ${est.band} · ${est.words} words · level ${level ?? "?"}`;
            setEstimate(est);
            onSave(title, body, meta);
            setSaved(true);
          }}
        >
          {saved ? "✓ Saved to portfolio" : "💼 Save to portfolio"}
        </button>
      </div>
      <div style={{ fontSize: 11, opacity: 0.6 }}>
        Draft auto-saves in this browser. Saving to the portfolio pays +3 XP once a day.
      </div>

      {estimate ? (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <span style={{ fontSize: 26, fontWeight: 900, color: "var(--green)" }}>{estimate.band.toFixed(1)}</span>
            <span style={{ fontSize: 12, opacity: 0.7 }}>practice band</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11, opacity: 0.6 }}>
              {estimate.words} words · {estimate.paragraphs} paragraph{estimate.paragraphs === 1 ? "" : "s"} ·{" "}
              {estimate.errors} pattern{estimate.errors === 1 ? "" : "s"} flagged
            </span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>{estimate.verdict}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {estimate.criteria.map((c) => (
              <div key={c.name}>
                <div style={{ display: "flex", fontSize: 12, fontWeight: 700 }}>
                  <span style={{ flex: 1 }}>{c.name}</span>
                  <span>{c.score.toFixed(1)}</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "var(--border)", marginTop: 3, overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${(c.score / 9) * 100}%`,
                      height: "100%",
                      background: "var(--green)",
                      borderRadius: 3,
                    }}
                  />
                </div>
                <div style={{ fontSize: 11, opacity: 0.75, marginTop: 3 }}>{c.note}</div>
              </div>
            ))}
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 11, opacity: 0.6 }}>
            Practice estimate from length, structure, vocabulary variety and common error patterns — not an
            examiner. Save it to your portfolio and ask a tutor (or Chat) for human feedback.
          </p>
        </div>
      ) : null}

      <details style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 8 }}>
        <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 800 }}>💡 How to score higher</summary>
        <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12, lineHeight: 1.5 }}>
          {task.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
          <li>Answer the exact question — a memorized essay loses Task Response marks.</li>
          <li>One idea per paragraph, with a concrete example, beats a list of opinions.</li>
        </ul>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <button
            className="sidebar-btn small"
            style={{ width: "auto", fontSize: 11 }}
            onClick={() => onSpeak(text)}
            disabled={!text.trim()}
          >
            🔊 Hear my essay
          </button>
        </div>
      </details>
    </div>
  );
}
