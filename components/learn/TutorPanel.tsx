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
import type { BankItem, CEFR } from "@/lib/learn-bank";
import { ALL_ITEMS } from "@/lib/learn-bank";
import { CEFR_ORDER } from "@/lib/learn-bank";
import {
  SELF_CHECK,
  getPlacementTest,
  scoreToCEFR,
  suggestLevelFromChecks,
} from "@/lib/learn-bank";
import {
  ESSAY_DRAFT_KEY,
  ESSAY_TOPICS,
  buildEssayCoachPrompt,
  essayModelShape,
  gradeEssay,
  loadEssayHistory,
  saveEssayAttempt,
  type EssayAttempt,
  type EssayScore,
} from "@/lib/learn-essay";
import {
  IDIOM_DRAFT_KEY,
  IDIOMS,
  buildIdiomCoachPrompt,
  dialogueFor,
  idiomAiPrompt,
  idiomById,
  idiomToBankItem,
  nextLocked,
  pickOfDay,
  scanSentence,
  unlockedFor,
} from "@/lib/learn-idioms";
import {
  dayStr,
  dueWords,
  emptyState,
  leechWords,
  loadLearn,
  recordAnswers,
  saveLearn,
  setLevel,
  weakestSkill,
  weekSeries,
  type AnswerResult,
  type LearnState,
} from "@/lib/learn-store";
import { loadSeen, markSeen } from "@/lib/learn-seen";
import { unlockAch } from "@/lib/achievements";

type PTab = "quiz" | "idiom" | "book" | "review" | "essay" | "assess" | "me";
type GateMode = "menu" | "check" | "test";
type QuizMode = "quick" | "full" | "exam";

const VALID_TABS: PTab[] = ["quiz", "idiom", "book", "review", "essay", "assess", "me"];

