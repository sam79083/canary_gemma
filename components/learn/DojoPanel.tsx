"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { buildPreviewDoc } from "@/lib/dojo-run";
import {
  buildDojoHandoff,
  checkDojo,
  DOJO_LESSONS,
  lessonById,
  loadDojoDone,
  loadDojoDraft,
  saveDojoDone,
  saveDojoDraft,
} from "@/lib/learn-dojo";
import { dojoGraduationClaimed, recordDojoGraduation } from "@/lib/learn-portfolio";
import type { PracticeTarget } from "@/lib/learn-useit";
import { useLanguage } from "@/hooks/useLanguage";

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
  const { t } = useLanguage();
  const L = (key: string, fallback: string) => {
    try {
      const s = t(key);
      return s === key ? fallback : s;
    } catch {
      return fallback;
    }
  };
  const first = DOJO_LESSONS[0];
  const [lessonId, setLessonId] = useState<string>(first.id);
  const [langFilter, setLangFilter] = useState<"all" | "ts" | "react" | "next">("all");
  const lesson = lessonById(lessonId) ?? first;
  const [code, setCode] = useState<string>(() => loadDojoDraft(first.id, first.starter));
  const [done, setDone] = useState<boolean[]>(() => loadDojoDone(first.id, first.checks.length));
  const [doc, setDoc] = useState<string>(() => buildPreviewDoc(loadDojoDraft(first.id, first.starter)));
  const [runs, setRuns] = useState(0);
  /** One-level undo for Reset / Solution — never eats typed work silently. */
  const [undoCode, setUndoCode] = useState<string | null>(null);
  const [doneVersion, setDoneVersion] = useState(0);
  const [gradClaimed, setGradClaimed] = useState(() => dojoGraduationClaimed());

  const pickLesson = (id: string) => {
    const l = lessonById(id);
    if (!l) return;
    const draft = loadDojoDraft(l.id, l.starter);
    setLessonId(l.id);
    setCode(draft);
    setDone(loadDojoDone(l.id, l.checks.length));
    setDoc(buildPreviewDoc(draft));
    setUndoCode(null);
  };

  useEffect(() => {
    const t = setTimeout(() => {
      setDoc(buildPreviewDoc(code));
      saveDojoDraft(lessonId, code);
    }, 400);
    return () => clearTimeout(t);
  }, [code, lessonId]);

  const run = () => {
    setDoc(buildPreviewDoc(code));
    setRuns((r) => r + 1);
    const hits = checkDojo(code, lesson.checks);
    const freshIdx = hits
      .map((h, i) => (h ? i : -1))
      .filter((i) => i >= 0 && !done[i]);
    const next = done.map((d, i) => d || hits[i]);
    setDone(next);
    setDoneVersion((v) => v + 1);
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

  /** Per-lesson completion map for chips + progress header (re-read on run). */
  const doneMap = useMemo(
    () => new Map(DOJO_LESSONS.map((l) => [l.id, loadDojoDone(l.id, l.checks.length).every(Boolean)])),
    [doneVersion],
  );
  const clearedLessons = useMemo(
    () => DOJO_LESSONS.filter((l) => doneMap.get(l.id)).length,
    [doneMap],
  );
  const clearedChecks = useMemo(() => {
    let n = 0;
    for (const l of DOJO_LESSONS) n += loadDojoDone(l.id, l.checks.length).filter(Boolean).length;
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneVersion]);
  const totalChecks = useMemo(() => DOJO_LESSONS.reduce((a, l) => a + l.checks.length, 0), []);
  const allLessonsCleared = clearedLessons === DOJO_LESSONS.length;
  const nextUncleared = useMemo(
    () => DOJO_LESSONS.find((l) => !doneMap.get(l.id)) ?? null,
    [doneMap],
  );

  const claimGraduation = () => {
    try {
      const saved = recordDojoGraduation(DOJO_LESSONS.map((l) => l.title));
      setGradClaimed(true);
      if (saved) {
        try {
          onXP?.(50, L("lnDojoGrad", "Code Dojo graduate"));
        } catch {
          // XP is best-effort
        }
        toast.success(L("lnDojoGradToast", "🎓 Code Dojo certificate saved to your portfolio"));
      } else {
        toast(L("lnDojoGradAlready", "Certificate already saved"));
      }
    } catch {
      toast.error(L("lnDojoGradFailed", "Could not save the certificate — try again"));
    }
  };

  const cleared = done.filter(Boolean).length;
  const allClear = lesson.checks.length > 0 && cleared === lesson.checks.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, opacity: 0.9 }}>
        <span style={{ whiteSpace: "nowrap" }}>
          🏁 {clearedLessons}/{DOJO_LESSONS.length} {L("lnDojoCleared", "lessons cleared")} · {clearedChecks}/{totalChecks} {L("lnDojoChecks", "checks")}
        </span>
        <div style={{ flex: 1, height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
          <div
            style={{
              width: `${(clearedChecks / Math.max(1, totalChecks)) * 100}%`,
              height: "100%",
              background: "var(--green)",
              transition: "width .4s",
            }}
          />
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {(["all", "ts", "react", "next"] as const).map((lg) => (
          <button
            key={lg}
            className="task-chip"
            onClick={() => setLangFilter(lg)}
            style={langFilter === lg ? { background: "var(--green)", color: "#fff" } : undefined}
          >
            {lg === "all" ? L("lnAll", "All") : lg === "ts" ? L("lnTS", "TS") : lg === "react" ? L("lnReact", "React") : L("lnNext", "Next")}
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
            {l.icon} {doneMap.get(l.id) ? "✓ " : ""}{l.title}
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
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                run();
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
            <button className="send-btn secondary" style={{ width: "auto", padding: "4px 12px", height: "auto", fontSize: 12 }} onClick={run} title={L("lnRunCode", "Run your code in the preview (Ctrl/Cmd+Enter)")}>
              ▶ {L("lnRun", "Run")}{runs > 0 ? ` (${runs})` : ""}
            </button>
            <button className="task-chip" onClick={() => { setUndoCode(code); setCode(lesson.starter); }} title={L("lnBackToStart", "Back to the starting code (undo restores your draft)")}>
              ↺ {L("lnReset", "Reset")}
            </button>
            <button className="task-chip" onClick={() => { setUndoCode(code); setCode(lesson.solution); }} title={L("lnFillAnswer", "Fill in one working answer (undo restores your draft)")}>
              👁 {L("lnSolution", "Solution")}
            </button>
            {undoCode !== null ? (
              <button className="task-chip" onClick={() => { setCode(undoCode); setUndoCode(null); }} title={L("lnUndoApply", "Bring back the code you had before Reset / Solution")}>
                ↩ {L("lnUndo", "Undo")}
              </button>
            ) : null}
            {onSendToChat ? (
              <button
                className="task-chip"
                onClick={() => onSendToChat(buildDojoHandoff(lesson, code))}
                title={L("lnAskCoco", "Ask Coco in main chat for feedback on this code — knows which checks pass")}
              >
                💬 {L("lnAskCocoBtn", "Ask Coco")}
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
              {t("lnLessonCleared", { tip: lesson.tip })}
              <div style={{ opacity: 0.7, marginTop: 2 }}>{t("lnInOurApp", { app: lesson.inApp })}</div>
              {nextUncleared ? (
                <button
                  className="sidebar-btn small primary"
                  style={{ width: "auto", marginTop: 6 }}
                  onClick={() => pickLesson(nextUncleared.id)}
                >
                  {L("lnNextLesson", "Next lesson")}: {nextUncleared.icon} {nextUncleared.title} →
                </button>
              ) : null}
            </div>
          ) : (
            <div style={{ fontSize: 11, opacity: 0.7 }}>{t("lnInOurApp", { app: lesson.inApp })}</div>
          )}
        </div>

        <div style={{ flex: "1 1 260px", minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>👁 {L("lnPreview", "Preview")} <span style={{ fontWeight: 400, opacity: 0.65 }}>({L("lnUpdatesOnRun", "updates on ▶ Run")})</span></div>
          <iframe
            title={`${L("lnPreview", "Preview")}: ${lesson.title}`}
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
            {L("lnSandboxNote", "Sandboxed mini-browser (React 18 · JSX + TS). Red text = a compile or runtime error — read it, fix, Run again. Ctrl/Cmd+Enter runs.")}
          </div>
        </div>
      </div>

      {allLessonsCleared ? (
        <div
          style={{
            border: "2px solid var(--green)",
            borderRadius: 10,
            padding: 12,
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: 22 }}>🎓</div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>
            {gradClaimed
              ? L("lnDojoGradDone", "Code Dojo graduate — certificate saved to your portfolio")
              : L("lnDojoGradTitle", "Every Code Dojo lesson cleared!")}
          </div>
          {!gradClaimed ? (
            <button className="sidebar-btn small primary" style={{ width: "auto" }} onClick={claimGraduation}>
              {L("lnDojoGrad", "🎓 Claim your Code Dojo certificate →")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
