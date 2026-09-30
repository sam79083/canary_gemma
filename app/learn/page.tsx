"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import {
  ALL_ITEMS,
  CEFR_ORDER,
  SELF_CHECK,
  buildDailyLesson,
  getPlacementTest,
  levelRank,
  scoreToCEFR,
  suggestLevelFromChecks,
  type BankItem,
  type CEFR,
} from "@/lib/learn-bank";
import QuizCard from "@/components/learn/QuizCard";
import {
  ESSAY_DRAFT_KEY,
  ESSAY_TOPICS,
  buildEssayCoachPrompt,
  gradeEssay,
  loadEssayHistory,
  saveEssayAttempt,
  type EssayAttempt,
  type EssayScore,
} from "@/lib/learn-essay";
import { dayStr } from "@/lib/learn-srs";
import { loadSeen, markSeen } from "@/lib/learn-seen";
import {
  chooseState,
  fetchRemote,
  loadMetaSavedAt,
  pushRemote,
  saveMetaSavedAt,
} from "@/lib/learn-store";
import {
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

type Tab = "assess" | "lesson" | "review" | "essay" | "progress";

function useT() {
  const { lang, t } = useLanguage();
  const L = (key: string, fallback: string) => {
    try {
      const s = t(key);
      return s === key ? fallback : s;
    } catch {
      return fallback;
    }
  };
  return { lang, L };
}

function QuizRunner({
  items,
  onDone,
  cta,
}: {
  items: BankItem[];
  onDone: (results: AnswerResult[]) => void;
  cta: string;
}) {
  return <QuizCard items={items} onDone={onDone} cta={cta} />;
}

export default function LearnPage() {
  const { L } = useT();
  const auth = useAuth();
  const member = auth.user !== null;
  const [tab, setTab] = useState<Tab>("lesson");
  const [essayTopicId, setEssayTopicId] = useState<string | null>(null);
  const [essayText, setEssayText] = useState("");
  const [essayResult, setEssayResult] = useState<EssayScore | null>(null);
  const [essayHistory, setEssayHistory] = useState<EssayAttempt[]>([]);  const [assessMode, setAssessMode] = useState<"menu" | "check" | "test">("menu");
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [state, setState] = useState<LearnState>(() => emptyState());
  const [hydrated, setHydrated] = useState(false);
  const [cloudState, setCloudState] = useState<"local" | "syncing" | "synced">("local");
  const pullingRef = useRef(false);
  const today = useMemo(() => dayStr(new Date()), []);
  const [sessionKey, setSessionKey] = useState(0);

  useEffect(() => {
    setState(loadLearn());
    setHydrated(true);
  }, []);
  // Members: pull cloud save on login (new device adopts server state),
  // then push debounced. Guests stay local-only.
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
        setCloudState(member ? "synced" : "local");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.loading, member, hydrated]);
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

  const placement = useMemo(() => getPlacementTest(), []);
  const lesson = useMemo(
    () => buildDailyLesson(today, state.level, loadSeen(), sessionKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today, state.level, sessionKey],
  );
  const reviewItems = useMemo(() => {
    const byWord = new Map(ALL_ITEMS.filter((i) => i.word).map((i) => [i.word as string, i]));
    return dueWords(state, today)
      .map((w) => byWord.get(w))
      .filter((x): x is BankItem => Boolean(x))
      .slice(0, 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, today, sessionKey]);
  const week = useMemo(() => weekSeries(state, today), [state, today]);
  const weak = weakestSkill(state);
  const leeches = leechWords(state);
  const vocabAcc = state.skills.vocab.asked ? Math.round((100 * state.skills.vocab.correct) / state.skills.vocab.asked) : 0;
  const gramAcc = state.skills.grammar.asked ? Math.round((100 * state.skills.grammar.correct) / state.skills.grammar.asked) : 0;
  const readAcc = state.skills.reading.asked ? Math.round((100 * state.skills.reading.correct) / state.skills.reading.asked) : 0;
  const writeAcc = state.skills.writing.asked ? Math.round((100 * state.skills.writing.correct) / state.skills.writing.asked) : 0;
  const maxXp = Math.max(1, ...week.map((d) => d.xp));

  const finish = (results: AnswerResult[], levelize: boolean) => {
    if (results.length > 0) markSeen(results.map((r) => r.item.id));
    setState((prev) => {
      let next = recordAnswers(prev, results, today);
      if (levelize) {
        const correct = results.filter((r) => r.correct).length;
        next = setLevel(next, scoreToCEFR(correct, results.length));
      }
      return next;
    });
    setSessionKey((k) => k + 1);
    setTab("progress");
  };

  const exportVocab = () => {
    const rows = Object.entries(state.cards).sort();
    const body =
      `# My English vocab (${today})\n\n` +
      (rows.length === 0 ? "No tracked words yet — finish a lesson first.\n" : rows.map(([w, c]) => `- ${w} — due ${c.due}, fails ${c.fails}, passes ${c.passes}`).join("\n") + "\n");
    const blob = new Blob([body], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `vocab-${today}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  const board = [...week].sort((a, b) => b.xp - a.xp);

  const pickLevel = (lv: CEFR, go: Tab = "lesson") => {
    setState((prev) => setLevel(prev, lv));
    setSessionKey((k) => k + 1);
    setTab(go);
  };

  // ---- essay mode ----
  const essayTopic = useMemo(() => {
    const mine = ESSAY_TOPICS.filter(
      (t) => !state.level || levelRank(t.level) <= levelRank(state.level),
    );
    const list = mine.length > 0 ? mine : ESSAY_TOPICS;
    return list.find((t) => t.id === essayTopicId) ?? list[0];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.level, essayTopicId]);
  const essayWords = useMemo(
    () => essayText.split(/\s+/).filter(Boolean).length,
    [essayText],
  );
  useEffect(() => {
    if (tab === "essay") setEssayHistory(loadEssayHistory());
  }, [tab]);
  const gradeCurrentEssay = () => {
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

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Link href="/" className="sidebar-btn small" style={{ width: "auto" }}>← Chat</Link>
        <h1 style={{ fontSize: 20, margin: 0 }}>📚 {L("lnTitle", "English Learning")}</h1>
        <span style={{ marginLeft: "auto", fontSize: 13, opacity: 0.85 }}>
          {state.level ? `Level ${state.level}` : "Unplaced"} · ⚡{state.xp} XP · 🔥{state.lessons} lessons
        </span>
      </div>
      <p style={{ fontSize: 13, opacity: 0.75, margin: 0 }}>
        {L("lnFree", "100% free · no tokens · works offline. Questions are fixed banks graded on-device; your progress stays in this browser.")}{" "}
        {member ? (cloudState === "synced" ? "☁️ saved to your account" : "☁️ syncing…") : "📱 saved on this device"}
      </p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {(["assess", "lesson", "review", "essay", "progress"] as Tab[]).map((id) => (
          <button
            key={id}
            className={`sidebar-btn small${tab === id ? " secondary" : ""}`}
            onClick={() => setTab(id)}
            style={{ flex: 1, justifyContent: "center", minWidth: 90 }}
          >
            {id === "assess" ? `🎯 ${L("lnAssess", "Assess")}` : id === "lesson" ? `✏️ ${L("lnLesson", "Lesson")}` : id === "review" ? `🔁 ${L("lnReview", "Review")} (${reviewItems.length})` : id === "essay" ? `✍️ ${L("lnEssay", "Essay")}` : `📊 ${L("lnProgress", "Progress")}`}
          </button>
        ))}
      </div>

      {tab === "assess" ? (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              {L("lnKnowLevel", "I know my level — just let me pick it")}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {CEFR_ORDER.map((lv) => (
                <button
                  key={lv}
                  className={`sidebar-btn small${state.level === lv ? " secondary" : ""}`}
                  onClick={() => pickLevel(lv)}
                  style={{ flex: "1 1 60px", justifyContent: "center" }}
                >
                  {lv}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
              A1 Beginner · A2 Elementary · B1 Intermediate · B2 Upper-inter · C1 Advanced · C2 Mastery — {L("lnSkipHint", "skipping is fine: picking manually works, and lessons adapt either way.")}
            </div>
          </div>

          {assessMode === "menu" ? (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button className="sidebar-btn small primary" onClick={() => { setChecks({}); setAssessMode("check"); }} style={{ flex: 1, justifyContent: "center" }}>
                {L("lnSelfCheck", "❓ Not sure — 30-sec self-check")}
              </button>
              <button className="sidebar-btn small" onClick={() => setAssessMode("test")} style={{ flex: 1, justifyContent: "center" }}>
                {L("lnFullTest", "📝 Full 18-question test")}
              </button>
              <button className="sidebar-btn small" onClick={() => pickLevel("A1")} style={{ flex: 1, justifyContent: "center" }}>
                {L("lnSkip", "⏩ Skip — start at A1")}
              </button>
            </div>
          ) : null}

          {assessMode === "check" ? (
            <div style={{ fontSize: 13, border: "1px solid var(--border)", borderRadius: 8, padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontWeight: 700 }}>{L("lnCheckTitle", "Check what you can already do:")}</div>
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
                    <button className="sidebar-btn small" onClick={() => setAssessMode("menu")} style={{ width: "auto" }}>←</button>
                  </div>
                );
              })()}
            </div>
          ) : null}

          {assessMode === "test" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <p style={{ fontSize: 13, opacity: 0.8, margin: 0 }}>18 fixed questions (A1→C2). Result sets your level and unlocks the right daily lesson.</p>
              <QuizRunner key={`a-${sessionKey}`} items={placement} cta="Save my level →" onDone={(r) => { setAssessMode("menu"); finish(r, true); }} />
              <button className="sidebar-btn small" onClick={() => setAssessMode("menu")} style={{ width: "auto", alignSelf: "flex-start" }}>← Back</button>
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === "lesson" ? (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ fontSize: 13, opacity: 0.8 }}>
            Practice set{state.level ? ` · Level ${state.level}` : " · finish Assess to personalize"}: 3 warm-up, 5 at your level, 2 stretch. Fresh questions every session — recent ones won't repeat.
          </p>
          <QuizRunner key={`l-${sessionKey}`} items={lesson} cta="Record lesson →" onDone={(r) => finish(r, false)} />
        </section>
      ) : null}

      {tab === "review" ? (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ fontSize: 13, opacity: 0.8 }}>Spaced-repetition queue: words you missed come back after 1 → 6 → N days. Fail 3× = leech.</p>
          {reviewItems.length === 0 ? (
            <p>✅ Nothing due today. {leeches.length > 0 ? `But you have ${leeches.length} leech word(s) below — keep an eye on them.` : "Come back tomorrow."}</p>
          ) : (
            <QuizRunner key={`r-${sessionKey}`} items={reviewItems} cta="Record review →" onDone={(r) => finish(r, false)} />
          )}
          {leeches.length > 0 ? (
            <div style={{ fontSize: 13, background: "var(--border)", borderRadius: 6, padding: 8 }}>
              🐛 <b>Keep-forgetting ({leeches.length}):</b> {leeches.slice(0, 12).join(", ")}
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === "essay" ? (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ fontSize: 13, opacity: 0.8, margin: 0 }}>
            Pick a topic, write your essay, get a 0–100 grade. <b>80+ = pass.</b> Same essay always earns the same score — track real progress.
          </p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {ESSAY_TOPICS.map((t) => (
              <button
                key={t.id}
                className={`sidebar-btn small${essayTopic.id === t.id ? " secondary" : ""}`}
                onClick={() => { setEssayTopicId(t.id); setEssayResult(null); }}
                style={{ width: "auto" }}
                title={t.topic}
              >
                [{t.level}] {t.topic.slice(0, 28)}…
              </button>
            ))}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>"{essayTopic.topic}"</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>💡 {essayTopic.hint} · target {essayTopic.minWords}–{essayTopic.maxWords} words</div>
          <textarea
            value={essayText}
            onChange={(e) => { setEssayText(e.target.value); setEssayResult(null); }}
            placeholder="Write your essay here… (blank lines = new paragraphs)"
            rows={10}
            style={{ width: "100%", boxSizing: "border-box", padding: 10, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 14, lineHeight: 1.6, resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, opacity: 0.8 }}>{essayWords} words</span>
            <button className="sidebar-btn small primary" onClick={gradeCurrentEssay} disabled={essayWords === 0} style={{ width: "auto" }}>
              📝 Grade my essay
            </button>
            {essayResult ? (
              <Link href="/" onClick={sendEssayToChat} className="sidebar-btn small" style={{ width: "auto", textAlign: "center" }}>
                💬 Get AI coaching →
              </Link>
            ) : null}
          </div>
          {essayResult ? (
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 36, fontWeight: 900 }}>{essayResult.total}<span style={{ fontSize: 16, opacity: 0.6 }}>/100</span></div>
                <div style={{ fontSize: 15, fontWeight: 800, color: essayResult.pass ? "var(--green)" : "inherit" }}>
                  {essayResult.pass ? "🎉 PASS! Exam-ready writing." : "💪 Not yet — 80 to pass. Read the fixes and retry!"}
                </div>
              </div>
              {essayResult.axes.map((a) => (
                <div key={a.key} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                  <span style={{ width: 90, textTransform: "capitalize" }}>
                    {a.key === "task" ? "📋 Task" : a.key === "coherence" ? "🔗 Flow" : a.key === "lexical" ? "📚 Words" : a.key === "grammar" ? "✏️ Grammar" : "🔧 Polish"}
                  </span>
                  <div style={{ flex: 1, height: 8, borderRadius: 4, background: "var(--border)", overflow: "hidden" }}>
                    <div style={{ width: `${(a.score / 20) * 100}%`, height: "100%", background: "var(--green)" }} />
                  </div>
                  <span style={{ width: 44, textAlign: "right" }}>{a.score}/20</span>
                </div>
              ))}
              <div style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
                {essayResult.feedback.map((f, i) => (
                  <div key={i}>{f}</div>
                ))}
              </div>
            </div>
          ) : null}
          {essayHistory.length > 0 ? (
            <div style={{ fontSize: 13 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>🗂️ My essays</div>
              <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 2 }}>
                {essayHistory.slice(0, 5).map((h) => (
                  <li key={h.id}>
                    {h.pass ? "✅" : "📝"} {h.total}/100 · {h.words} words · {h.at} — {h.topic.slice(0, 40)}…
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === "progress" ? (
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 8, padding: 10, textAlign: "center" }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Vocab accuracy</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{vocabAcc}%</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>{state.skills.vocab.correct}/{state.skills.vocab.asked}</div>
            </div>
            <div style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 8, padding: 10, textAlign: "center" }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Grammar accuracy</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{gramAcc}%</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>{state.skills.grammar.correct}/{state.skills.grammar.asked}</div>
            </div>
            <div style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 8, padding: 10, textAlign: "center" }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Reading accuracy</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{readAcc}%</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>{state.skills.reading.correct}/{state.skills.reading.asked}</div>
            </div>
            <div style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 8, padding: 10, textAlign: "center" }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Essay pass rate</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{writeAcc}%</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>{state.skills.writing.correct}/{state.skills.writing.asked} passed</div>
            </div>
          </div>
          {weak ? (
            <div style={{ fontSize: 13, background: "var(--border)", borderRadius: 6, padding: 8 }}>
              💡 <b>Improve next:</b> {weak === "grammar" ? "grammar — try articles (a/an/the), prepositions (in/at/since), and plurals in Review." : weak === "reading" ? "reading — slow down on passages: read the question first, then scan. Exam arena lives at C1+." : weak === "writing" ? "writing — write one essay this week: paragraphs + linkers carry 40 of your 100 points." : "vocab — drill the leech list in Review, 5 min/day."}
            </div>
          ) : (
            <div style={{ fontSize: 13, opacity: 0.8 }}>Finish 5+ answers per skill to unlock the “what to improve” hint.</div>
          )}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Last 7 days XP (this device — free local leaderboard)</div>
            <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 90 }}>
              {week.map((d) => (
                <div key={d.day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <div style={{ fontSize: 11 }}>{d.xp > 0 ? d.xp : ""}</div>
                  <div style={{ width: "100%", height: Math.max(2, Math.round((d.xp / maxXp) * 60)), background: "var(--green)", borderRadius: 3, opacity: d.xp ? 1 : 0.2 }} />
                  <div style={{ fontSize: 10, opacity: 0.7 }}>{d.day.slice(5)}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>🏆 This-week board (device)</div>
            {board.every((d) => d.xp === 0) ? (
              <p style={{ fontSize: 13, opacity: 0.7 }}>No XP yet — finish a lesson to open your board.</p>
            ) : (
              <ol style={{ fontSize: 13, margin: 0, paddingLeft: 20 }}>
                {board.filter((d) => d.xp > 0).map((d) => (
                  <li key={d.day}>{d.day} — {d.xp} XP · {d.correct}/{d.asked} correct</li>
                ))}
              </ol>
            )}
            <p style={{ fontSize: 12, opacity: 0.7 }}>Global member board (Supabase) needs only 1 row/user/day — see <code>supabase/migrations/003_learn.sql</code>. Until then this local board costs $0 and never sleeps.</p>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="sidebar-btn small" onClick={exportVocab}>⬇ Export vocab (.md)</button>
            <Link href="/" className="sidebar-btn small" style={{ textAlign: "center" }}>💬 Ask the AI about a mistake</Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}
