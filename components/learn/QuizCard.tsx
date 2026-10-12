"use client";

import { useEffect, useState } from "react";
import { gradeChoice, gradeFill, type BankItem } from "@/lib/learn-bank";
import type { AnswerResult } from "@/lib/learn-store";
import type { UseItBridge } from "./UseItBox";
import UseItBox from "./UseItBox";

const PRAISE = ["Nice! 🔥", "Brilliant! ✨", "You got it! 🎉", "Smooth! 😎", "Exactly! 💯"];
const NUDGE = ["So close! 💪", "Almost — next one! 🍀", "Good try — peek below 👇"];

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
}: {
  items: BankItem[];
  onDone: (results: AnswerResult[]) => void;
  cta: string;
  /** When set, answered vocab questions offer inline use-it-now practice. */
  useIt?: UseItBridge | null;
}) {
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState<null | boolean>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const [results, setResults] = useState<AnswerResult[]>([]);
  const item = items[idx];
  const done = idx >= items.length;

  useEffect(() => {
    setPicked(null);
    setTyped("");
    setChecked(null);
    setHintOpen(false);
  }, [idx]);

  if (items.length === 0) return <p>No questions.</p>;
  if (done) {
    const correct = results.filter((r) => r.correct).length;
    const perfect = correct === results.length && results.length > 0;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={{ fontSize: 16, fontWeight: 700 }}>
          {perfect ? "🌟 PERFECT! " : correct >= results.length / 2 ? "🎉 Well done! " : "💪 Good effort! "}✅ {correct} / {results.length} · +
          {results.reduce((a, r) => a + (r.correct ? 10 : 2), 0)} XP
        </p>
        <button className="sidebar-btn primary" onClick={() => onDone(results)}>
          {cta}
        </button>
        <button className="sidebar-btn small" onClick={() => { setIdx(0); setResults([]); }}>
          ↻ Retry
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
      <div style={{ fontSize: 17, fontWeight: 700 }}>{item.prompt}</div>
      {item.hint ? (
        <div>
          <button
            className="sidebar-btn small"
            style={{ width: "auto", fontSize: 12 }}
            onClick={() => setHintOpen((v) => !v)}
            title="Show a hint (no XP penalty)"
          >
            {hintOpen ? `💡 ${item.hint}` : "💡 Hint?"}
          </button>
        </div>
      ) : null}
      {item.kind === "choice" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(item.choices ?? []).map((c, i) => (
            <button
              key={i}
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
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") checkFill(); }}
            placeholder="Type the missing word…"
            disabled={checked !== null}
            // 16px stops iOS auto-zoom on focus.
            style={{ flex: 1, minWidth: 0, padding: "10px 12px", fontSize: 16, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
          />
          <button className="sidebar-btn small" onClick={checkFill} disabled={checked !== null}>
            Check
          </button>
        </div>
      )}
      {checked !== null ? (
        <div style={{ fontSize: 13, background: "var(--border)", borderRadius: 6, padding: 8 }}>
          {checked ? PRAISE[idx % PRAISE.length] : NUDGE[idx % NUDGE.length]} — {item.explain}
          <div style={{ marginTop: 8 }}>
            <button className="sidebar-btn small primary" onClick={() => setIdx((v) => v + 1)}>
              {idx + 1 === items.length ? "See result →" : "Next →"}
            </button>
          </div>
        </div>
      ) : null}
      {checked !== null && useIt ? <QuizUseIt item={item} bridge={useIt} /> : null}
    </div>
  );
}
