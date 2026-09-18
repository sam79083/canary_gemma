"use client";

import type { TFn } from "@/lib/i18n";
import type { Plan } from "@/lib/agent";

export type PlanVerdict = "approved" | "bare" | "cancel";

/**
 * Plain-language icon per step so non-programmers get the plan at a
 * glance (models often echo tool names like "mkdir" as the action).
 */
function stepIcon(action: string): string {
  const a = action.toLowerCase();
  if (/(mkdir|make dir|create (the )?folder|폴더 만|디렉터|디렉토리)/.test(a)) return "📁";
  if (/(delete|remove|trash|삭제|지우)/.test(a)) return "🗑️";
  if (/(read|open|load|읽|열어|확인)/.test(a)) return "📖";
  if (/(list|look|browse|목록|보여|조회)/.test(a)) return "👀";
  return "📄";
}

/**
 * Plan approval card: the model drafts, the user disposes. Same
 * plain-element modal pattern as ReviewCard (overlay + Esc-style cancel).
 */
export default function PlanCard({
  plan,
  t,
  onSettle,
}: {
  plan: Plan;
  t: TFn;
  onSettle: (verdict: PlanVerdict) => void;
}) {
  return (
    <div className="review-overlay" id="plan-overlay">
      <div className="review-card">
        <h3>{t("plTitle")}</h3>
        <div className="review-path">🎯 {plan.goal}</div>
        <ol style={{ fontSize: 13, lineHeight: 1.6, paddingLeft: 20, margin: "8px 0" }}>
          {plan.steps.map((s, i) => (
            <li key={i}>
              {stepIcon(s.action)} {s.action}
              {s.path ? (
                <span style={{ opacity: 0.7 }}> — {s.path}</span>
              ) : null}
            </li>
          ))}
        </ol>
        <div className="review-note">{t("plHint")}</div>
        <div className="review-actions" style={{ marginTop: 12 }}>
          <button className="editor-btn" onClick={() => onSettle("cancel")}>
            {t("trCancel")}
          </button>
          <button
            className="editor-btn"
            onClick={() => onSettle("bare")}
            title={t("plNoPlan")}
          >
            {t("plNoPlan")}
          </button>
          <button
            className="editor-btn primary"
            onClick={() => onSettle("approved")}
            autoFocus
          >
            {t("plApprove")}
          </button>
        </div>
      </div>
    </div>
  );
}
