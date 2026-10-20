"use client";

import { useEffect, useState } from "react";
import { buildPreviewDoc } from "@/lib/dojo-run";
import {
  buildDojoHandoff,
  checkDojo,
  DOJO_LESSONS,
  lessonById,
  loadDojoDone,
  saveDojoDone,
} from "@/lib/learn-dojo";
import type { PracticeTarget } from "@/lib/learn-useit";

/**
 * Code Dojo — learn React from zero with a CodePen-style live preview.
 * Left: lesson brief + editor + goal checks. Right: sandboxed iframe
 * running the learner's App (see lib/dojo-run.ts for the sandbox notes).
 */
export default function DojoPanel({
  onSendToChat,
  onXP,
}: {
  /** Post code into main chat for AI feedback. Absent on /learn. */
  onSendToChat?: (text: string, target?: PracticeTarget) => void;
  /** Award XP for freshly completed checks (TutorPanel owns the store). */
  onXP?: (n: number, note: string) => void;
}) {
  const first = DOJO_LESSONS[0];
  const [lessonId, setLessonId] = useState<string>(first.id);
  const [langFilter, setLangFilter] = useState<"all" | "ts" | "react" | "next">("all");
  const lesson = lessonById(lessonId) ?? first;
  const [code, setCode] = useState<string>(first.starter);
  const [done, setDone] = useState<boolean[]>(() => loadDojoDone(first.id, first.checks.length));
  const [doc, setDoc] = useState<string>(() => buildPreviewDoc(first.starter));
  const [runs, setRuns] = useState(0);

  const pickLesson = (id: string) => {
    const l = lessonById(id);
    if (!l) return;
    setLessonId(l.id);
    setCode(l.starter);
    setDone(loadDojoDone(l.id, l.checks.length));
    setDoc(buildPreviewDoc(l.starter));
  };

  useEffect(() => {
    const t = setTimeout(() => setDoc(buildPreviewDoc(code)), 400);
    return () => clearTimeout(t);
  }, [code]);

  const run = () => {
    setDoc(buildPreviewDoc(code));
    setRuns((r) => r + 1);
    const hits = checkDojo(code, lesson.checks);
    const freshIdx = hits
      .map((h, i) => (h ? i : -1))
      .filter((i) => i >= 0 && !done[i]);
    const next = done.map((d, i) => d || hits[i]);
    setDone(next);
    try {
      saveDojoDone(lesson.id, next);
    } catch {
      // memory is best-effort
    }
    if (freshIdx.length > 0) {
      const labels = freshIdx.map((i) => lesson.checks[i].label).join(", ");
      try {
        onXP?.(5 * freshIdx.length, labels);
      } catch {
        // XP is best-effort
      }
    }
  };

  const cleared = done.filter(Boolean).length;
  const allClear = lesson.checks.length > 0 && cleared === lesson.checks.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {(["all", "ts", "react", "next"] as const).map((lg) => (
          <button
            key={lg}
            className="task-chip"
            onClick={() => setLangFilter(lg)}
            style={langFilter === lg ? { background: "var(--green)", color: "#fff" } : undefined}
          >
            {lg === "all" ? "All" : lg === "ts" ? "TS" : lg === "react" ? "React" : "Next"}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {DOJO_LESSONS.filter((l) => langFilter === "all" || l.lang === langFilter).map((l) => (
          <button
            key={l.id}
            className="task-chip"
            onClick={() => pickLesson(l.id)}
            title={l.title}
            style={l.id === lesson.id ? { outline: "2px solid var(--green)" } : undefined}
          >
            {l.icon} {l.title}
          </button>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "flex-start",
        }}
      >
        <div style={{ flex: "1 1 300px", minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{lesson.brief}</div>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Tab") {
                e.preventDefault();
                const el = e.currentTarget;
                const start = el.selectionStart ?? code.length;
                const end = el.selectionEnd ?? code.length;
                const next = `${code.slice(0, start)}  ${code.slice(end)}`;
                setCode(next);
                requestAnimationFrame(() => {
                  try {
                    el.setSelectionRange(start + 2, start + 2);
                  } catch {
                    // ignore
                  }
                });
              }
            }}
            spellCheck={false}
            rows={12}
            style={{
              width: "100%",
              boxSizing: "border-box",
              fontFamily: "ui-monospace, monospace",
              fontSize: 12,
              lineHeight: 1.5,
              padding: 8,
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text)",
              whiteSpace: "pre",
              overflowX: "auto",
            }}
          />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button className="send-btn secondary" style={{ width: "auto", padding: "4px 12px", height: "auto", fontSize: 12 }} onClick={run} title="Run your code in the preview">
              ▶ Run{runs > 0 ? ` (${runs})` : ""}
            </button>
            <button className="task-chip" onClick={() => setCode(lesson.starter)} title="Back to the starting code">
              ↺ Reset
            </button>
            <button className="task-chip" onClick={() => setCode(lesson.solution)} title="Fill in one working answer">
              👁 Solution
            </button>
            {onSendToChat ? (
              <button
                className="task-chip"
                onClick={() => onSendToChat(buildDojoHandoff(lesson, code))}
                title="Ask Coco in main chat for feedback on this code"
              >
                💬 Ask Coco
              </button>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {lesson.checks.map((c, i) => (
              <span
                key={c.label}
                className="task-chip"
                style={done[i] ? { opacity: 0.75, textDecoration: "line-through" } : undefined}
              >
                {done[i] ? "✓ " : "○ "}{c.label}
              </span>
            ))}
          </div>
          {allClear ? (
            <div style={{ fontSize: 12 }}>
              🏆 Lesson cleared! 💡 Tip: {lesson.tip}
              <div style={{ opacity: 0.7, marginTop: 2 }}>📖 In our app: {lesson.inApp}.</div>
            </div>
          ) : (
            <div style={{ fontSize: 11, opacity: 0.7 }}>📖 In our app: {lesson.inApp}.</div>
          )}
        </div>

        <div style={{ flex: "1 1 260px", minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>👁 Preview <span style={{ fontWeight: 400, opacity: 0.65 }}>(updates on ▶ Run)</span></div>
          <iframe
            title={`Preview: ${lesson.title}`}
            sandbox="allow-scripts"
            srcDoc={doc}
            style={{
              width: "100%",
              height: 340,
              border: "1px solid var(--border)",
              borderRadius: 8,
              background: "#fff",
            }}
          />
          <div style={{ fontSize: 11, opacity: 0.65 }}>
            Sandboxed mini-browser (React 18 · JSX + TS). Red text = a compile or runtime error — read it, fix, Run again.
          </div>
        </div>
      </div>
    </div>
  );
}
