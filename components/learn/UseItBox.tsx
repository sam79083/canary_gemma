"use client";

import { useState } from "react";
import {
  STARTERS,
  USEIT_DRAFT_KEY,
  buildHandoffMessage,
  buildUseItPrompt,
  type PracticeTarget,
} from "@/lib/learn-useit";
import { awardXP, dayStr, gateBonusOnce, loadLearn, saveLearn, type BonusGates } from "@/lib/learn-store";
import { useLanguage } from "@/hooks/useLanguage";

export interface UseItBridge {
  onAskAI?: (prompt: string) => Promise<string | null>;
  modelReady: boolean;
  /** Post into main chat (+ register practice target). Absent on /learn. */
  onSendToChat?: (text: string, target?: PracticeTarget) => void;
}

/**
 * A+E in one box: type a sentence with the fresh word (starter chips help),
 * get an inline AI verdict, or throw it into main chat for conversation.
 * Self-contained state; key it by item id when reused in a quiz flow.
 */
export default function UseItBox({
  term,
  meaning,
  example,
  placeholder,
  compact,
  bridge,
}: {
  term: string;
  meaning: string;
  example?: string;
  placeholder?: string;
  compact?: boolean;
  bridge: UseItBridge;
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
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [chipsOpen, setChipsOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  /** +2 XP once per calendar day per term — repeat drafts are practice, not payment. */
  const bonusXp = (): boolean => {
    let fresh = true;
    try {
      const today = dayStr(new Date());
      const raw = localStorage.getItem("canary-xp-gates");
      const gates = raw ? (JSON.parse(raw) as BonusGates) : {};
      const res = gateBonusOnce(gates, today, `useit:${term.toLowerCase()}`);
      fresh = res.fresh;
      if (res.fresh) localStorage.setItem("canary-xp-gates", JSON.stringify(res.next));
    } catch {
      // storage blocked — award anyway
    }
    if (fresh) {
      try {
        saveLearn(awardXP(loadLearn(), 2, dayStr(new Date())));
      } catch {
        // XP is best-effort
      }
    }
    return fresh;
  };

  const submitInline = () => {
    if (!text.trim() || busy) return;
    setNote(null);
    if (!bridge.modelReady || !bridge.onAskAI) {
      const paid = bonusXp();
      setAnswer(
        t("lnUseItNoAi", { xp: paid ? " +2 XP ✍️" : "" })
      );
      return;
    }
    setBusy(true);
    setAnswer(null);
    void bridge
      .onAskAI(buildUseItPrompt(term, meaning, example ?? "", text))
      .then((out) => {
        if (out && out.trim()) setAnswer(out.trim().slice(0, 1500));
        else setAnswer("AI hiccup — your sentence is saved above; try again ✨");
        bonusXp();
      })
      .catch(() => setAnswer(L("lnAiHiccup", "AI hiccup — your sentence is saved above; try again ✨")))
      .finally(() => setBusy(false));
  };

  const sendToChat = () => {
    const msg = buildHandoffMessage(term, meaning, text);
    if (bridge.onSendToChat) {
      bridge.onSendToChat(msg, { term, meaning });
      return;
    }
    // /learn room has no composer: stash a draft like the essay flow.
    try {
      localStorage.setItem(USEIT_DRAFT_KEY, msg);
    } catch {
      // ignore
    }
    setNote(L("lnSavedToComposer", "Saved — open Chat and it lands in your composer 💬"));
  };

  const insertChip = (chip: string) => {
    setText((prev) => (prev.trim() ? `${prev.trimEnd()} ${chip}` : chip));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: compact ? 12 : 13, fontWeight: 700 }}>
        🗣️ {L("lnUseNow", "Use")} <i>"{term}"</i> {L("lnRightNow", "right now:")} 
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setAnswer(null);
            setNote(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitInline();
          }}
          placeholder={placeholder ?? L("lnExamplePh", `e.g. I used "${term}" when…`)}
          style={{
            flex: 1, minWidth: 0, padding: "8px 10px", borderRadius: 6,
            border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)",
          }}
        />
        <button className="sidebar-btn small" onClick={submitInline} disabled={busy || !text.trim()}>
          {busy ? "…" : L("lnGo", "Go!")}
        </button>
        <button
          className="sidebar-btn small"
          onClick={sendToChat}
          style={{ width: "auto" }}
          title={bridge.onSendToChat ? L("lnContinueChat", "Continue in main chat") : L("lnSaveChat", "Save for main chat")}
        >
          💬
        </button>
        <button
          className="sidebar-btn small"
          onClick={() => setChipsOpen((v) => !v)}
          style={{ width: "auto" }}
          title={L("lnStartersTitle", "Sentence starters")}
        >
          🧩
        </button>
      </div>
      {chipsOpen ? (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <button
            className="sidebar-btn small"
            style={{ width: "auto", fontSize: 12 }}
            onClick={() => insertChip(`"${term}"`)}
            title={L("lnInsertTarget", "Insert the target expression")}
          >
            ＋"{term.length > 18 ? term.slice(0, 18) + "…" : term}"
          </button>
          {STARTERS.map((s) => (
            <button
              key={s}
              className="sidebar-btn small"
              style={{ width: "auto", fontSize: 12 }}
              onClick={() => insertChip(s)}
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}
      {answer ? (
        <div style={{ fontSize: 13, whiteSpace: "pre-wrap", background: "var(--border)", borderRadius: 6, padding: 8 }}>
          🤖 {answer}
        </div>
      ) : null}
      {note ? <div style={{ fontSize: 12, opacity: 0.8 }}>{note}</div> : null}
    </div>
  );
}
