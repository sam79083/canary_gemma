"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import Confetti from "@/components/Confetti";
import QuizCard from "@/components/learn/QuizCard";
import DojoPanel from "@/components/learn/DojoPanel";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchRemote,
  mergeLearnState,
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
  scorePlacementDetailed,
  suggestLevelFromChecks,
} from "@/lib/learn-bank";
import { currentUnit } from "@/lib/learn-curriculum";
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
  addLesson,
  awardXP,
  dueWords,
  emptyState,
  gateBonusOnce,
  leechWords,
  loadLearn,
  recordAnswers,
  saveLearn,
  setLevel,
  weakestSkill,
  weekSeries,
  type AnswerResult,
  type BonusGates,
  type LearnState,
} from "@/lib/learn-store";
import {
  addCard,
  buildMatchRound,
  extractWordsFromText,
  gradeWrite,
  loadCards,
  removeCard,
  saveCards,
  type FlashCard,
} from "@/lib/learn-flash";
import {
  analyzeStyle,
  buildStyleCoachPrompt,
  styleFindings,
  type Goal,
} from "@/lib/learn-feedback";
import { PATHS, loadPath, orderIdiomsForPath, pathById, savePath, weeklyTarget } from "@/lib/learn-path";
import {
  addEntry,
  buildShareCard,
  exportPortfolioMd,
  leagueTable,
  loadPortfolio,
  portfolioKindLabel,
  removeEntry,
  savePortfolio,
  type PortfolioEntry,
} from "@/lib/learn-portfolio";
import { buildProofEvidence, exportProofSheet } from "@/lib/learn-proof";
import { loadPronounceStats } from "@/lib/learn-pronounce";
import { spellBatch } from "@/lib/learn-spell";
import type { Idiom } from "@/lib/learn-idioms";
import ShadowBox from "@/components/learn/ShadowBox";
import UseItBox from "@/components/learn/UseItBox";
import ReadBox from "@/components/learn/ReadBox";
import PronounceBox from "@/components/learn/PronounceBox";
import CareerBox from "@/components/learn/CareerBox";
import IeltsBox from "@/components/learn/IeltsBox";
import {
  gradeHeard,
  listenBatch,
  type ListenItem,
  type ListenMode,
} from "@/lib/learn-listen";
import {
  STARTERS,
  USEIT_DRAFT_KEY,
  buildHandoffMessage,
  type PracticeTarget,
} from "@/lib/learn-useit";
import {
  neighborLevel,
  pushRecent,
  recentStats,
  suggestShift,
} from "@/lib/learn-adaptive";
import { loadSeen, markSeen } from "@/lib/learn-seen";
import { getSpeechRate } from "@/lib/speech";
import { buildWeeklyReport } from "@/lib/learn-report";
import { freezeLeft } from "@/lib/streak";
import {
  buildFreshSetPrompt,
  genBatch,
  genPoolSize,
  hashStr,
  lookupGenWord,
  parseAiItems,
  rememberGenItems,
  setChoiceMode,
  setEnDefDict,
} from "@/lib/learn-gen";
import {
  loadChoiceMode,
  loadEnDef,
  saveChoiceMode,
  type ChoiceMode,
} from "@/lib/learn-endef";
import {
  detectErrors,
  drillItemFor,
  emptyErrorProfile,
  errorDrills,
  loadErrorProfile,
  recordErrors,
  saveErrorProfile,
  topErrorKinds,
  ERROR_KIND_LABEL,
  type ErrorProfile,
} from "@/lib/learn-errors";
import { unlockAch } from "@/lib/achievements";

type PTab = "quiz" | "idiom" | "book" | "read" | "cards" | "listen" | "dojo" | "say" | "work" | "review" | "essay" | "style" | "folio" | "assess" | "me";
type GateMode = "menu" | "check" | "test";
type QuizMode = "quick" | "full" | "exam" | "endless";
type FlashMode = "flip" | "match" | "write";

const VALID_TABS: PTab[] = ["quiz", "idiom", "book", "read", "cards", "listen", "dojo", "say", "work", "review", "essay", "style", "folio", "assess", "me"];

/** Self-explanatory tab groups — each collapses to keep newbies focused. */
const TAB_GROUPS: { label: string; icon: string; tabs: PTab[] }[] = [
  { label: "Learn", icon: "📘", tabs: ["quiz", "idiom", "book", "read", "cards", "listen"] },
  { label: "Speak", icon: "🗣️", tabs: ["say", "work"] },
  { label: "Code", icon: "💻", tabs: ["dojo"] },
  { label: "Write", icon: "✍️", tabs: ["essay", "style"] },
  { label: "Progress", icon: "📊", tabs: ["review", "folio", "assess", "me"] },
];

function tabLabel(id: PTab, L: (k: string, f: string) => string, flashLen: number, reviewLen: number): string {
  switch (id) {
    case "quiz": return `⚡ ${L("lnPractice", "Quiz")}`;
    case "idiom": return `😎 ${L("lnIdiomDay", "Idiom")}`;
    case "book": return "📖 Book";
    case "read": return "📰 Read";
    case "cards": return `🗂️ Cards${flashLen > 0 ? ` (${flashLen})` : ""}`;
    case "listen": return "👂 Ear";
    case "dojo": return `💻 ${L("lnDojo", "Code")}`;
    case "say": return "🗣️ Say";
    case "work": return "🧑‍💼 Work";
    case "review": return `🔁 ${L("lnReviewTab", "Review")} (${reviewLen})`;
    case "essay": return `✍️ ${L("lnEssay", "Essay")}`;
    case "style": return "✨ Style";
    case "folio": return "💼 Folio";
    case "assess": return `🎯 ${L("lnAssess", "Level")}`;
    case "me": return `🏆 ${L("lnMe", "Me")}`;
  }
}

/** Tiny browser TTS: EN-first, no deps. Chat's full hook stays untouched.
 *  Optional rate override (e.g. 0.7 for slow shadowing model). */
