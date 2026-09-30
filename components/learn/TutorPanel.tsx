"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import Confetti from "@/components/Confetti";
import QuizCard from "@/components/learn/QuizCard";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import {
  chooseState,
  fetchRemote,
  loadMetaSavedAt,
  pushRemote,
  saveMetaSavedAt,
} from "@/lib/learn-store";
import { buildDailyLesson } from "@/lib/learn-bank";
import type { CEFR } from "@/lib/learn-bank";
import { CEFR_ORDER } from "@/lib/learn-bank";
import {
  IDIOMS,
  nextLocked,
  pickOfDay,
  tryCheck,
  unlockedFor,
} from "@/lib/learn-idioms";
import {
  dayStr,
  emptyState,
  leechWords,
  loadLearn,
  recordAnswers,
  saveLearn,
  setLevel,
  type AnswerResult,
  type LearnState,
} from "@/lib/learn-store";
import { loadSeen, markSeen } from "@/lib/learn-seen";
import { unlockAch } from "@/lib/achievements";

type PTab = "quiz" | "idiom" | "me";

function rank(l: CEFR): number {
  return (["A1", "A2", "B1", "B2", "C1", "C2"] as CEFR[]).indexOf(l);
}

const GREETS = [
  "Hey hey! Ready to play with English? 🦜",
  "Coco's here! Small steps, big English! 🌟",
  "Psst… today's idiom is a good one. 😏",
  "Let's make English fun today! 🎈",
];

const WIN_LINES = [
  "Naah, you sound like a native! 🔥",
  "YES! That's exactly how natives use it! 🎉",
  "Smooth! Put that one in your pocket. 😎",
];

const FUN_KEY = "canary-learn-fun";

function loadFun(): { tryWins: number; celebrated: CEFR | null } {
  try {
    const raw = localStorage.getItem(FUN_KEY);
    if (!raw) return { tryWins: 0, celebrated: null };
    const p = JSON.parse(raw) as { tryWins?: unknown; celebrated?: unknown };
    return {
      tryWins: typeof p.tryWins === "number" ? p.tryWins : 0,
      celebrated:
        p.celebrated === "A1" ||
        p.celebrated === "A2" ||
        p.celebrated === "B1" ||
        p.celebrated === "B2" ||
        p.celebrated === "C1" ||
        p.celebrated === "C2"
          ? p.celebrated
          : null,
    };
  } catch {
    return { tryWins: 0, celebrated: null };
  }
}

function saveFun(f: { tryWins: number; celebrated: CEFR | null }): void {
  try {
    localStorage.setItem(FUN_KEY, JSON.stringify(f));
  } catch {
    // best-effort
  }
}