/** Tiny browser TTS: EN-first, no deps. Chat's full hook stays untouched. */
function speakText(text: string): void {
  try {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.95;
    try {
      const vs = synth.getVoices();
      const en = vs.find((v) => v.lang?.toLowerCase().startsWith("en") && /natural|online|neural|google/i.test(v.name)) ?? vs.find((v) => v.lang?.toLowerCase().startsWith("en"));
      if (en) u.voice = en;
    } catch {
      // default voice is fine
    }
    synth.speak(u);
  } catch {
    // best-effort
  }
}

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
export default function TutorPanel({
  onClose,
  initialTab,
  modelReady = false,
  modelStatus = "",
  onAskAI,
}: {
  onClose?: () => void;
  initialTab?: PTab;
  modelReady?: boolean;
  modelStatus?: string;
  /** Direct in-panel AI call (same provider). Null = fall back to chat draft. */
  onAskAI?: (prompt: string) => Promise<string | null>;
}) {
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
  const [tab, setTab] = useState<PTab>(
    initialTab && (VALID_TABS as string[]).includes(initialTab) ? initialTab : "quiz",
  );
  const [gateMode, setGateMode] = useState<GateMode>("menu");
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [essayTopicId, setEssayTopicId] = useState<string | null>(null);
  const [essayText, setEssayText] = useState("");
  const [essayResult, setEssayResult] = useState<EssayScore | null>(null);
  const [essayHistory, setEssayHistory] = useState<EssayAttempt[]>([]);
  const [state, setState] = useState<LearnState>(() => emptyState());
  const [hydrated, setHydrated] = useState(false);
  const [quizKey, setQuizKey] = useState(0);
  const [quizMode, setQuizMode] = useState<QuizMode>("quick");
  const [burstKey, setBurstKey] = useState(0);
  const [cloudState, setCloudState] = useState<"local" | "syncing" | "synced">("local");
  const pullingRef = useRef(false);
  const [levelUp, setLevelUp] = useState<CEFR | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [shownId, setShownId] = useState<string | null>(null);
  const [tryText, setTryText] = useState("");
  const [tryState, setTryState] = useState<null | "good" | "fix" | "miss">(null);
  const [tryIssues, setTryIssues] = useState<string[]>([]);
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

  const fullLesson = useMemo(
    // Full set is [warm-up ×3, at-level ×5, reach ×2] — quick quiz takes the at-level core.
    () => buildDailyLesson(today, state.level, loadSeen(), quizKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today, state.level, quizKey],
  );
  const lesson = useMemo(() => fullLesson.slice(3, 8), [fullLesson]);
  const examItems = useMemo(() => {
    const reading = ALL_ITEMS.filter((i) => i.skill === "reading");
    if (reading.length === 0) return fullLesson.slice(0, 5);
    // Deterministic per-day slice so refresh doesn't reshuffle mid-exam.
    const start = today.length % Math.max(1, reading.length);
    const out: BankItem[] = [];
    for (let k = 0; k < Math.min(5, reading.length); k++)
      out.push(reading[(start + k) % reading.length]);
    return out;
  }, [today, fullLesson]);
  const quizItems = quizMode === "full" ? fullLesson : quizMode === "exam" ? examItems : lesson;
  const [reviewKey, setReviewKey] = useState(0);
  const reviewItems = useMemo(() => {
    const byWord = new Map(ALL_ITEMS.filter((i) => i.word).map((i) => [i.word as string, i]));
    const out: BankItem[] = [];
    for (const w of dueWords(state, today)) {
      const v = byWord.get(w);
      if (v) {
        out.push(v);
        continue;
      }
      // Idiom SRS cards live as `idiom:<id>` — convert back to quiz items.
      if (w.startsWith("idiom:")) {
        const it = idiomById(w.slice("idiom:".length));
        if (it) out.push(idiomToBankItem(it) as unknown as BankItem);
      }
    }
    return out.slice(0, 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, today, reviewKey]);
  const finishReview = (results: AnswerResult[]) => {
    if (results.length > 0) markSeen(results.map((r) => r.item.id));
    setState((prev) => recordAnswers(prev, results, today));
    setReviewKey((k) => k + 1);
  };
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
    setTryIssues([]);
    setAiAnswer(null);
  }, [today, state.level]);

  const celebrate = (lv: CEFR) => {
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

  const pickLevel = (lv: CEFR) => {
    setState((prev) => setLevel(prev, lv));
    celebrate(lv);
  };

  const placement = useMemo(() => getPlacementTest(), []);
  const finishPlacement = (results: AnswerResult[]) => {
    if (results.length > 0) markSeen(results.map((r) => r.item.id));
    const correct = results.filter((r) => r.correct).length;
    const lv = scoreToCEFR(correct, results.length);
    setState((prev) => setLevel(recordAnswers(prev, results, today), lv));
    celebrate(lv);
    setGateMode("menu");
    setTab("quiz");
  };

  // ---- compact essay ----
  const essayTopic = useMemo(() => {
    const mine = ESSAY_TOPICS.filter(
      (t) => !state.level || t.level === state.level,
    );
    const list = mine.length > 0 ? mine : ESSAY_TOPICS;
    return list.find((t) => t.id === essayTopicId) ?? list[Math.floor(Math.random() * list.length)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.level, essayTopicId]);
  const essayWords = useMemo(
    () => essayText.split(/\s+/).filter(Boolean).length,
    [essayText],
  );
  useEffect(() => {
    if (tab === "essay") setEssayHistory(loadEssayHistory());
  }, [tab]);
  const shuffleTopic = () => {
    const mine = ESSAY_TOPICS.filter(
      (t) => !state.level || t.level === state.level,
    );
    const pool = (mine.length > 0 ? mine : ESSAY_TOPICS).filter((t) => t.id !== essayTopic.id);
    if (pool.length === 0) return;
    setEssayTopicId(pool[Math.floor(Math.random() * pool.length)].id);
    setEssayResult(null);
  };
  const gradePanelEssay = () => {
    const score = gradeEssay(essayText, essayTopic);
    setEssayResult(score);
    setState((prev) =>
      recordAnswers(
        prev,
        [{
          item: {
            id: `essay-${Date.now()}`,
            skill: "writing",
            level: essayTopic.level,
            kind: "choice",
            prompt: `Essay: ${essayTopic.topic}`,
            explain: `${score.total}/100`,
          },
          correct: score.pass,
        }],
        today,
      ),
    );
    setEssayHistory(
      saveEssayAttempt({
        id: new Date().toISOString(),
        topicId: essayTopic.id,
        topic: essayTopic.topic,
        words: score.wordCount,
        total: score.total,
        pass: score.pass,
        at: today,
      }),
    );
  };
  const sendEssayToChat = () => {
    if (!essayResult) return;
    try {
      localStorage.setItem(
        ESSAY_DRAFT_KEY,
        buildEssayCoachPrompt(essayTopic, essayText, essayResult),
      );
    } catch {
      // best-effort
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

  // ---- phrasebook + direct-AI state ----
  const [bookQuery, setBookQuery] = useState("");
  const [bookFilter, setBookFilter] = useState<"all" | "work-safe" | "neutral" | "casual">("all");
  const [bookOpen, setBookOpen] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiLabel, setAiLabel] = useState<string>("");

  const askAiDirect = async (label: string, prompt: string, draftFallback?: () => void) => {
    setAiLabel(label);
    setAiAnswer(null);
    if (!modelReady || !onAskAI) {
      draftFallback?.();
      setAiAnswer(
        modelReady
          ? "Draft saved — open chat and press Enter for AI coaching 💬"
          : `AI isn't ready yet (${modelStatus || "starting…"}). Draft saved — open chat once the model is ready 💬`,
      );
      return;
    }
    setAiBusy(true);
    try {
      const out = await onAskAI(prompt);
      if (out && out.trim()) setAiAnswer(out.trim().slice(0, 2000));
      else {
        draftFallback?.();
        setAiAnswer("Draft saved — open chat and press Enter 💬");
      }
    } catch {
      draftFallback?.();
      setAiAnswer("AI hiccup — draft saved to chat instead 💬");
    } finally {
      setAiBusy(false);
    }
  };

  const submitTry = () => {
    if (!idiom || tryState !== null || !tryText.trim()) return;
    const scan = scanSentence(tryText, idiom.keywords);
    if (!scan.hasKeywords) {
      setTryState("miss");
      return;
    }
    if (scan.issues.length > 0) {
      // Keywords right, sentence shaky: honest fix-it, small XP for trying.
      setTryIssues(scan.issues);
      setTryState("fix");
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
              word: `idiom:${idiom.id}`,
            },
            correct: false,
          }],
          today,
        ),
      );
      return;
    }
    setTryState("good");
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
            word: `idiom:${idiom.id}`,
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
  };

  const askAiAboutSentence = () => {
    if (!idiom) return;
    try {
      localStorage.setItem(
        IDIOM_DRAFT_KEY,
        buildIdiomCoachPrompt(idiom.term, idiom.meaning, idiom.example, tryText, tryIssues),
      );
    } catch {
      // best-effort
    }
  };

  const regBadge =
    idiom?.register === "work-safe" ? "💼 work-safe" : idiom?.register === "casual" ? "🎉 casual" : "🙂 neutral";

  const showGate = hydrated && !state.level;

  const renderAssess = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 800 }}>
        🎯 {L("lnKnowLevel", "I know my level — just let me pick it")}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {CEFR_ORDER.map((lv) => (
          <button
            key={lv}
            className={`sidebar-btn small${state.level === lv ? " secondary" : ""}`}
            onClick={() => pickLevel(lv)}
            style={{ flex: "1 1 52px", justifyContent: "center", padding: "10px 4px", fontWeight: 800 }}
          >
            {lv}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, opacity: 0.65 }}>
        A1 입문 · A2 초급 · B1 중급 · B2 중고급 · C1 고급 · C2 최상급
      </div>
      {gateMode === "menu" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button className="sidebar-btn small primary" onClick={() => { setChecks({}); setGateMode("check"); }} style={{ justifyContent: "center", padding: "10px" }}>
            {L("lnSelfCheck", "❓ Not sure — 30-sec self-check")}
          </button>
          <button className="sidebar-btn small" onClick={() => setGateMode("test")} style={{ justifyContent: "center", padding: "10px" }}>
            {L("lnFullTest", "📝 Full 18-question test")}
          </button>
          <button className="sidebar-btn small" onClick={() => pickLevel("A1")} style={{ justifyContent: "center" }}>
            {L("lnSkip", "⏩ Skip — start at A1")}
          </button>
        </div>
      ) : null}
      {gateMode === "check" ? (
        <div style={{ fontSize: 13, border: "1px solid var(--border)", borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontWeight: 800 }}>{L("lnCheckTitle", "Check what you can already do:")}</div>
          {SELF_CHECK.map((s) => (
            <label key={s.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer", background: checks[s.id] ? "var(--border)" : "transparent", borderRadius: 6, padding: "6px 8px" }}>
              <input
                type="checkbox"
                checked={Boolean(checks[s.id])}
                onChange={() => setChecks((prev) => ({ ...prev, [s.id]: !prev[s.id] }))}
                style={{ marginTop: 3, accentColor: "var(--green)" }}
              />
              <span>
                <span style={{ fontSize: 11, opacity: 0.6 }}>[{s.level}] </span>
                {s.en}
                <br />
                <span style={{ opacity: 0.65 }}>{s.ko}</span>
              </span>
            </label>
          ))}
          {(() => {
            const n = Object.values(checks).filter(Boolean).length;
            const sug = suggestLevelFromChecks(n);
            return (
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
                <span>→ {L("lnSuggests", "Suggested level")}: <b>{n === 0 ? "—" : sug}</b></span>
                {n > 0 ? (
                  <button className="sidebar-btn small primary" onClick={() => pickLevel(sug)} style={{ width: "auto" }}>
                    {L("lnUseLevel", "Use this level →")}
                  </button>
                ) : null}
                <button className="sidebar-btn small" onClick={() => setGateMode("menu")} style={{ width: "auto" }}>←</button>
              </div>
            );
          })()}
        </div>
      ) : null}
      {gateMode === "test" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <QuizCard key={`a-${quizKey}`} items={placement} cta={L("lnSaveLevel", "Save my level →")} onDone={finishPlacement} />
          <button className="sidebar-btn small" onClick={() => setGateMode("menu")} style={{ width: "auto", alignSelf: "flex-start" }}>← Back</button>
        </div>
      ) : null}
    </div>
  );

  return (
    <div
      role="dialog"
      aria-label="English tutor"
      style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: "min(400px, 94vw)",
        zIndex: 1500, background: "var(--bg)", color: "var(--text)",
        borderLeft: "1px solid var(--border)", boxShadow: "-12px 0 32px rgba(0,0,0,0.18)",
        display: "flex", flexDirection: "column",
      }}
    >
      <Confetti burstKey={burstKey} />
      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontSize: 26 }}>🦜</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800 }}>{L("lnStudyTitle", "English Study")}</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {state.level ? `${L("lnLevelIs", "Level")} ${state.level} · ⚡${state.xp} XP` : greet}
          </div>
        </div>
        <button className="sidebar-btn small" onClick={onClose} style={{ width: "auto", display: onClose ? undefined : "none" }} title="Close">✕</button>
      </div>

      {showGate ? (
        <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ textAlign: "center", padding: "4px 0" }}>
            <div style={{ fontSize: 46 }}>🦜</div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>{L("lnGateTitle", "Start learning English!")}</div>
            <div style={{ fontSize: 13, opacity: 0.75 }}>{L("lnGateSub", "Set your level first — takes 10 seconds.")}</div>
          </div>
          {renderAssess()}
        </div>
      ) : (
      <>
      {levelUp ? (
        <div style={{ margin: 12, padding: 12, borderRadius: 10, background: "var(--green)", color: "#fff", textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 900 }}>🚀 {L("lnLevelUp", "LEVEL UP!")} {levelUp}</div>
          <div style={{ fontSize: 13 }}>
            {levelUp === "C2" ? L("lnPerkC2", "Unlocked: exam arena 🏆 — TOEIC/TOEFL/IELTS passages") : levelUp === "C1" ? L("lnPerkC1", "Unlocked: advanced idioms 🐉") : levelUp === "B1" ? L("lnPerkB1", "Unlocked: idioms & expressions 🎁") : levelUp === "B2" ? L("lnPerkB2", "Unlocked: real-world slang 😎") : L("lnPerkAny", "New lessons unlocked! Keep flying! 🦜")}
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

      <div style={{ display: "flex", gap: 6, padding: "10px 12px 0", overflowX: "auto", scrollbarWidth: "thin" }}>
        {(["quiz", "idiom", "book", "review", "essay", "assess", "me"] as PTab[]).map((id) => (
          <button
            key={id}
            className={`sidebar-btn small${tab === id ? " secondary" : ""}`}
            onClick={() => { setTab(id); setGateMode("menu"); setAiAnswer(null); }}
            style={{ flex: "0 0 auto", justifyContent: "center", padding: "8px 10px", fontSize: 13 }}
          >
            {id === "quiz" ? `⚡ ${L("lnPractice", "Quiz")}` : id === "idiom" ? `😎 ${L("lnIdiomDay", "Idiom")}` : id === "book" ? `📖 Book` : id === "review" ? `🔁 ${L("lnReviewTab", "Review")} (${reviewItems.length})` : id === "essay" ? `✍️ ${L("lnEssay", "Essay")}` : id === "assess" ? `🎯 ${L("lnAssess", "Level")}` : `🏆 ${L("lnMe", "Me")}`}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {tab === "quiz" ? (
          <>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {(["quick", "full", "exam"] as QuizMode[]).map((m) => (
                <button
                  key={m}
                  className={`sidebar-btn small${quizMode === m ? " secondary" : ""}`}
                  onClick={() => setQuizMode(m)}
                  style={{ width: "auto", fontSize: 12 }}
                  title={m === "quick" ? "5 at-level" : m === "full" ? "Full 10 (warm-up + reach)" : "Exam reading passages"}
                >
                  {m === "quick" ? "⚡ Quick 5" : m === "full" ? "📚 Full 10" : "🏆 Exam"}
                </button>
              ))}
              <span style={{ flex: 1 }} />
              <button className="sidebar-btn small" onClick={() => setQuizKey((k) => k + 1)} style={{ width: "auto" }} title="Deal a fresh set">
                🎲
              </button>
            </div>
            <p style={{ fontSize: 12, opacity: 0.75, margin: 0 }}>
              {quizMode === "quick" ? L("lnQuickQuiz", "5 quick ones from today's set — same XP as the full lesson.") : quizMode === "full" ? "Full lesson: 3 warm-up + 5 at-level + 2 stretch." : "Exam arena: TOEIC / TOEFL / IELTS-style reading."}
            </p>
            <QuizCard key={`q-${quizKey}-${quizMode}`} items={quizItems} cta={L("lnRecord", "Record →")} onDone={finishQuiz} />
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
              <div style={{ fontSize: 22, fontWeight: 900, display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ flex: 1 }}>"{idiom.term}"</span>
                <button className="sidebar-btn small" onClick={() => speakText(`${idiom.term}. ${idiom.example}`)} style={{ width: "auto" }} title="Listen 🔊">🔊</button>
                <button
                  className="sidebar-btn small"
                  title="Copy"
                  style={{ width: "auto" }}
                  onClick={() => {
                    try {
                      void navigator.clipboard?.writeText(`${idiom.term} = ${idiom.meaning} — "${idiom.example}"`);
                      toast("Copied 📋");
                    } catch {
                      // clipboard unavailable
                    }
                  }}
                >
                  📋
                </button>
              </div>
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
                  {(() => {
                    const [a, b] = dialogueFor(idiom);
                    return (
                      <div style={{ marginTop: 6, opacity: 0.9 }}>
                        💬 {a}
                        <br />💬 {b}
                      </div>
                    );
                  })()}
                  {idiom.caution ? <div style={{ marginTop: 4 }}>⚠️ {idiom.caution}</div> : null}
                  {idiom.note ? <div style={{ marginTop: 4 }}>🎓 {idiom.note}</div> : null}
                  <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    <button className="sidebar-btn small" style={{ width: "auto", fontSize: 12 }} disabled={aiBusy} onClick={() => void askAiDirect("Explain", idiomAiPrompt("explain", idiom))}>
                      {aiBusy && aiLabel === "Explain" ? "…" : "🤖 Explain A2"}
                    </button>
                    <button className="sidebar-btn small" style={{ width: "auto", fontSize: 12 }} disabled={aiBusy} onClick={() => void askAiDirect("Examples", idiomAiPrompt("examples", idiom))}>
                      {aiBusy && aiLabel === "Examples" ? "…" : "✨ 3 examples"}
                    </button>
                    <button className="sidebar-btn small" style={{ width: "auto", fontSize: 12 }} disabled={aiBusy} onClick={() => void askAiDirect("Quiz", idiomAiPrompt("quiz", idiom))}>
                      {aiBusy && aiLabel === "Quiz" ? "…" : "❓ Quiz me"}
                    </button>
                  </div>
                  {!modelReady ? (
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}>AI off ({modelStatus || "not ready"}) — answers fall back to chat draft 💬</div>
                  ) : null}
                  {aiAnswer ? (
                    <div style={{ marginTop: 6, whiteSpace: "pre-wrap", background: "var(--bg)", borderRadius: 6, padding: 8 }}>
                      🤖 <b>{aiLabel}:</b>
                      <br />
                      {aiAnswer}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div style={{ fontSize: 13, fontWeight: 700 }}>{L("lnTryIt", "Now YOU try — write a sentence with it:")}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  value={tryText}
                  onChange={(e) => { setTryText(e.target.value); setTryState(null); setTryIssues([]); }}
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
                <div style={{ fontSize: 13, background: "var(--border)", borderRadius: 6, padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  {tryState === "good" ? (
                    <div>{WIN_LINES[tryText.length % WIN_LINES.length]} +10 XP</div>
                  ) : tryState === "fix" ? (
                    <>
                      <div>🛠️ Almost! Coco spotted {tryIssues.length > 1 ? "these" : "this"}:</div>
                      {tryIssues.map((iss, i) => (
                        <div key={i}>• {iss}</div>
                      ))}
                      <div style={{ opacity: 0.85 }}>Compare with native: <i>"{idiom.example}"</i></div>
                    </>
                  ) : (
                    <div>🦜 Hmm — use "{idiom.term}" exactly as written, then hit Go!</div>
                  )}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {tryState !== "good" ? (
                      <button className="sidebar-btn small" onClick={() => { setTryState(null); setTryIssues([]); }} style={{ width: "auto" }}>↻ Try again</button>
                    ) : null}
                    <button
                      className="sidebar-btn small"
                      style={{ width: "auto", textAlign: "center" }}
                      disabled={aiBusy}
                      onClick={() => void askAiDirect(
                        "Verdict",
                        buildIdiomCoachPrompt(idiom.term, idiom.meaning, idiom.example, tryText, tryIssues),
                        askAiAboutSentence,
                      )}
                    >
                      {aiBusy && aiLabel === "Verdict" ? "…" : modelReady ? "🤖 AI verdict — in panel" : "💬 Save to chat →"}
                    </button>
                    {!modelReady && tryText.trim() ? (
                      <Link href="/" onClick={askAiAboutSentence} className="sidebar-btn small" style={{ width: "auto", textAlign: "center" }}>
                        Open in chat
                      </Link>
                    ) : null}
                  </div>
                  {aiAnswer && (aiLabel === "Verdict" || aiLabel === "Explain" || aiLabel === "Examples" || aiLabel === "Quiz") && tryState !== null ? (
                    <div style={{ whiteSpace: "pre-wrap", opacity: 0.95 }}>{aiLabel === "Verdict" ? aiAnswer : null}</div>
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
              <button className="sidebar-btn small primary" onClick={() => setTab("assess")} style={{ textAlign: "center" }}>
                {L("lnUnlockNow", "Assess me & unlock →")}
              </button>
            </div>
          )
        ) : null}

        {tab === "book" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              value={bookQuery}
              onChange={(e) => setBookQuery(e.target.value)}
              placeholder="Search phrases… (e.g. cap, cake, luck)"
              style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
            />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(["all", "work-safe", "neutral", "casual"] as const).map((f) => (
                <button
                  key={f}
                  className={`sidebar-btn small${bookFilter === f ? " secondary" : ""}`}
                  onClick={() => setBookFilter(f)}
                  style={{ width: "auto", fontSize: 12 }}
                >
                  {f === "all" ? `All (${unlocked.length})` : f === "work-safe" ? "💼 work-safe" : f === "casual" ? "🎉 casual" : "🙂 neutral"}
                </button>
              ))}
            </div>
            {(() => {
              const q = bookQuery.trim().toLowerCase();
              const list = unlocked.filter(
                (i) =>
                  (bookFilter === "all" || i.register === bookFilter) &&
                  (!q || `${i.term} ${i.meaning} ${i.ko}`.toLowerCase().includes(q)),
              );
              if (list.length === 0)
                return <p style={{ fontSize: 13, opacity: 0.75 }}>No matches — try another word, or level up to unlock more 🎁</p>;
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{list.length} phrases</div>
                  {list.slice(0, 30).map((i) => (
                    <div key={i.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 8 }}>
                      <button
                        onClick={() => setBookOpen((v) => (v === i.id ? null : i.id))}
                        style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}
                      >
                        <span style={{ fontWeight: 800 }}>"{i.term}"</span>
                        <span style={{ fontSize: 12, opacity: 0.7 }}> · {i.kind} · [{i.unlock}]</span>
                        <br />
                        <span style={{ fontSize: 13 }}>{i.meaning} ({i.ko})</span>
                      </button>
                      {bookOpen === i.id ? (
                        <div style={{ fontSize: 13, marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                          <i>"{i.example}"</i>
                          {(() => {
                            const [a, b] = dialogueFor(i);
                            return <span style={{ opacity: 0.9 }}>💬 {a}<br />💬 {b}</span>;
                          })()}
                          {i.caution ? <span>⚠️ {i.caution}</span> : null}
                          <span style={{ display: "flex", gap: 6 }}>
                            <button className="sidebar-btn small" style={{ width: "auto", fontSize: 12 }} onClick={() => speakText(`${i.term}. ${i.example}`)}>🔊 Listen</button>
                            <button
                              className="sidebar-btn small"
                              style={{ width: "auto", fontSize: 12 }}
                              onClick={() => { setShownId(i.id); setTab("idiom"); setRevealed(true); }}
                            >
                              ✍️ Practice →
                            </button>
                          </span>
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {list.length > 30 ? <div style={{ fontSize: 12, opacity: 0.7 }}>Showing 30 — refine your search 🔍</div> : null}
                </div>
              );
            })()}
          </div>
        ) : null}

        {tab === "review" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ fontSize: 12, opacity: 0.75, margin: 0 }}>
              Words you missed come back here. Fail 3× = 🐛 leech.
            </p>
            {reviewItems.length === 0 ? (
              <p style={{ fontSize: 13 }}>✅ {L("lnReviewDone", "Nothing due — come back tomorrow!")}</p>
            ) : (
              <QuizCard key={`rv-${reviewKey}`} items={reviewItems} cta={L("lnRecord", "Record →")} onDone={finishReview} />
            )}
          </div>
        ) : null}

        {tab === "essay" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 6 }}>
              <select
                value={essayTopic.id}
                onChange={(e) => { setEssayTopicId(e.target.value); setEssayResult(null); }}
                style={{ flex: 1, minWidth: 0, padding: "8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13 }}
              >
                {ESSAY_TOPICS.map((t) => (
                  <option key={t.id} value={t.id}>[{t.level}] {t.topic.slice(0, 40)}…</option>
                ))}
              </select>
              <button className="sidebar-btn small" onClick={shuffleTopic} style={{ width: "auto" }} title="Random topic">🎲</button>
            </div>
            <div style={{ fontSize: 14, fontWeight: 800 }}>"{essayTopic.topic}"</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>💡 {essayTopic.hint} · {essayTopic.minWords}–{essayTopic.maxWords} words · 80+ pass</div>
            <textarea
              value={essayText}
              onChange={(e) => { setEssayText(e.target.value); setEssayResult(null); }}
              placeholder="Write here… (blank line = new paragraph)"
              rows={6}
              style={{ width: "100%", boxSizing: "border-box", padding: 10, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 14, lineHeight: 1.6, resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, opacity: 0.75 }}>{essayWords} words</span>
              <button className="sidebar-btn small primary" onClick={gradePanelEssay} disabled={essayWords === 0} style={{ width: "auto" }}>
                📝 Grade
              </button>
              {essayResult ? (
                <>
                  <button
                    className="sidebar-btn small"
                    style={{ width: "auto", textAlign: "center" }}
                    disabled={aiBusy}
                    onClick={() => void askAiDirect(
                      "Essay coaching",
                      buildEssayCoachPrompt(essayTopic, essayText, essayResult),
                      sendEssayToChat,
                    )}
                  >
                    {aiBusy && aiLabel === "Essay coaching" ? "…" : modelReady ? "🤖 Coach me — in panel" : "💬 AI coaching →"}
                  </button>
                  {!modelReady ? (
                    <Link href="/" onClick={sendEssayToChat} className="sidebar-btn small" style={{ width: "auto", textAlign: "center" }}>
                      Open in chat
                    </Link>
                  ) : null}
                </>
              ) : null}
            </div>
            {aiAnswer && aiLabel === "Essay coaching" ? (
              <div style={{ fontSize: 13, whiteSpace: "pre-wrap", background: "var(--border)", borderRadius: 8, padding: 10 }}>
                🤖 {aiAnswer}
              </div>
            ) : null}
            {essayResult ? (
              <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ textAlign: "center" }}>
                  <span style={{ fontSize: 30, fontWeight: 900 }}>{essayResult.total}<span style={{ fontSize: 14, opacity: 0.6 }}>/100</span></span>
                  <div style={{ fontSize: 13, fontWeight: 800, color: essayResult.pass ? "var(--green)" : "inherit" }}>
                    {essayResult.pass ? "🎉 PASS!" : "💪 80 to pass — retry!"}
                  </div>
                </div>
                {essayResult.axes.map((a) => (
                  <div key={a.key} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                    <span style={{ width: 64, textTransform: "capitalize", opacity: 0.8 }}>{a.key}</span>
                    <div style={{ flex: 1, height: 7, borderRadius: 4, background: "var(--border)", overflow: "hidden" }}>
                      <div style={{ width: `${(a.score / 20) * 100}%`, height: "100%", background: "var(--green)" }} />
                    </div>
                    <span style={{ width: 38, textAlign: "right" }}>{a.score}</span>
                  </div>
                ))}
                <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 3 }}>
                  {essayResult.feedback.map((f, i) => (
                    <div key={i}>{f}</div>
                  ))}
                </div>
                <div style={{ fontSize: 12, background: "var(--bg)", borderRadius: 6, padding: 8 }}>
                  <b>🌟 What would 90+ look like?</b>
                  {essayModelShape(essayTopic).map((line, i) => (
                    <div key={i} style={{ marginTop: 3 }}>• {line}</div>
                  ))}
                  <div style={{ marginTop: 4, opacity: 0.8 }}>Rewrite one paragraph using this shape, then hit Grade again 🔁</div>
                </div>
              </div>
            ) : null}
            {essayHistory.length > 0 ? (
              <div style={{ fontSize: 12, opacity: 0.85 }}>
                🗂️ {essayHistory.slice(0, 3).map((h) => `${h.pass ? "✅" : "📝"}${h.total}`).join(" · ")}
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "assess" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {renderAssess()}
          </div>
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
              <div style={{ display: "flex", gap: 4, marginTop: 6, alignItems: "flex-end", height: 44 }}>
                {weekSeries(state, today).map((d) => (
                  <div key={d.day} title={`${d.day}: ${d.xp} XP`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <div style={{ width: "100%", height: 28, display: "flex", alignItems: "flex-end", background: "var(--border)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: "100%", height: `${Math.min(100, Math.round((d.xp / 60) * 100))}%`, background: "var(--green)" }} />
                    </div>
                    <span style={{ fontSize: 9, opacity: 0.6 }}>{d.day.slice(5)}</span>
                  </div>
                ))}
              </div>
            </div>
            {(() => {
              const weak = weakestSkill(state);
              if (!weak) return <div style={{ opacity: 0.75 }}>📊 Answer 5+ per skill to unlock your focus tip.</div>;
              const s = state.skills[weak];
              const acc = s.asked > 0 ? Math.round((s.correct / s.asked) * 100) : 0;
              return (
                <div style={{ background: "var(--border)", borderRadius: 6, padding: 8 }}>
                  🎯 <b>Focus: {weak}</b> ({acc}% over {s.asked}) —{" "}
                  <button className="sidebar-btn small" style={{ width: "auto", fontSize: 12 }} onClick={() => { setTab("quiz"); setQuizMode("quick"); }}>
                    Practice →
                  </button>
                </div>
              );
            })()}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 12 }}>
              {(Object.keys(state.skills) as Array<keyof typeof state.skills>).map((k) => {
                const s = state.skills[k];
                const acc = s.asked > 0 ? Math.round((s.correct / s.asked) * 100) : 0;
                return <div key={k} style={{ background: "var(--border)", borderRadius: 6, padding: "6px 8px" }}>{k}: {s.correct}/{s.asked} ({acc}%)</div>;
              })}
            </div>
            {leeches.length > 0 ? (
              <div style={{ background: "var(--border)", borderRadius: 6, padding: 8 }}>
                🐛 <b>{L("lnLeeches", "Keep-forgetting")}:</b> {leeches.join(", ")}
              </div>
            ) : (
              <div style={{ opacity: 0.75 }}>✨ {L("lnNoLeeches", "No leech words. Your memory is scary good.")}</div>
            )}
          </div>
        ) : null}
      </div>
      </>
    )}
    </div>
  );
}