function speakText(text: string, rate?: number): void {
  try {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = rate ?? getSpeechRate();
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
  onSendToChat,
  fullScreen = false,
}: {
  onClose?: () => void;
  initialTab?: PTab;
  fullScreen?: boolean;
  modelReady?: boolean;
  modelStatus?: string;
  /** Direct in-panel AI call (same provider). Null = fall back to chat draft. */
  onAskAI?: (prompt: string) => Promise<string | null>;
  /** Post text into the main chat composer (+ register a practice target).
   * Absent on /learn (UseItBox falls back to a chat draft). */
  onSendToChat?: (text: string, target?: PracticeTarget) => void;
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
  /** Collapsed tab groups — the active tab's group is always expanded. */
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
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
  /** Fresh salt per panel open: reopening always deals a new set (the old
   * deterministic-daily slice showed the same 5 all day until finished). */
  const [openSalt] = useState(() => Math.floor(Math.random() * 1e9));
  /**
   * Bulk pools (914 idioms + 9,960 graded words, ~250 KB) load on demand —
   * never in the main-page bundle. Until loaded, curated pools stand in.
   */
  const [bulkIdioms, setBulkIdioms] = useState<Idiom[]>([]);
  const [bulkWords, setBulkWords] = useState<Record<CEFR, string[]> | null>(null);

  // Esc closes the panel (slide-over mode only — /learn fullscreen keeps Esc
  // free for form inputs, so it closes only via the header button).
  useEffect(() => {
    if (!onClose || fullScreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = document.activeElement as { tagName?: string } | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, fullScreen]);

  useEffect(() => {
    let dead = false;
    void Promise.all([import("@/lib/idioms-bulk"), import("@/lib/words-bulk")])
      .then(([idioms, words]) => {
        if (dead) return;
        setBulkIdioms(idioms.BULK_IDIOMS);
        setBulkWords(words.BULK_WORDS);
        setQuizKey((k) => k + 1); // re-deal with full pools
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, []);
  const [burstKey, setBurstKey] = useState(0);
  const [cloudState, setCloudState] = useState<"local" | "syncing" | "synced">("local");
  const pullingRef = useRef(false);
  const [levelUp, setLevelUp] = useState<CEFR | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [shownId, setShownId] = useState<string | null>(null);
  const [tryText, setTryText] = useState("");
  const [tryState, setTryState] = useState<null | "good" | "fix" | "miss">(null);
  const [tryIssues, setTryIssues] = useState<string[]>([]);
  const [tryChips, setTryChips] = useState(false);
  const today = useMemo(() => dayStr(new Date()), []);
  const greet = useMemo(() => GREETS[hashStr(today) % GREETS.length], [today]);

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
        // Additive merge (never last-writer-wins): two devices keep both
        // progress sets. The merged result is pushed back on the next debounce.
        if (remote) setState((prev) => mergeLearnState(prev, remote.state));
      })
      .catch(() => {})
      .finally(() => {
        pullingRef.current = false;
        setCloudState("synced");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.loading, member, hydrated]);

  const unitNow = useMemo(
    () => currentUnit(state.lessons, state.level),
    [state.lessons, state.level],
  );
  const fullLesson = useMemo(
    // Full set is [warm-up ×3, at-level ×5, reach ×2] — stable all day.
    // The active curriculum unit nudges up to 3 of the main five its way.
    () =>
      buildDailyLesson(
        today,
        state.level,
        loadSeen(),
        `${quizKey}|${openSalt}`,
        unitNow?.unit.skill,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today, state.level, quizKey, openSalt, unitNow],
  );
  const lesson = useMemo(() => {
    // Quick 5: fresh sample from the big generated pool on every open —
    // never the same five twice in a row.
    const batch = genBatch(state.level ?? "A1", 5, loadSeen(), `quick|${today}|${quizKey}|${openSalt}`);
    rememberGenItems(batch);
    return batch;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, state.level, quizKey, openSalt]);
  const examItems = useMemo(() => {
    // Level-aware reading: your band and below (C1+ unlocks the full exam
    // arena incl. TOEIC/TOEFL/IELTS). Seeded rotation, fresh per deal.
    const lv = state.level ?? "A1";
    const rank = CEFR_ORDER.indexOf(lv);
    const pool = ALL_ITEMS.filter(
      (i) => i.skill === "reading" && (rank >= 4 || CEFR_ORDER.indexOf(i.level) <= rank),
    );
    const reading = pool.length > 0 ? pool : ALL_ITEMS.filter((i) => i.skill === "reading");
    if (reading.length === 0) return fullLesson.slice(0, 5);
    const start = hashStr(`exam|${today}|${quizKey}|${openSalt}`) % Math.max(1, reading.length);
    const out: BankItem[] = [];
    for (let k = 0; k < Math.min(5, reading.length); k++)
      out.push(reading[(start + k) % reading.length]);
    return out;
  }, [today, fullLesson, quizKey, openSalt, state.level]);
  const [endlessRound, setEndlessRound] = useState(() => {
    // Resume this device's endless run across panel reopens.
    try {
      if (typeof localStorage === "undefined") return 0;
      const raw = localStorage.getItem("canary-endless-round");
      const n = raw ? parseInt(raw, 10) : 0;
      return Number.isFinite(n) && n >= 0 && n < 1000000 ? n : 0;
    } catch {
      return 0;
    }
  });
  const [aiQuiz, setAiQuiz] = useState<BankItem[] | null>(null);
  // English-first quiz: EN-definition choices at B1+ (auto), KO hint on tap.
  const [choiceMode, setChoiceModeState] = useState<ChoiceMode>(() => {
    try {
      return loadChoiceMode();
    } catch {
      return "auto";
    }
  });
  useEffect(() => {
    try {
      setChoiceMode(loadChoiceMode());
    } catch {
      // default stands
    }
    void loadEnDef().then((d) => {
      setEnDefDict(d);
      setQuizKey((k) => k + 1); // regenerate with definitions in play
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const endlessBatch = useMemo(() => {
    // 6 generated + 4 spelling, seeded-shuffled together, seen stay out.
    const lv = state.level ?? "A1";
    const seen = loadSeen();
    const batch = [
      ...genBatch(lv, 6, seen, `${today}|endless|${endlessRound}|${quizKey}|g`),
      ...spellBatch(lv, (bulkWords?.[lv] ?? []), 4, seen, `${today}|endless|${endlessRound}|${quizKey}|s`),
    ];
    const mixed = [...batch].sort(
      (a, b) => hashStr(`${today}|mix|${endlessRound}|${quizKey}|${a.id}`) - hashStr(`${today}|mix|${endlessRound}|${quizKey}|${b.id}`),
    );
    rememberGenItems(mixed);
    return mixed;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, state.level, endlessRound, quizKey, bulkWords]);
  const quizItems = quizMode === "full" ? fullLesson : quizMode === "exam" ? examItems : quizMode === "endless" ? endlessBatch : aiQuiz ?? lesson;
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
      // Idiom SRS cards live as `idiom:<id>` — convert back to quiz items
      // (curated + bulk pools share the namespace; curated wins ties).
      if (w.startsWith("idiom:")) {
        const key = w.slice("idiom:".length);
        const it = idiomById(key) ?? bulkIdioms.find((b) => b.id === key) ?? null;
        if (it) out.push(idiomToBankItem(it) as unknown as BankItem);
        continue;
      }
      // Generated + AI + spelling + listening + error-drill cards resolve via
      // session cache (error drills are re-registered from the profile on mount).
      if (
        w.startsWith("gen:") ||
        w.startsWith("ai:") ||
        w.startsWith("spell:") ||
        w.startsWith("listen:") ||
        w.startsWith("err:")
      ) {
        const it = lookupGenWord(w);
        if (it) out.push(it);
      }
    }
    return out.slice(0, 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, today, reviewKey]);
  /** recordAnswers + adaptive rolling buffer (last-20 accuracy for level tips).
   *  `lesson: false` for per-item commits (one listen question, one idiom try) —
   *  a "lesson" is a finished session, not a tap. */
  const commitAnswers = (prev: LearnState, results: AnswerResult[], day: string, lesson = true): LearnState => {
    try {
      pushRecent(results.map((r) => r.correct));
    } catch {
      // buffer is best-effort
    }
    return recordAnswers(prev, results, day, { lesson });
  };
  const finishReview = (results: AnswerResult[]) => {
    if (results.length > 0) markSeen(results.map((r) => r.item.id));
    setState((prev) => commitAnswers(prev, results, today));
    setReviewKey((k) => k + 1);
  };
  // ---- Structured error profile: mistakes in the learner's own sentences
  // become an error radar (Me tab) and drillable ones become SRS cards, so
  // review targets yesterday's actual slips.
  const [errorProfile, setErrorProfile] = useState<ErrorProfile>(emptyErrorProfile);
  useEffect(() => {
    setErrorProfile(loadErrorProfile());
  }, []);
  const errorDrillItems = useMemo(
    () => (errorProfile.recent.length > 0 ? errorDrills(errorProfile, state.level) : []),
    [errorProfile, state.level],
  );
  useEffect(() => {
    if (errorDrillItems.length > 0) rememberGenItems(errorDrillItems);
  }, [errorDrillItems]);
  /** Record deterministic errors from learner text + queue drills for review. */
  const recordTextErrors = (text: string, level: CEFR | null) => {
    const found = detectErrors(text);
    if (found.length === 0) return;
    const next = recordErrors(errorProfile, found, today);
    if (next === errorProfile) return;
    setErrorProfile(next);
    saveErrorProfile(next);
    const drills = found
      .map((e) => drillItemFor(e, level))
      .filter((x): x is BankItem => x !== null);
    if (drills.length > 0) {
      setState((prev) =>
        commitAnswers(prev, drills.map((item) => ({ item, correct: false })), today, false),
      );
    }
  };
  const unlocked = useMemo(() => unlockedFor([...IDIOMS, ...bulkIdioms], state.level), [state.level, bulkIdioms]);
  const locked = useMemo(() => nextLocked([...IDIOMS, ...bulkIdioms], state.level), [state.level, bulkIdioms]);
  const idiom = useMemo(() => {
    if (shownId) {
      const found = unlocked.find((i) => i.id === shownId);
      if (found) return found;
    }
    return pickOfDay(today, unlocked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, state.level, shownId]);
  const leeches = useMemo(() => leechWords(state).slice(0, 6), [state]);
  const poolTotal = useMemo(() => {
    const lv = state.level ?? "A1";
    return (
      genPoolSize(lv) +
      ALL_ITEMS.filter((i) => i.level === lv).length +
      unlocked.length +
      (bulkWords?.[lv] ?? []).length
    );
  }, [state.level, unlocked]);
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
    setTryChips(false);
    setAiAnswer(null);
    setAiLabel("");
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
    if (results.length === 0) return; // replay Done carries nothing
    markSeen(results.map((r) => r.item.id));
    // Band-gated: highest band with ≥2/3 — guess-resistant and forgiving.
    const report = scorePlacementDetailed(
      results.map((r) => ({ level: r.item.level })),
      results.map((r) => r.correct),
    );
    setState((prev) => setLevel(commitAnswers(prev, results, today), report.level));
    celebrate(report.level);
    if (!report.confident) {
      try {
        toast(`Level set to ${report.level} — your band mix was spiky. Retest anytime from Assess.`);
      } catch {
        // toast is best-effort
      }
    }
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
    recordTextErrors(essayText, essayTopic.level);
    setState((prev) =>
      commitAnswers(
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
      const next = commitAnswers(prev, results, today);
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
    // Endless mode chains rounds instead of leaving for the Me tab.
    if (quizMode === "endless") {
      setEndlessRound((r) => {
        const next = r + 1;
        try {
          if (typeof localStorage !== "undefined")
            localStorage.setItem("canary-endless-round", String(next));
        } catch {
          // best-effort
        }
        return next;
      });
    }
    else setTab("me");
  };

  const shuffleIdiom = () => {
    const pool = unlocked.filter((i) => i.id !== idiom?.id);
    if (pool.length === 0) return;
    const next = pool[Math.floor(Math.random() * pool.length)];
    setShownId(next.id);
    setRevealed(false);
    setTryText("");
    setTryState(null);
    setAiAnswer(null); // verdicts belong to the previous idiom
    setAiLabel("");
  };

  // ---- phrasebook + direct-AI state ----
  const [bookQuery, setBookQuery] = useState("");
  const [bookFilter, setBookFilter] = useState<"all" | "work-safe" | "neutral" | "casual">("all");
  const [bookOpen, setBookOpen] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiLabel, setAiLabel] = useState<string>("");

  // ---- personalized path (goal shapes idioms, targets, coaching) ----
  const [path, setPath] = useState<Goal>(() => {
    try {
      return loadPath();
    } catch {
      return "general";
    }
  });
  const pickPath = (g: Goal) => {
    setPath(g);
    try {
      savePath(g);
    } catch {
      // best-effort
    }
  };
  const pathByIdSafe = pathById;

  // ---- flashcards (Quizlet-style custom cards + modes) ----
  const [flash, setFlash] = useState<FlashCard[]>(() => {
    try {
      return loadCards();
    } catch {
      return [];
    }
  });
  const [flashMode, setFlashMode] = useState<FlashMode>("flip");
  // Random start per panel open (all usages already modulo deck length) —
  // otherwise flip/write always open on the first card.
  const [flipIdx, setFlipIdx] = useState(() => Math.floor(Math.random() * 1e9));
  const [flipped, setFlipped] = useState(false);
  const [newTerm, setNewTerm] = useState("");
  const [newMeaning, setNewMeaning] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [matchSeed, setMatchSeed] = useState(1);
  const [matchPicked, setMatchPicked] = useState<Record<number, number>>({});
  const [writeIdx, setWriteIdx] = useState(() => Math.floor(Math.random() * 1e9));
  const [writeText, setWriteText] = useState("");
  const [writeResult, setWriteResult] = useState<null | boolean>(null);
  const persistFlash = (next: FlashCard[]) => {
    setFlash(next);
    try {
      saveCards(next);
    } catch {
      // best-effort
    }
  };
  const bonus = (n: number) => {
    if (n <= 0) return;
    setState((prev) => awardXP(prev, n, today));
  };
  /**
   * Anti-farming gate for repeatable bonus XP (card +2, match +2 …): each key
   * pays once per calendar day (rule lives in gateBonusOnce, pure + tested).
   * Best-effort: if storage is unavailable we still award (never punish study).
   */
  const gateBonus = (key: string, n: number): boolean => {
    let fresh = true;
    try {
      const raw = localStorage.getItem("canary-xp-gates");
      const gates = raw ? (JSON.parse(raw) as BonusGates) : {};
      const res = gateBonusOnce(gates, today, key);
      fresh = res.fresh;
      if (res.fresh) localStorage.setItem("canary-xp-gates", JSON.stringify(res.next));
    } catch {
      // storage blocked — award anyway
    }
    if (fresh) bonus(n);
    return fresh;
  };

  /** Save a card from a non-cards tab and pay the once-a-day +2 XP. */
  const saveToDeck = (term: string, meaning: string, source: string): boolean => {
    persistFlash(addCard(flash, term, meaning, source));
    const paid = gateBonus(`card:${term.toLowerCase()}`, 2);
    try {
      toast(paid ? "Card saved 🗂️ +2 XP" : "Card saved 🗂️");
    } catch {
      // best-effort
    }
    return paid;
  };

  // ---- style lab (AI-powered tone/style feedback) ----
  const [styleText, setStyleText] = useState("");
  const [styleChecked, setStyleChecked] = useState(false);
  const styleMetric = useMemo(() => analyzeStyle(styleText), [styleText]);
  const styleTips = useMemo(
    () => (styleChecked ? styleFindings(styleMetric, state.level, path) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [styleChecked, styleText, state.level, path],
  );

  // ---- portfolio (showcase + share) ----
  const [folio, setFolio] = useState<PortfolioEntry[]>(() => {
    try {
      return loadPortfolio();
    } catch {
      return [];
    }
  });
  const persistFolio = (next: PortfolioEntry[]) => {
    setFolio(next);
    try {
      savePortfolio(next);
    } catch {
      // best-effort
    }
  };
  // Auto-shelf passed essays into the portfolio (once per graded text).
  const folioSavedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!essayResult?.pass || !essayText.trim()) return;
    const key = `${essayTopic.id}|${essayResult.total}|${essayText.length}`;
    if (folioSavedKey.current === key) return;
    folioSavedKey.current = key;
    persistFolio(
      addEntry(
        loadPortfolio(),
        "essay",
        essayTopic.topic.slice(0, 60),
        essayText.trim().slice(0, 2000),
        `${essayResult.total}/100 · ${essayTopic.level}`,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [essayResult]);
  const proofMd = () => exportProofSheet(buildProofEvidence(state, folio, loadPronounceStats(), today));
  const downloadMd = (name: string, md: string) => {
    try {
      const blob = new Blob([md], { type: "text/markdown" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch {
      // best-effort
    }
  };

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

  // ---- AI Fresh Set: model-written questions (parsed + validated JSON) ----
  const [aiFreshMsg, setAiFreshMsg] = useState<string | null>(null);
  const makeAiFreshSet = () => {
    if (aiBusy) return;
    setAiQuiz(null);
    if (!modelReady || !onAskAI) {
      setAiFreshMsg("AI isn't ready — start the model, then try ✨");
      return;
    }
    const lv = state.level ?? "A1";
    setAiBusy(true);
    setAiFreshMsg("Asking AI for 5 fresh questions…");
    void onAskAI(buildFreshSetPrompt(lv, path, loadSeen().slice(0, 12)))
      .then((out) => {
        const items = out ? parseAiItems(out, lv) : [];
        if (items.length > 0) {
          rememberGenItems(items);
          setAiQuiz(items);
          setAiFreshMsg(null);
        } else {
          setAiFreshMsg("AI rambled instead of JSON — try again ✨");
        }
      })
      .catch(() => setAiFreshMsg("AI hiccup — try again ✨"))
      .finally(() => setAiBusy(false));
  };

  // ---- 👂 Listen lab (dictation + comprehension + shadowing) ----
  const [listenMode, setListenMode] = useState<ListenMode | "shadow">("dictate-word");
  const [listenRound, setListenRound] = useState(0);
  const [listenIdx, setListenIdx] = useState(0);
  const [listenTyped, setListenTyped] = useState("");
  const [listenChecked, setListenChecked] = useState<null | boolean>(null);
  const [listenScored, setListenScored] = useState<string[]>([]);
  const listenBatchMode: ListenMode = listenMode === "shadow" ? "dictate-sent" : listenMode;
  const listenItems: ListenItem[] = useMemo(() => {
    const batch = listenBatch(
      state.level ?? "A1",
      bulkWords?.[state.level ?? "A1"] ?? [],
      listenBatchMode,
      5,
      loadSeen(),
      `${today}|listen|${listenBatchMode}|${listenRound}|${quizKey}|${openSalt}`,
    );
    rememberGenItems(batch);
    return batch;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, state.level, listenBatchMode, listenRound, quizKey, openSalt, bulkWords]);
  const listenItem = listenItems[listenIdx % Math.max(1, listenItems.length)];
  useEffect(() => {
    setListenIdx(0);
    setListenTyped("");
    setListenChecked(null);
    setListenScored([]);
  }, [listenBatchMode, listenRound, today, state.level]);
  // Best-effort autoplay on each new clip (browsers may require a tap).
  useEffect(() => {
    if (tab === "listen" && listenItem) {
      const tmr = setTimeout(() => speakText(listenItem.audio), 350);
      return () => clearTimeout(tmr);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, listenIdx, listenBatchMode, listenRound]);
  const commitListen = (item: ListenItem, correct: boolean) => {
    markSeen([item.id]);
    setState((prev) => commitAnswers(prev, [{ item, correct }], today, false));
  };
  const checkListenFill = () => {
    if (!listenItem || listenChecked !== null || !listenTyped.trim()) return;
    const ok = gradeHeard(listenTyped, listenItem.accept ?? []);
    setListenChecked(ok);
    commitListen(listenItem, ok);
  };
  const checkListenChoice = (picked: number) => {
    if (!listenItem || listenChecked !== null) return;
    const ok = picked === listenItem.answerIndex;
    setListenChecked(ok);
    commitListen(listenItem, ok);
  };
  const scoreShadow = (rate: number) => {
    if (!listenItem || listenScored.includes(listenItem.id)) return;
    setListenScored((prev) => [...prev, listenItem.id]);
    const ok = rate >= 0.5;
    setListenChecked(ok);
    commitListen(listenItem, ok);
    gateBonus(`shadow:${listenItem.id}`, ok ? 6 : 2);
  };
  const nextListen = () => {
    if (listenIdx + 1 >= listenItems.length) {
      // A full round (every item answered) is one lesson.
      setState((prev) => addLesson(prev, today));
      setListenRound((r) => r + 1);
    } else setListenIdx((i) => i + 1);
    setListenTyped("");
    setListenChecked(null);
  };

  const submitTry = () => {
    if (!idiom || tryState !== null || !tryText.trim()) return;
    setAiAnswer(null); // a new attempt invalidates any previous verdict
    setAiLabel("");
    // Profile every real attempt (even keyword-miss ones): the error radar
    // and tomorrow's drills come from the learner's actual sentences.
    recordTextErrors(tryText, idiom.unlock);
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
        commitAnswers(
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
          false,
        ),
      );
      return;
    }
    setTryState("good");
    setState((prev) =>
      commitAnswers(
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
        false,
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

  /** B: throw the fresh expression + MY sentence into main chat. */
  const sendIdiomToChat = () => {
    if (!idiom) return;
    const msg = buildHandoffMessage(idiom.term, idiom.meaning, tryText);
    if (onSendToChat) {
      onSendToChat(msg, { term: idiom.term, meaning: idiom.meaning });
      return;
    }
    try {
      localStorage.setItem(USEIT_DRAFT_KEY, msg);
      toast("Saved — open Chat and it lands in your composer 💬");
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
        position: fullScreen ? "absolute" : "fixed",
        top: 0, right: 0, bottom: 0,
        width: fullScreen ? "auto" : "min(400px, 94vw)",
        left: fullScreen ? 0 : undefined,
        zIndex: 1500, background: "var(--bg)", color: "var(--text)",
        borderLeft: fullScreen ? "none" : "1px solid var(--border)",
        boxShadow: fullScreen ? "none" : "-12px 0 32px rgba(0,0,0,0.18)",
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
        <a className="sidebar-btn small" href={`/learn?tab=${tab}`} style={{ width: "auto" }} title="Open full screen">⤢</a>
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

      <div style={{ padding: "10px 12px 0", display: "flex", flexDirection: "column", gap: 4 }}>
        {TAB_GROUPS.map((g) => {
          const isActiveGroup = g.tabs.includes(tab);
          const isCollapsed = !isActiveGroup && collapsedGroups[g.label] !== false;
          return (
            <div key={g.label}>
              <button
                className="sidebar-btn small"
                onClick={() => setCollapsedGroups((prev) => ({ ...prev, [g.label]: !isCollapsed }))}
                style={{
                  width: "100%",
                  justifyContent: "flex-start",
                  fontSize: 12,
                  fontWeight: 700,
                  opacity: isActiveGroup ? 1 : 0.7,
                  padding: "6px 10px",
                }}
              >
                {g.icon} {g.label} {isCollapsed ? "▸" : "▾"}
              </button>
              {!isCollapsed ? (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", padding: "4px 0 0 12px" }}>
                  {g.tabs.map((id) => (
                    <button
                      key={id}
                      className={`sidebar-btn small${tab === id ? " secondary" : ""}`}
                      onClick={() => { setTab(id); setGateMode("menu"); setAiAnswer(null); }}
                      style={{ padding: "6px 10px", fontSize: 12 }}
                    >
                      {tabLabel(id, L, flash.length, reviewItems.length)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {tab === "quiz" ? (
          <>
            {reviewItems.length > 0 ? (
              <button className="sidebar-btn small" onClick={() => setTab("review")} style={{ textAlign: "center" }}>
                🔁 {reviewItems.length} word{reviewItems.length === 1 ? " is" : "s are"} due — review first?
              </button>
            ) : null}
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {(["quick", "full", "exam", "endless"] as QuizMode[]).map((m) => (
                <button
                  key={m}
                  className={`sidebar-btn small${quizMode === m && !aiQuiz ? " secondary" : ""}`}
                  onClick={() => { setQuizMode(m); setAiQuiz(null); setAiFreshMsg(null); }}
                  style={{ width: "auto", fontSize: 12 }}
                  title={m === "quick" ? "5 at-level" : m === "full" ? "Full 10 (warm-up + reach)" : m === "exam" ? "Exam reading passages" : "Never-ending fresh questions"}
                >
                  {m === "quick" ? "⚡ Quick 5" : m === "full" ? "📚 Full 10" : m === "exam" ? "🏆 Exam" : "🔁 Endless"}
                </button>
              ))}
              <span style={{ flex: 1 }} />
              <button className="sidebar-btn small" onClick={() => { setQuizKey((k) => k + 1); setAiQuiz(null); }} style={{ width: "auto" }} title="Deal a fresh set">
                🎲
              </button>
            </div>
            <p style={{ fontSize: 12, opacity: 0.75, margin: 0 }}>
              {aiQuiz ? `✨ AI-made set (${aiQuiz.length} questions) — same XP, zero repeats.` : quizMode === "quick" ? "5 fresh ones every visit — same XP as the full lesson." : quizMode === "full" ? "Full lesson: 3 warm-up + 5 at-level + 2 stretch." : quizMode === "exam" ? ((state.level ?? "A1") === "C1" || (state.level ?? "A1") === "C2" ? "Exam arena: TOEIC / TOEFL / IELTS-style reading." : `Reading at your level (${examItems.length} passages) — reach C1 for the exam arena.`) : `🔁 Endless: fresh from ~${poolTotal.toLocaleString()} questions at ${state.level ?? "A1"} (bank + generated + spelling + phrases) — seen ones stay out.`}
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button
                className="sidebar-btn small"
                style={{ width: "auto", fontSize: 12 }}
                disabled={aiBusy}
                title={modelReady ? "Ask the AI for 5 brand-new questions" : "Start the AI model first"}
                onClick={makeAiFreshSet}
              >
                {aiBusy ? "…" : "✨ AI Fresh 5"}
              </button>
              {(["auto", "en", "ko"] as ChoiceMode[]).map((m) => (
                <button
                  key={m}
                  className={`sidebar-btn small${choiceMode === m ? " secondary" : ""}`}
                  style={{ width: "auto", fontSize: 12 }}
                  title={m === "auto" ? "KO choices at A1/A2, English definitions at B1+" : m === "en" ? "Always English-definition choices" : "Always Korean choices"}
                  onClick={() => {
                    setChoiceModeState(m);
                    try {
                      saveChoiceMode(m);
                    } catch {
                      // best-effort
                    }
                    setChoiceMode(m);
                    setQuizKey((k) => k + 1);
                  }}
                >
                  {m === "auto" ? "🌐 Auto" : m === "en" ? "🇬🇧 EN" : "🇰🇷 KO"}
                </button>
              ))}
              {aiQuiz ? (
                <button className="sidebar-btn small" style={{ width: "auto", fontSize: 12 }} onClick={() => setAiQuiz(null)}>
                  ← Back to bank sets
                </button>
              ) : null}
            </div>
            {aiFreshMsg ? (
              <div style={{ fontSize: 12, opacity: 0.8 }}>{aiFreshMsg}</div>
            ) : null}
            <QuizCard key={`q-${quizKey}-${quizMode}-r${endlessRound}-o${openSalt}${aiQuiz ? "-ai" : ""}`} items={quizItems} cta={L("lnRecord", "Record →")} onDone={finishQuiz} useIt={{ onAskAI, modelReady, onSendToChat }} />
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
                  {idiom.example ? (
                    <>✍️ <i>"{idiom.example}"</i></>
                  ) : (
                    <>✍️ <i>{idiom.meaning}</i></>
                  )}
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
                <button
                  className="sidebar-btn small"
                  onClick={() => setTryChips((v) => !v)}
                  disabled={tryState !== null}
                  style={{ width: "auto" }}
                  title="Sentence starters"
                >
                  🧩
                </button>
              </div>
              {tryChips && tryState === null ? (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <button
                    className="sidebar-btn small"
                    style={{ width: "auto", fontSize: 12 }}
                    onClick={() => setTryText((prev) => (prev.trim() ? `${prev.trimEnd()} "${idiom.term}"` : `"${idiom.term}"`))}
                  >
                    ＋"{idiom.term.length > 18 ? idiom.term.slice(0, 18) + "…" : idiom.term}"
                  </button>
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      className="sidebar-btn small"
                      style={{ width: "auto", fontSize: 12 }}
                      onClick={() => setTryText((prev) => (prev.trim() ? `${prev.trimEnd()} ${s}` : s))}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              ) : null}
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
                      className="sidebar-btn small primary"
                      style={{ width: "auto", textAlign: "center" }}
                      onClick={sendIdiomToChat}
                      title={onSendToChat ? "Continue with this sentence in main chat" : "Save for main chat"}
                    >
                      💬 Use in chat →
                    </button>
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
            {unitNow && quizMode !== "exam" && !aiQuiz ? (
              <div style={{ fontSize: 12, opacity: 0.85, borderLeft: "3px solid var(--green)", paddingLeft: 8 }}>
                <b>Unit {unitNow.index + 1}/{unitNow.total} · {unitNow.unit.title}</b>{" "}
                <span style={{ opacity: 0.7 }}>({unitNow.unit.ko})</span>
                <br />
                {unitNow.unit.focus} — <i>{unitNow.unit.canDo}</i>
              </div>
            ) : null}
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
              const list = orderIdiomsForPath(
                unlocked.filter(
                  (i) =>
                    (bookFilter === "all" || i.register === bookFilter) &&
                    (!q || `${i.term} ${i.meaning} ${i.ko}`.toLowerCase().includes(q)),
                ),
                path,
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
                        <span style={{ fontSize: 13 }}>{i.meaning}{i.ko ? ` (${i.ko})` : ""}</span>
                      </button>
                      {bookOpen === i.id ? (
                        <div style={{ fontSize: 13, marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                          {i.example ? <i>"{i.example}"</i> : null}
                          {(() => {
                            const [a, b] = dialogueFor(i);
                            return <span style={{ opacity: 0.9 }}>💬 {a}<br />💬 {b}</span>;
                          })()}
                          {i.caution ? <span>⚠️ {i.caution}</span> : null}
                          <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <button className="sidebar-btn small" style={{ width: "auto", fontSize: 12 }} onClick={() => speakText(i.example ? `${i.term}. ${i.example}` : `${i.term} means ${i.meaning}`)}>🔊 Listen</button>
                            <button
                              className="sidebar-btn small"
                              style={{ width: "auto", fontSize: 12 }}
                              onClick={() => { setShownId(i.id); setTab("idiom"); setRevealed(true); setAiAnswer(null); setAiLabel(""); }}
                            >
                              ✍️ Practice →
                            </button>
                            <button
                              className="sidebar-btn small"
                              style={{ width: "auto", fontSize: 12 }}
                              onClick={() => {
                                persistFlash(addCard(flash, i.term, `${i.meaning}${i.ko ? ` (${i.ko})` : ""}`, `phrase:${i.id}`));
                                gateBonus(`card:${i.term.toLowerCase()}`, 2);
                                try {
                                  toast("Card saved 🗂️ +2 XP");
                                } catch {
                                  // best-effort
                                }
                              }}
                            >
                              🗂️ +Card
                            </button>
                          </span>
                          <UseItBox
                            key={`book-${i.id}`}
                            term={i.term}
                            meaning={i.meaning}
                            example={i.example || undefined}
                            compact
                            bridge={{ onAskAI, modelReady, onSendToChat }}
                          />
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

        {tab === "read" ? (
          <ReadBox
            level={state.level}
            cards={flash}
            onSaveWord={(term, meaning) => saveToDeck(term, meaning, "read")}
            onFinish={() => gateBonus("read:finish", 3)}
            onSpeak={speakText}
          />
        ) : null}

        {tab === "say" ? (
          <PronounceBox
            level={state.level}
            today={today}
            onPass={(pairId) => gateBonus(`pron:${pairId}`, 2)}
            onSpeak={(text, rate) => speakText(text, rate)}
          />
        ) : null}

        {tab === "work" ? (
          <CareerBox
            level={state.level}
            today={today}
            cards={flash}
            onSaveWord={(term, meaning) => saveToDeck(term, meaning, "work")}
            onPractice={() => gateBonus("career:interview", 3)}
            onSendToChat={onSendToChat}
            onSpeak={speakText}
          />
        ) : null}

        {tab === "cards" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(["flip", "match", "write"] as FlashMode[]).map((m) => (
                <button
                  key={m}
                  className={`sidebar-btn small${flashMode === m ? " secondary" : ""}`}
                  onClick={() => setFlashMode(m)}
                  style={{ width: "auto", fontSize: 12 }}
                >
                  {m === "flip" ? "🔄 Flip" : m === "match" ? "🧩 Match" : "✍️ Write"}
                </button>
              ))}
            </div>
            {/* Vocabulary builder: mine words from your own files/text */}
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>⛏️ Vocabulary builder — from YOUR files</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Paste a paragraph or file excerpt. We mine the meaty words — tap + to make cards.</div>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste article / essay / notes excerpt here…"
                rows={3}
                style={{ width: "100%", boxSizing: "border-box", padding: 8, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, resize: "vertical" }}
              />
              {pasteText.trim() ? (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {extractWordsFromText(pasteText, 8).map((w) => (
                    <button
                      key={w.word}
                      className="sidebar-btn small"
                      style={{ width: "auto", fontSize: 12 }}
                      title={`${w.count}× in your text — add as card (look the meaning up or ask AI)`}
                      onClick={() => {
                        persistFlash(addCard(flash, w.word, "— look up & edit —", "mined:text"));
                        gateBonus(`card:${w.word.toLowerCase()}`, 2);
                      }}
                    >
                      + {w.word}{w.count > 1 ? ` ×${w.count}` : ""}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {/* Add-your-own card */}
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={newTerm}
                onChange={(e) => setNewTerm(e.target.value)}
                placeholder="Term (e.g. meticulous)"
                style={{ flex: 1, minWidth: 0, padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
              />
              <input
                value={newMeaning}
                onChange={(e) => setNewMeaning(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newTerm.trim() && newMeaning.trim()) {
                    const t = newTerm.trim().toLowerCase();
                    persistFlash(addCard(flash, newTerm, newMeaning, "custom"));
                    setNewTerm("");
                    setNewMeaning("");
                    gateBonus(`card:${t}`, 2);
                  }
                }}
                placeholder="Meaning"
                style={{ flex: 1, minWidth: 0, padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
              />
              <button
                className="sidebar-btn small primary"
                style={{ width: "auto" }}
                disabled={!newTerm.trim() || !newMeaning.trim()}
                onClick={() => {
                  const t = newTerm.trim().toLowerCase();
                  persistFlash(addCard(flash, newTerm, newMeaning, "custom"));
                  setNewTerm("");
                  setNewMeaning("");
                  gateBonus(`card:${t}`, 2);
                }}
              >
                +
              </button>
            </div>
            {flash.length === 0 ? (
              <p style={{ fontSize: 13, opacity: 0.75 }}>No cards yet — mine words above, + from the Book 📖, or type your own. Each new card pays +2 XP (once a day per word). 🗂️</p>
            ) : flashMode === "flip" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>{flipIdx + 1} / {flash.length}</div>
                <button
                  onClick={() => setFlipped((v) => !v)}
                  style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 20, background: "var(--bg)", color: "var(--text)", cursor: "pointer", minHeight: 120 }}
                >
                  <div style={{ fontSize: 11, opacity: 0.6 }}>{flipped ? "meaning — tap to flip back" : "term — tap to reveal"}</div>
                  <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>
                    {flipped ? flash[flipIdx % flash.length].meaning : flash[flipIdx % flash.length].term}
                  </div>
                  {!flipped && flash[flipIdx % flash.length].source ? (
                    <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>from {flash[flipIdx % flash.length].source}</div>
                  ) : null}
                </button>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="sidebar-btn small" style={{ flex: 1 }} onClick={() => { setFlipIdx((i) => (i + 1) % flash.length); setFlipped(false); }}>Next →</button>
                  <button className="sidebar-btn small" style={{ width: "auto" }} onClick={() => speakText(`${flash[flipIdx % flash.length].term}. ${flash[flipIdx % flash.length].meaning}`)}>🔊</button>
                  <button
                    className="sidebar-btn small"
                    style={{ width: "auto" }}
                    onClick={() => {
                      const cur = flash[flipIdx % flash.length];
                      persistFlash(removeCard(flash, cur.id));
                      setFlipIdx(0);
                      setFlipped(false);
                    }}
                  >
                    🗑️
                  </button>
                </div>
                <UseItBox
                  key={`flip-${flash[flipIdx % flash.length].id}`}
                  term={flash[flipIdx % flash.length].term}
                  meaning={flash[flipIdx % flash.length].meaning}
                  compact
                  bridge={{ onAskAI, modelReady, onSendToChat }}
                />
              </div>
            ) : flashMode === "match" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {flash.length < 2 ? (
                  <p style={{ fontSize: 13, opacity: 0.75 }}>Add 2+ cards to play Match 🧩</p>
                ) : (
                  <>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ flex: 1, fontSize: 12, opacity: 0.7 }}>Pick each meaning — +2 XP the first time each day.</span>
                      <button className="sidebar-btn small" style={{ width: "auto" }} onClick={() => { setMatchSeed((s) => s + 1); setMatchPicked({}); }}>🎲</button>
                    </div>
                    {buildMatchRound(flash, `${today}|${matchSeed}|${openSalt}`, 5).map((q, qi) => (
                      <div key={`${matchSeed}-${openSalt}-${qi}`} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 8 }}>
                        <div style={{ fontWeight: 800 }}>{q.term}</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                          {q.choices.map((c, ci) => {
                            const picked = matchPicked[qi];
                            const done = picked !== undefined;
                            const right = ci === q.answerIndex;
                            return (
                              <button
                                key={ci}
                                className="sidebar-btn small"
                                disabled={done}
                                onClick={() => {
                                  setMatchPicked((p) => ({ ...p, [qi]: ci }));
                                  if (ci === q.answerIndex) gateBonus(`match:${q.term.toLowerCase()}`, 2);
                                }}
                                style={{
                                  textAlign: "left",
                                  borderColor: done && right ? "var(--green)" : undefined,
                                  opacity: done && !right && picked === ci ? 0.6 : 1,
                                }}
                              >
                                {c}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {flash.length === 0 ? null : (
                  <>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Card {writeIdx + 1} / {flash.length} — type the TERM for:</div>
                    <div style={{ fontSize: 17, fontWeight: 800 }}>{flash[writeIdx % flash.length].meaning}</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        value={writeText}
                        onChange={(e) => { setWriteText(e.target.value); setWriteResult(null); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && writeText.trim()) {
                            const ok = gradeWrite(writeText, flash[writeIdx % flash.length].term);
                            setWriteResult(ok);
                            if (ok) gateBonus(`write:${flash[writeIdx % flash.length].term.toLowerCase()}`, 2);
                          }
                        }}
                        placeholder="Type the term…"
                        style={{ flex: 1, minWidth: 0, padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                      />
                      <button
                        className="sidebar-btn small"
                        onClick={() => {
                          if (!writeText.trim()) return;
                          const ok = gradeWrite(writeText, flash[writeIdx % flash.length].term);
                          setWriteResult(ok);
                          if (ok) gateBonus(`write:${flash[writeIdx % flash.length].term.toLowerCase()}`, 2);
                        }}
                      >
                        Check
                      </button>
                    </div>
                    {writeResult !== null ? (
                      <div style={{ fontSize: 13, background: "var(--border)", borderRadius: 6, padding: 8 }}>
                        {writeResult ? "✅ Exactly — nice!" : `💪 Answer: "${flash[writeIdx % flash.length].term}"`}
                        <div style={{ marginTop: 6 }}>
                          <button className="sidebar-btn small primary" onClick={() => { setWriteIdx((i) => (i + 1) % flash.length); setWriteText(""); setWriteResult(null); }}>Next →</button>
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            )}
          </div>
        ) : null}

        {tab === "listen" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(["dictate-word", "dictate-sent", "comprehend", "shadow"] as const).map((m) => (
                <button
                  key={m}
                  className={`sidebar-btn small${listenMode === m ? " secondary" : ""}`}
                  onClick={() => setListenMode(m)}
                  style={{ width: "auto", fontSize: 12 }}
                >
                  {m === "dictate-word" ? "✍️ Words" : m === "dictate-sent" ? "📝 Sentences" : m === "comprehend" ? "🧠 Quiz" : "🗣️ Shadow"}
                </button>
              ))}
              <span style={{ flex: 1 }} />
              <button className="sidebar-btn small" onClick={() => setListenRound((r) => r + 1)} style={{ width: "auto" }} title="Fresh set">
                🎲
              </button>
            </div>
            {!listenItem ? (
              <p style={{ fontSize: 13, opacity: 0.75 }}>No clips — try another mode.</p>
            ) : (
              <>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  Clip {listenIdx + 1} / {listenItems.length} · {listenItem.skill} · {listenItem.level}
                </div>
                {listenMode === "shadow" ? (
                  <ShadowBox
                    key={listenItem.id}
                    sentence={listenItem.audio}
                    onSpeak={(rate) => speakText(listenItem.audio, rate)}
                    onScore={scoreShadow}
                  />
                ) : (
                  <>
                    <button
                      className="sidebar-btn small primary"
                      onClick={() => speakText(listenItem.audio)}
                      style={{ padding: "14px", fontSize: 15 }}
                    >
                      🔊 Play it{listenMode === "comprehend" ? " — then answer" : " — type what you hear"}
                    </button>
                    {listenItem.kind === "choice" ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {(listenItem.choices ?? []).map((c, ci) => (
                          <button
                            key={ci}
                            className="sidebar-btn small"
                            disabled={listenChecked !== null}
                            onClick={() => checkListenChoice(ci)}
                            style={{
                              textAlign: "left",
                              borderColor: listenChecked !== null && ci === listenItem.answerIndex ? "var(--green)" : undefined,
                            }}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 6 }}>
                        <input
                          value={listenTyped}
                          onChange={(e) => { setListenTyped(e.target.value); setListenChecked(null); }}
                          onKeyDown={(e) => { if (e.key === "Enter") checkListenFill(); }}
                          placeholder="Type what you heard…"
                          disabled={listenChecked !== null}
                          style={{ flex: 1, minWidth: 0, padding: "10px 12px", fontSize: 16, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                        />
                        <button className="sidebar-btn small" onClick={checkListenFill} disabled={listenChecked !== null || !listenTyped.trim()}>
                          Check
                        </button>
                      </div>
                    )}
                  </>
                )}
                {listenChecked !== null && listenMode !== "shadow" ? (
                  <div style={{ fontSize: 13, background: "var(--border)", borderRadius: 6, padding: 8 }}>
                    {listenChecked ? "🌟 Nailed it! +10 XP" : `💪 Answer: "${listenItem.audio}" (+2 XP for trying)`}
                  </div>
                ) : null}
                <button className="sidebar-btn small primary" onClick={nextListen}>
                  {listenIdx + 1 >= listenItems.length ? "New set 🎲" : "Next →"}
                </button>
              </>
            )}
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
              <QuizCard key={`rv-${reviewKey}`} items={reviewItems} cta={L("lnRecord", "Record →")} onDone={finishReview} useIt={{ onAskAI, modelReady, onSendToChat }} srsGrades />
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
            <div style={{ fontSize: 12, opacity: 0.7 }}>💡 {essayTopic.hint} · {essayTopic.minWords}–{essayTopic.maxWords} words · {essayTopic.passMark ?? 80}+ pass</div>
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
                    {essayResult.pass ? "🎉 PASS!" : `💪 ${essayTopic.passMark ?? 80} to pass — retry!`}
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

        {tab === "style" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>✨ Style lab — tone + vocabulary at YOUR level</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Rule scan is instant and free; AI polish rewrites it keeping your ideas. Goal: <b>{pathByIdSafe(path).name}</b> · Level: <b>{state.level ?? "—"}</b></div>
            <textarea
              value={styleText}
              onChange={(e) => { setStyleText(e.target.value); setStyleChecked(false); }}
              placeholder="Paste a paragraph — email, essay, chat message…"
              rows={5}
              style={{ width: "100%", boxSizing: "border-box", padding: 10, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 14, lineHeight: 1.6, resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button className="sidebar-btn small primary" style={{ width: "auto" }} disabled={!styleText.trim()} onClick={() => { setStyleChecked(true); recordTextErrors(styleText, state.level); }}>
                🔍 Analyze (free)
              </button>
              <button
                className="sidebar-btn small"
                style={{ width: "auto" }}
                disabled={!styleText.trim() || aiBusy}
                onClick={() => {
                  const m = analyzeStyle(styleText);
                  const tips = styleFindings(m, state.level, path);
                  void askAiDirect("Style polish", buildStyleCoachPrompt(styleText, state.level, path, m, tips));
                }}
              >
                {aiBusy && aiLabel === "Style polish" ? "…" : modelReady ? "🤖 AI polish" : "💬 Draft for chat"}
              </button>
              <button
                className="sidebar-btn small"
                style={{ width: "auto" }}
                disabled={!styleText.trim()}
                onClick={() => {
                  persistFolio(addEntry(folio, "polish", styleText.slice(0, 40) + (styleText.length > 40 ? "…" : ""), styleText, `${state.level ?? "?"} · ${path}`));
                  const paid = gateBonus("folio:polish", 3);
                  try {
                    toast(paid ? "Saved to portfolio 💼 +3 XP" : "Saved to portfolio 💼");
                  } catch {
                    // best-effort
                  }
                }}
              >
                💼 Save
              </button>
            </div>
            {styleChecked ? (
              <div style={{ fontSize: 12, background: "var(--border)", borderRadius: 8, padding: 8, display: "flex", flexDirection: "column", gap: 3 }}>
                <div>📊 {styleMetric.words} words · {styleMetric.sentences} sentences · avg {styleMetric.avgSentenceLen} · tone {styleMetric.tone}</div>
                {styleTips.map((f, i) => (
                  <div key={i}>• {f.tip}</div>
                ))}
              </div>
            ) : null}
            {aiAnswer && aiLabel === "Style polish" ? (
              <div style={{ fontSize: 13, whiteSpace: "pre-wrap", background: "var(--border)", borderRadius: 8, padding: 10 }}>
                🤖 {aiAnswer}
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "folio" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>🎯 My path</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {PATHS.map((p) => (
                <button
                  key={p.id}
                  className={`sidebar-btn small${path === p.id ? " secondary" : ""}`}
                  onClick={() => pickPath(p.id)}
                  style={{ width: "auto", fontSize: 12 }}
                  title={`${p.ko} — ${p.blurb}`}
                >
                  {path === p.id ? "✓ " : ""}{p.name}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>{pathByIdSafe(path).blurb} Weekly target: {weeklyTarget(path)} XP.</div>
            <div style={{ fontSize: 13, fontWeight: 800 }}>🏁 This week's league</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {leagueTable(weekXp, today.slice(0, 7)).map((r, i) => (
                <div
                  key={r.name}
                  style={{
                    display: "flex", gap: 6, fontSize: 13, padding: "6px 8px", borderRadius: 6,
                    background: r.me ? "var(--green)" : "var(--border)", color: r.me ? "#fff" : "inherit",
                    fontWeight: r.me ? 800 : 400,
                  }}
                >
                  <span style={{ width: 22 }}>{i + 1}</span>
                  <span style={{ flex: 1 }}>{r.name}</span>
                  <span>{r.xp} XP</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>Your rivals are practice bots that pace you (they never improve) — your row is the real score. 🤖</div>
            <div style={{ fontSize: 13, fontWeight: 800 }}>💼 Portfolio ({folio.length})</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button
                className="sidebar-btn small"
                style={{ width: "auto", fontSize: 12 }}
                disabled={folio.length === 0}
                onClick={() => downloadMd(`english-portfolio-${today}.md`, exportPortfolioMd(folio, state.level, state.xp))}
              >
                ⬇️ Export .md
              </button>
              <button
                className="sidebar-btn small"
                style={{ width: "auto", fontSize: 12 }}
                disabled={folio.length === 0}
                onClick={() => {
                  try {
                    void navigator.clipboard?.writeText(exportPortfolioMd(folio, state.level, state.xp));
                    toast("Portfolio copied 📋");
                  } catch {
                    // clipboard unavailable
                  }
                }}
              >
                📋 Copy all
              </button>
              <button
                className="sidebar-btn small"
                style={{ width: "auto", fontSize: 12 }}
                title="One-page summary of level, streak, accuracy and portfolio — not an official certificate"
                onClick={() => downloadMd(`english-proof-${today}.md`, proofMd())}
              >
                🎓 Proof sheet .md
              </button>
              <button
                className="sidebar-btn small"
                style={{ width: "auto", fontSize: 12 }}
                title="Copy the proof sheet to send to a tutor or employer"
                onClick={() => {
                  try {
                    void navigator.clipboard?.writeText(proofMd());
                    toast("Proof sheet copied 🎓");
                  } catch {
                    // clipboard unavailable
                  }
                }}
              >
                📋 Copy proof
              </button>
              <button
                className="sidebar-btn small"
                style={{ width: "auto", fontSize: 12 }}
                onClick={() => {
                  const card = buildShareCard("My English writing", styleText || essayText || "Hello! I am learning English.", state.level);
                  try {
                    void navigator.clipboard?.writeText(card);
                    toast("Share card copied — send it anywhere 🤝");
                  } catch {
                    // clipboard unavailable
                  }
                  downloadMd(`feedback-request-${today}.md`, card);
                }}
              >
                🤝 Peer review card
              </button>
            </div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>No accounts, no servers: copy the card or save the file and share it in any messenger for human feedback. 🤝</div>
            {folio.length === 0 ? (
              <p style={{ fontSize: 13, opacity: 0.75 }}>Empty shelf — grade an essay ✍️, polish a paragraph ✨, or save a sentence 💬 to start your story.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {folio.slice(0, 20).map((e) => (
                  <div key={e.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 8 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ flex: 1, fontWeight: 800, fontSize: 13 }}>{e.title}</span>
                      <span style={{ fontSize: 11, opacity: 0.6 }}>{e.at.slice(0, 10)}</span>
                      <button className="sidebar-btn small" style={{ width: "auto", fontSize: 11 }} onClick={() => persistFolio(removeEntry(folio, e.id))}>🗑️</button>
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{portfolioKindLabel(e.kind)}{e.meta ? ` · ${e.meta}` : ""}</div>
                    <div style={{ fontSize: 13, marginTop: 4, whiteSpace: "pre-wrap" }}>{e.body.length > 220 ? e.body.slice(0, 220) + "…" : e.body}</div>
                  </div>
                ))}
              </div>
            )}
            <details style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 8 }}>
              <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 800 }}>
                🎓 Mock IELTS Task 2 (40 min)
              </summary>
              <div style={{ marginTop: 8 }}>
                <IeltsBox
                  level={state.level}
                  onSpeak={speakText}
                  onSave={(title, body, meta) => {
                    persistFolio(addEntry(folio, "ielts", title, body, meta));
                    const paid = gateBonus("ielts:submit", 3);
                    toast(paid ? "IELTS practice saved 🎓 +3 XP" : "IELTS practice saved 🎓");
                    return paid;
                  }}
                />
              </div>
            </details>
          </div>
        ) : null}

        {tab === "dojo" ? (
          <DojoPanel
            onSendToChat={onSendToChat}
            onXP={(n, note) => {
              bonus(n);
              toast(`+${n} XP — ${note} 💻`);
            }}
          />
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
            {(() => {
              // Adaptive level tip: last-20 accuracy moves the suggestion.
              let stats = { n: 0, acc: 0 };
              try {
                stats = recentStats();
              } catch {
                // buffer unavailable
              }
              const dir = suggestShift(state.level, stats.n, stats.acc);
              if (!dir) return null;
              const next = neighborLevel(state.level, dir);
              const pct = Math.round(stats.acc * 100);
              return (
                <div style={{ background: "var(--green)", color: "#fff", borderRadius: 8, padding: 10, textAlign: "center" }}>
                  <div style={{ fontWeight: 800 }}>
                    {dir === "up" ? `📈 ${pct}% over your last ${stats.n} — ready for ${next}?` : `🌱 ${pct}% lately — ${next} pace for comfort?`}
                  </div>
                  <button className="sidebar-btn small" onClick={() => pickLevel(next)} style={{ marginTop: 6, width: "auto" }}>
                    {dir === "up" ? `Level up to ${next} →` : `Switch to ${next} →`}
                  </button>
                </div>
              );
            })()}
            {reviewItems.length > 0 ? (
              <button className="sidebar-btn small primary" onClick={() => setTab("review")} style={{ textAlign: "center" }}>
                🔁 {reviewItems.length} due for review →
              </button>
            ) : null}
            {errorProfile.recent.length > 0 ? (
              <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 8 }}>
                <div style={{ fontWeight: 800, fontSize: 13 }}>🧭 Error radar</div>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
                  Slips caught in your own sentences — repeated ones come back as review drills.
                </div>
                {topErrorKinds(errorProfile, 3).map(({ kind, count }) => (
                  <div key={kind} style={{ fontSize: 13 }}>
                    • {ERROR_KIND_LABEL[kind]} — ×{count}
                  </div>
                ))}
                {errorProfile.recent[0] ? (
                  <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                    Last: <i>&quot;{errorProfile.recent[0].found}&quot;</i> → {errorProfile.recent[0].fix}
                  </div>
                ) : null}
              </div>
            ) : null}
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
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>🔥 {weekXp} / {weeklyTarget(path)} XP {L("lnThisWeek", "this week")} · {pathByIdSafe(path).name}</div>
              <div style={{ height: 10, borderRadius: 6, background: "var(--border)", overflow: "hidden" }}>
                <div style={{ width: `${Math.min(100, Math.round((weekXp / weeklyTarget(path)) * 100))}%`, height: "100%", background: "var(--green)", transition: "width .5s" }} />
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
            {(() => {
              let left = 1;
              try {
                left = freezeLeft();
              } catch {
                // ignore
              }
              return (
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  ❄️ Streak freeze: {left > 0 ? "1 ready — misses one day automatically" : "spent (renews monthly)"}
                </div>
              );
            })()}
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>🗞️ Weekly report card</div>
              {(() => {
                let streak = 1;
                try {
                  const raw = localStorage.getItem("canary-streak");
                  const obj = raw ? (JSON.parse(raw) as { count?: unknown }) : null;
                  if (obj && typeof obj.count === "number" && obj.count > 0) streak = Math.floor(obj.count);
                } catch {
                  // default stands
                }
                const week = weekSeries(state, today);
                const asked = week.reduce((a, d) => a + d.asked, 0);
                const correct = week.reduce((a, d) => a + d.correct, 0);
                const lessons = week.reduce((a, d) => a + d.lessons, 0);
                const weak = weakestSkill(state);
                const report = buildWeeklyReport({
                  weekXp, target: weeklyTarget(path), lessons, asked, correct,
                  level: state.level, weakest: weak, streak,
                });
                return (
                  <>
                    <div style={{ fontSize: 12, whiteSpace: "pre-wrap", margin: "4px 0" }}>{report}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        className="sidebar-btn small"
                        style={{ width: "auto", fontSize: 12 }}
                        onClick={() => {
                          try {
                            void navigator.clipboard?.writeText(report);
                            toast("Report copied 📋");
                          } catch {
                            // ignore
                          }
                        }}
                      >
                        📋 Copy
                      </button>
                      <button
                        className="sidebar-btn small"
                        style={{ width: "auto", fontSize: 12 }}
                        onClick={() => {
                          try {
                            const nav = navigator as Navigator & { share?: (d: { title: string; text: string }) => Promise<void> };
                            if (nav.share) {
                              void nav.share({ title: "My English week", text: report }).catch(() => {});
                            } else {
                              void navigator.clipboard?.writeText(report);
                              toast("Report copied 📋");
                            }
                          } catch {
                            // ignore
                          }
                        }}
                      >
                        📤 Share
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        ) : null}
      </div>
      </>
    )}
    </div>
  );
}