/** 🦜 Coco — the in-chat English buddy. Same progress as /learn, zero tokens. */
export default function TutorPanel({ onClose }: { onClose: () => void }) {
  const { lang, t } = useLanguage();
  const auth = useAuth();
  const member = auth.user !== null;
  const L = (key: string, fallback: string) => {
    try {
      const s = t(key);
      return s === key ? fallback : s;
    } catch {
      return fallback;
    }
  };
  const [tab, setTab] = useState<PTab>("quiz");
  const [state, setState] = useState<LearnState>(() => emptyState());
  const [hydrated, setHydrated] = useState(false);
  const [quizKey, setQuizKey] = useState(0);
  const [burstKey, setBurstKey] = useState(0);
  const [cloudState, setCloudState] = useState<"local" | "syncing" | "synced">("local");
  const pullingRef = useRef(false);
  const [levelUp, setLevelUp] = useState<CEFR | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [shownId, setShownId] = useState<string | null>(null);
  const [tryText, setTryText] = useState("");
  const [tryState, setTryState] = useState<null | boolean>(null);
  const today = useMemo(() => dayStr(new Date()), []);
  const greet = useMemo(() => GREETS[today.length % GREETS.length], [today]);

  useEffect(() => {
    const s = loadLearn();
    setState(s);
    setHydrated(true);
    // Celebrate a level earned elsewhere (e.g. /learn Assess) — once per level.
    const fun = loadFun();
    if (s.level && (!fun.celebrated || rank(s.level) > rank(fun.celebrated))) {
      fun.celebrated = s.level;
      saveFun(fun);
      setLevelUp(s.level);
      setBurstKey((k) => k + 1);
      try {
        if (unlockAch("level-up"))
          toast(t("achToast", { name: `🚀 ${t("achLevelUp")}` }));
      } catch {
        // toasts are best-effort
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    saveLearn(state);
    saveMetaSavedAt(Date.now());
    if (!member || pullingRef.current) return;
    const timer = setTimeout(() => {
      void pushRemote(state).then((ok) => {
        if (ok) setCloudState("synced");
      });
    }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, hydrated, member]);
  // Members: pull cloud save on login, push debounced. Guests stay local.
  useEffect(() => {
    if (auth.loading || !member || !hydrated) return;
    setCloudState("syncing");
    pullingRef.current = true;
    void fetchRemote()
      .then((remote) => {
        if (remote) setState((prev) => chooseState(prev, loadMetaSavedAt(), remote).state);
      })
      .catch(() => {})
      .finally(() => {
        pullingRef.current = false;
        setCloudState("synced");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.loading, member, hydrated]);

  const lesson = useMemo(
    // Full set is [warm-up ×3, at-level ×5, reach ×2] — quick quiz takes the at-level core.
    () => buildDailyLesson(today, state.level, loadSeen(), quizKey).slice(3, 8),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today, state.level, quizKey],
  );
  const unlocked = useMemo(() => unlockedFor(IDIOMS, state.level), [state.level]);
  const locked = useMemo(() => nextLocked(IDIOMS, state.level), [state.level]);
  const idiom = useMemo(() => {
    if (shownId) {
      const found = unlocked.find((i) => i.id === shownId);
      if (found) return found;
    }
    return pickOfDay(today, unlocked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, state.level, shownId]);
  const leeches = useMemo(() => leechWords(state).slice(0, 6), [state]);
  const weekXp = useMemo(() => {
    let sum = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = dayStr(d);
      sum += state.days[key]?.xp ?? 0;
    }
    return sum;
  }, [state]);

  useEffect(() => {
    setRevealed(false);
    setShownId(null);
    setTryText("");
    setTryState(null);
  }, [today, state.level]);

  const pickLevel = (lv: CEFR) => {
    setState((prev) => setLevel(prev, lv));
    const fun = loadFun();
    if (!fun.celebrated || rank(lv) > rank(fun.celebrated)) {
      fun.celebrated = lv;
      saveFun(fun);
      setLevelUp(lv);
      setBurstKey((k) => k + 1);
      try {
        if (unlockAch("level-up"))
          toast(t("achToast", { name: `🚀 ${t("achLevelUp")}` }));
      } catch {
        // best-effort
      }
    }
  };

  const finishQuiz = (results: AnswerResult[]) => {
    if (results.length > 0) markSeen(results.map((r) => r.item.id));
    setState((prev) => {
      const first = prev.lessons === 0 && results.length > 0;
      const next = recordAnswers(prev, results, today);
      if (first) {
        try {
          if (unlockAch("first-lesson"))
            toast(t("achToast", { name: `📚 ${t("achFirstLesson")}` }));
        } catch {
          // best-effort
        }
      }
      return next;
    });
    setQuizKey((k) => k + 1);
    setTab("me");
  };

  const shuffleIdiom = () => {
    const pool = unlocked.filter((i) => i.id !== idiom?.id);
    if (pool.length === 0) return;
    const next = pool[Math.floor(Math.random() * pool.length)];
    setShownId(next.id);
    setRevealed(false);
    setTryText("");
    setTryState(null);
  };

  const submitTry = () => {
    if (!idiom || tryState !== null) return;
    const ok = tryCheck(tryText, idiom.keywords);
    setTryState(ok);
    if (ok) {
      setState((prev) =>
        recordAnswers(
          prev,
          [{
            item: {
              id: `try-${idiom.id}-${today}`,
              skill: "vocab",
              level: idiom.unlock,
              kind: "choice",
              prompt: `Used "${idiom.term}"`,
              explain: idiom.meaning,
            },
            correct: true,
          }],
          today,
        ),
      );
      const fun = loadFun();
      fun.tryWins += 1;
      saveFun(fun);
      if (fun.tryWins >= 3) {
        try {
          if (unlockAch("slang-star"))
            toast(t("achToast", { name: `😎 ${t("achSlangStar")}` }));
        } catch {
          // best-effort
        }
      }
    }
  };

  const regBadge =
    idiom?.register === "work-safe" ? "💼 work-safe" : idiom?.register === "casual" ? "🎉 casual" : "🙂 neutral";

  return (
    <div
      role="dialog"
      aria-label="English tutor"
      style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: "min(380px, 94vw)",
        zIndex: 1500, background: "var(--bg)", color: "var(--text)",
        borderLeft: "1px solid var(--border)", boxShadow: "-12px 0 32px rgba(0,0,0,0.18)",
        display: "flex", flexDirection: "column",
      }}
    >
      <Confetti burstKey={burstKey} />
      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontSize: 26 }}>🦜</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800 }}>Coco</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {state.level ? `${L("lnLevelIs", "Level")} ${state.level} · ⚡${state.xp} XP` : greet}
          </div>
        </div>
        <button className="sidebar-btn small" onClick={onClose} style={{ width: "auto" }} title="Close">✕</button>
      </div>

      {levelUp ? (
        <div style={{ margin: 12, padding: 12, borderRadius: 10, background: "var(--green)", color: "#fff", textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 900 }}>🚀 {L("lnLevelUp", "LEVEL UP!")} {levelUp}</div>
          <div style={{ fontSize: 13 }}>
            {levelUp === "C2" ? L("lnPerkC2", "Unlocked: exam arena 🏆 — TOEIC/TOEFL/IELTS passages") : levelUp === "C1" ? L("lnPerkC1", "Unlocked: advanced idioms 🐉") : levelUp === "B1" ? L("lnPerkB1", "Unlocked: 12 idioms & expressions 🎁") : levelUp === "B2" ? L("lnPerkB2", "Unlocked: real-world slang 😎") : L("lnPerkAny", "New lessons unlocked! Keep flying! 🦜")}
          </div>
          <button className="sidebar-btn small" onClick={() => setLevelUp(null)} style={{ marginTop: 8, width: "auto" }}>
            {L("lnKeepGoing", "Keep going! →")}
          </button>
        </div>
      ) : (
        <div style={{ margin: "10px 12px 0", fontSize: 13, background: "var(--border)", borderRadius: 8, padding: "8px 10px" }}>
          🦜 {greet}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, padding: "10px 12px 0" }}>
        {(["quiz", "idiom", "me"] as PTab[]).map((id) => (
          <button
            key={id}
            className={`sidebar-btn small${tab === id ? " secondary" : ""}`}
            onClick={() => setTab(id)}
            style={{ flex: 1, justifyContent: "center" }}
          >
            {id === "quiz" ? `⚡ ${L("lnPractice", "Quiz")}` : id === "idiom" ? `😎 ${L("lnIdiomDay", "Idiom")}` : `🏆 ${L("lnMe", "Me")}`}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {tab === "quiz" ? (
          <>
            <p style={{ fontSize: 12, opacity: 0.75, margin: 0 }}>
              {L("lnQuickQuiz", "5 quick ones from today's set — same XP as the full lesson.")}
            </p>
            <QuizCard key={`q-${quizKey}`} items={lesson} cta={L("lnRecord", "Record →")} onDone={finishQuiz} />
          </>
        ) : null}

        {tab === "idiom" ? (
          idiom ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, opacity: 0.7 }}>
                <span style={{ flex: 1 }}>{L("lnIdiomDay", "Idiom of the day")} · {today}</span>
                <button className="sidebar-btn small" onClick={shuffleIdiom} style={{ width: "auto" }} title="Another one!">
                  🎲
                </button>
              </div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>"{idiom.term}"</div>
              <div style={{ display: "flex", gap: 6, fontSize: 12 }}>
                <span style={{ border: "1px solid var(--border)", borderRadius: 20, padding: "2px 10px" }}>
                  {idiom.kind === "slang" ? "😎 slang" : idiom.kind === "expression" ? "💬 expression" : "📖 idiom"}
                </span>
                <span style={{ border: "1px solid var(--border)", borderRadius: 20, padding: "2px 10px" }}>{regBadge}</span>
              </div>
              <button
                className="sidebar-btn small"
                onClick={() => setRevealed((v) => !v)}
                style={{ textAlign: "left" }}
              >
                {revealed ? `💡 ${idiom.meaning} (${idiom.ko})` : `🙈 ${L("lnReveal", "Tap to reveal the meaning")}`}
              </button>
              {revealed ? (
                <div style={{ fontSize: 13, background: "var(--border)", borderRadius: 6, padding: 8 }}>
                  ✍️ <i>"{idiom.example}"</i>
                  {idiom.caution ? <div style={{ marginTop: 4 }}>⚠️ {idiom.caution}</div> : null}
                  {idiom.note ? <div style={{ marginTop: 4 }}>🎓 {idiom.note}</div> : null}
                </div>
              ) : null}
              <div style={{ fontSize: 13, fontWeight: 700 }}>{L("lnTryIt", "Now YOU try — write a sentence with it:")}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  value={tryText}
                  onChange={(e) => { setTryText(e.target.value); setTryState(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") submitTry(); }}
                  placeholder="e.g. Our trip cost an arm and a leg…"
                  disabled={tryState !== null}
                  style={{ flex: 1, minWidth: 0, padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                />
                <button className="sidebar-btn small" onClick={submitTry} disabled={tryState !== null || !tryText.trim()}>
                  Go!
                </button>
              </div>
              {tryState !== null ? (
                <div style={{ fontSize: 13, background: "var(--border)", borderRadius: 6, padding: 8 }}>
                  {tryState ? `${WIN_LINES[tryText.length % WIN_LINES.length]} +10 XP` : `🦜 Hmm — use "${idiom.term}" exactly as written, then hit Go!`}
                  {!tryState ? (
                    <div style={{ marginTop: 6 }}>
                      <button className="sidebar-btn small" onClick={() => setTryState(null)} style={{ width: "auto" }}>↻ Try again</button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
              <div style={{ fontSize: 40, textAlign: "center" }}>🎁</div>
              <p style={{ textAlign: "center" }}>
                {L("lnLocked", "Reach {lv} to unlock").replace("{lv}", locked[0]?.unlock ?? "B1")} — {locked.length} {L("lnLockedWhat", "idioms & expressions waiting!")}
              </p>
              <div style={{ filter: "blur(4px)", userSelect: "none", textAlign: "center", fontSize: 16, fontWeight: 800 }}>
                break the ice · no cap · spill the tea
              </div>
              <Link href="/learn" className="sidebar-btn small primary" style={{ textAlign: "center" }}>
                {L("lnUnlockNow", "Assess me & unlock →")}
              </Link>
            </div>
          )
        ) : null}

        {tab === "me" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
            <div style={{ textAlign: "center", padding: 8 }}>
              <div style={{ fontSize: 44 }}>{state.level === "C2" ? "👑" : state.level === "C1" ? "🐉" : state.level === "B2" ? "🦅" : state.level === "B1" ? "🦜" : state.level === "A2" ? "🐣" : "🥚"}</div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>
                {state.level ? `${L("lnLevelIs", "Level")} ${state.level}` : L("lnUnplaced", "Unplaced egg 🥚 — assess to hatch!")}
              </div>
              <div>⚡ {state.xp} XP · 🔥 {state.lessons} {L("lnLessons", "lessons")}</div>
              <div style={{ fontSize: 11, opacity: 0.65 }}>
                {member ? (cloudState === "synced" ? "☁️ saved to your account" : "☁️ syncing…") : "📱 saved on this device"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>{L("lnPickLevel", "My level:")}</div>
              <div style={{ display: "flex", gap: 6 }}>
                {CEFR_ORDER.map((lv) => (
                  <button
                    key={lv}
                    className={`sidebar-btn small${state.level === lv ? " secondary" : ""}`}
                    onClick={() => pickLevel(lv)}
                    style={{ flex: 1, justifyContent: "center" }}
                  >
                    {lv}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>🔥 {weekXp} / 200 XP {L("lnThisWeek", "this week")}</div>
              <div style={{ height: 10, borderRadius: 6, background: "var(--border)", overflow: "hidden" }}>
                <div style={{ width: `${Math.min(100, Math.round((weekXp / 200) * 100))}%`, height: "100%", background: "var(--green)", transition: "width .5s" }} />
              </div>
            </div>
            {leeches.length > 0 ? (
              <div style={{ background: "var(--border)", borderRadius: 6, padding: 8 }}>
                🐛 <b>{L("lnLeeches", "Keep-forgetting")}:</b> {leeches.join(", ")}
              </div>
            ) : (
              <div style={{ opacity: 0.75 }}>✨ {L("lnNoLeeches", "No leech words. Your memory is scary good.")}</div>
            )}
            <Link href="/learn" className="sidebar-btn small" style={{ textAlign: "center" }}>
              📚 {L("lnFullPractice", "Full practice ground →")}
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
