"use client";

import { useEffect, useRef, useState } from "react";
import { gradeChoice, gradeFill, type BankItem } from "@/lib/learn-bank";
import type { AnswerResult, CardGrade } from "@/lib/learn-store";
import type { UseItBridge } from "./UseItBox";
import UseItBox from "./UseItBox";
import { useLanguage } from "@/hooks/useLanguage";

/** Use-it-now for answered vocab questions (no spoilers: only after check).
 * Derives term/meaning from the item itself: word key + correct choice. */
function QuizUseIt({ item, bridge }: { item: BankItem; bridge: UseItBridge }) {
  if (item.skill !== "vocab" || item.kind !== "choice" || !item.word) return null;
  const term = item.word.replace(/^(gen|spell|ai|idiom):/, "");
  if (!/^[a-z][a-z '\-]{1,60}$/i.test(term)) return null;
  if (item.word.startsWith("ai:") || item.word.startsWith("idiom:")) return null;
  const choices = item.choices ?? [];
  const meaning =
    item.answerIndex !== undefined && choices[item.answerIndex] ? choices[item.answerIndex] : null;
  if (!meaning) return null;
  return (
    <UseItBox
      key={item.id}
      term={term}
      meaning={meaning}
      compact
      bridge={bridge}
    />
  );
}

/** Shared interactive quiz card: choice + fill, instant feedback, XP tally. */
export default function QuizCard({
  items,
  onDone,
  cta,
  useIt,
  srsGrades,
}: {
  items: BankItem[];
  onDone: (results: AnswerResult[]) => void;
  cta: string;
  /** When set, answered vocab questions offer inline use-it-now practice. */
  useIt?: UseItBridge | null;
  /** Review mode: after a correct answer, let the learner self-rate
   *  Hard/Good/Easy (feeds the SM-2 scheduler). Wrong answers are "again". */
  srsGrades?: boolean;
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
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState<null | boolean>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const [results, setResults] = useState<AnswerResult[]>([]);
  const [grade, setGradeState] = useState<CardGrade>(2);
  /** Self-rating updates the just-answered result (default good). */
  const setGrade = (g: CardGrade) => {
    setGradeState(g);
    setResults((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      next[next.length - 1] = { ...next[next.length - 1], grade: g };
      return next;
    });
  };
  // Anti-farm: ↻ Retry replays for learning, but Done records XP only for
  // the first completion of this mounted set.
  const countedRef = useRef(false);
  const item = items[idx];
  const done = idx >= items.length;

  useEffect(() => {
    setPicked(null);
    setTyped("");
    setChecked(null);
    setHintOpen(false);
    setGradeState(2);
  }, [idx]);

  if (items.length === 0) return <p>{L("lnNoQuestions", "No questions.")}</p>;
  if (done) {
    const correct = results.filter((r) => r.correct).length;
    const perfect = correct === results.length && results.length > 0;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={{ fontSize: 16, fontWeight: 700 }}>
          {perfect ? t("lnPerfect") : correct >= results.length / 2 ? t("lnWellDone") : t("lnGoodEffort")} ✅ {correct} / {results.length} · +
          {results.reduce((a, r) => a + (r.correct ? 10 : 2), 0)} XP
        </p>
        <button data-testid="quiz-done" className="sidebar-btn primary" onClick={() => {
          if (countedRef.current) {
            // Replay after ↻ Retry: show the tally, record nothing twice.
            onDone([]);
            return;
          }
          countedRef.current = true;
          onDone(results);
        }}>
          {cta}
        </button>
        <button className="sidebar-btn small" onClick={() => { setIdx(0); setResults([]); }}>
          ↻ {L("lnRetry", "Retry")}
        </button>
      </div>
    );
  }

  const checkChoice = (p: number) => {
    if (checked !== null) return;
    const ok = gradeChoice(p, item.answerIndex ?? -1);
    setPicked(p);
    setChecked(ok);
    setResults((prev) => [...prev, { item, correct: ok }]);
  };
  const checkFill = () => {
    if (checked !== null) return;
    const ok = gradeFill(typed, item.accept ?? []);
    setChecked(ok);
    setResults((prev) => [...prev, { item, correct: ok }]);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>
        Q{idx + 1}/{items.length} · {item.skill} · {item.level}
      </div>
      {item.passage ? (
        <div
          style={{
            fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap",
            background: "var(--model-bar-bg, var(--border))",
            border: "1px solid var(--border)", borderRadius: 8, padding: 10,
            maxHeight: 220, overflowY: "auto",
          }}
        >
          {item.passage}
        </div>
      ) : null}
      <div style={{ fontSize: 17, fontWeight: 700 }} data-testid="quiz-prompt">{item.prompt}</div>
      {item.hint ? (
        <div>
          <button
            className="sidebar-btn small"
            style={{ width: "auto", fontSize: 12 }}
            onClick={() => setHintOpen((v) => !v)}
            title={L("lnHintTitle", "Show a hint (no XP penalty)")}
          >
            {hintOpen ? `💡 ${item.hint}` : L("lnHintQ", "💡 Hint?")}
          </button>
        </div>
      ) : null}
      {item.kind === "choice" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(item.choices ?? []).map((c, i) => (
            <button
              key={i}
              data-testid="quiz-choice"
              className={`sidebar-btn small${picked === i ? " secondary" : ""}`}
              onClick={() => checkChoice(i)}
              disabled={checked !== null}
              style={{
                textAlign: "left",
                // 44px+ touch target for phones (was ~32px).
                padding: "12px",
                minHeight: 44,
                fontSize: 15,
                borderColor:
                  checked !== null && i === item.answerIndex ? "var(--green)" : undefined,
              }}
            >
              {c}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6 }}>
          <input
            data-testid="quiz-fill"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") checkFill(); }}
            placeholder={L("lnTypeMissing", "Type the missing word…")}
            disabled={checked !== null}
            // 16px stops iOS auto-zoom on focus.
            style={{ flex: 1, minWidth: 0, padding: "10px 12px", fontSize: 16, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
          />
          <button data-testid="quiz-check" className="sidebar-btn small" onClick={checkFill} disabled={checked !== null}>
            {L("lnCheck", "Check")}
          </button>
        </div>
      )}
      {checked !== null ? (
        <div style={{ fontSize: 13, background: "var(--border)", borderRadius: 6, padding: 8 }}>
          {checked ? t("lnPraise" + (1 + (idx % 5))) : t("lnNudge" + (1 + (idx % 3)))} — {item.explain}
          {srsGrades && checked ? (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>
                {L("lnSrsQ", "How did that feel? (sets the next review)")}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(
                  [
                    [1, t("lnSrsHard")],
                    [2, t("lnSrsGood")],
                    [3, t("lnSrsEasy")],
                  ] as const
                ).map(([g, label]) => (
                  <button
                    key={g}
                    data-testid={`srs-grade-${g}`}
                    className={`sidebar-btn small${grade === g ? " secondary" : ""}`}
                    style={{ width: "auto" }}
                    onClick={() => setGrade(g)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div style={{ marginTop: 8 }}>
            <button data-testid="quiz-next" className="sidebar-btn small primary" onClick={() => setIdx((v) => v + 1)}>
              {idx + 1 === items.length ? L("lnSeeResult", "See result →") : L("lnNextBtn", "Next →")}
            </button>
          </div>
        </div>
      ) : null}
      {checked !== null && useIt ? <QuizUseIt item={item} bridge={useIt} /> : null}
    </div>
  );
}
