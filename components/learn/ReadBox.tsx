"use client";

import { useEffect, useMemo, useState } from "react";
import {
  articleFromText,
  lemmaCandidates,
  matchStudyWords,
  tokenizeParagraph,
  type Article,
  type DictEntry,
} from "@/lib/learn-reader";
import { ALL_ITEMS, CEFR_ORDER, type BankItem, type CEFR } from "@/lib/learn-bank";
import { genWordList, lookupGenWord } from "@/lib/learn-gen";
import { enDefSync, loadEnDef } from "@/lib/learn-endef";
import type { FlashCard } from "@/lib/learn-flash";

const ARTICLE_KEY = "canary-read-article-v1";
const FONT_KEY = "canary-read-font";

function glossOf(item: BankItem): string {
  if (item.hint) return item.hint.trim();
  return (item.explain ?? "").split(/\.\s+/)[0]?.trim() ?? "";
}

function loadArticle(): Article | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(ARTICLE_KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as Partial<Article>;
    if (typeof a.title !== "string" || typeof a.text !== "string") return null;
    if (!Array.isArray(a.paragraphs)) return null;
    const paragraphs = a.paragraphs.filter((p): p is string => typeof p === "string" && !!p.trim()).slice(0, 200);
    if (paragraphs.length === 0) return null;
    if (!CEFR_ORDER.includes(a.level as CEFR)) return null;
    return {
      title: a.title.slice(0, 200),
      site: typeof a.site === "string" ? a.site.slice(0, 120) : "",
      url: typeof a.url === "string" ? a.url.slice(0, 500) : "",
      paragraphs,
      text: paragraphs.join("\n\n"),
      wordCount: typeof a.wordCount === "number" && a.wordCount > 0 ? a.wordCount : 0,
      minutes: typeof a.minutes === "number" && a.minutes > 0 ? a.minutes : 1,
      level: a.level as CEFR,
    };
  } catch {
    return null;
  }
}

function loadFont(): number {
  try {
    if (typeof localStorage === "undefined") return 15;
    const n = parseInt(localStorage.getItem(FONT_KEY) ?? "", 10);
    return Number.isFinite(n) ? Math.min(22, Math.max(13, n)) : 15;
  } catch {
    return 15;
  }
}

const ERRORS: Record<string, string> = {
  "bad-url": "That doesn't look like a public http(s) link.",
  "not-html": "That link isn't an article page — try the article's own URL.",
  "too-big": "That page is too large (900KB max).",
  "too-many-redirects": "That page redirects too many times.",
  "no-article": "Couldn't find article text there. Try Paste mode.",
  "fetch-failed": "Couldn't reach that page (offline, login wall, or blocked).",
  "rate-limited": "Reader limit reached — try again in an hour.",
};

/**
 * Authentic input: read a real article from the web (or paste text), tap
 * words for a gloss, save the useful ones as cards, and mark it read for XP.
 * Fetching happens in /api/read; the article then lives in localStorage.
 */
export default function ReadBox({
  level,
  cards,
  onSaveWord,
  onFinish,
  onSpeak,
}: {
  level: CEFR | null;
  cards: FlashCard[];
  /** Persist a card; returns true when the +2 XP was newly paid today. */
  onSaveWord: (term: string, meaning: string) => boolean;
  /** Mark the article read; returns true when the +3 XP was newly paid today. */
  onFinish: (article: Article) => boolean;
  onSpeak: (text: string, rate?: number) => void;
}) {
  const [article, setArticle] = useState<Article | null>(loadArticle);
  const [mode, setMode] = useState<"url" | "text">("url");
  const [url, setUrl] = useState("");
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [font, setFont] = useState(loadFont);
  const [picked, setPicked] = useState<{ term: string; entry: DictEntry | null } | null>(null);
  const [savedNow, setSavedNow] = useState<Record<string, 1>>({});
  const [finishMsg, setFinishMsg] = useState<string | null>(null);
  const [defVersion, setDefVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    void loadEnDef().then(() => {
      if (alive) setDefVersion((v) => v + 1);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    try {
      if (article) localStorage.setItem(ARTICLE_KEY, JSON.stringify(article));
      else localStorage.removeItem(ARTICLE_KEY);
    } catch {
      // storage full/blocked — reading still works this session
    }
  }, [article]);

  useEffect(() => {
    try {
      localStorage.setItem(FONT_KEY, String(font));
    } catch {
      // best-effort
    }
  }, [font]);

  const known = useMemo(
    () => new Set(cards.map((c) => c.term.trim().toLowerCase()).filter(Boolean)),
    [cards],
  );

  const entries = useMemo(() => {
    const defs = enDefSync();
    const map = new Map<string, DictEntry>();
    for (const c of cards) {
      const term = c.term.trim().toLowerCase();
      if (term) map.set(term, { term, level: level ?? "A1", meaning: c.meaning });
    }
    for (const it of ALL_ITEMS) {
      if (!it.word) continue;
      const term = it.word.toLowerCase();
      if (map.has(term)) continue;
      map.set(term, { term, level: it.level, meaning: glossOf(it) });
    }
    for (const { level: lv, en } of genWordList()) {
      const term = en.toLowerCase();
      if (map.has(term)) continue;
      const cached = lookupGenWord(en);
      const meaning = defs[term]?.def || (cached ? glossOf(cached) : "");
      map.set(term, { term, level: lv, meaning });
    }
    return map;
    // defVersion rebuilds once /data/endef.json finishes loading
  }, [cards, level, defVersion]);

  const studyWords = useMemo(() => {
    if (!article) return [];
    const pool = [...entries.values()].filter(
      (e) => e.meaning && !known.has(e.term) && !e.term.includes(" "),
    );
    return matchStudyWords(article.text, pool, level, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article, entries, level, known]);

  const lookup = (word: string): DictEntry | null => {
    for (const cand of lemmaCandidates(word)) {
      const hit = entries.get(cand);
      if (hit) return hit;
    }
    return null;
  };

  const pick = (surface: string) => {
    const term = lemmaCandidates(surface)[0] ?? surface.toLowerCase();
    setPicked({ term, entry: lookup(surface) });
  };

  const show = (a: Article) => {
    setArticle(a);
    setPicked(null);
    setFinishMsg(null);
    setError(null);
  };

  const loadLink = async () => {
    const u = url.trim();
    if (!u || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: u }),
      });
      const data = (await res.json().catch(() => ({}))) as { article?: Article; error?: string };
      if (!res.ok || !data.article) {
        setError(ERRORS[data.error ?? ""] ?? "Couldn't load that page.");
        return;
      }
      show(data.article);
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const loadPaste = () => {
    const raw = paste.trim();
    if (raw.length < 40) {
      setError("Paste at least a paragraph (40+ characters).");
      return;
    }
    const first = raw.split(/\n/)[0].trim();
    const title = first && first.length <= 80 && first.length < raw.length ? first : "Pasted text";
    show(articleFromText(raw, title));
  };

  const savePicked = () => {
    if (!picked) return;
    const e = picked.entry;
    const meaning = e?.meaning
      ? `${e.meaning}${e.ko ? ` (${e.ko})` : ""}`
      : "look up & edit in Cards";
    onSaveWord(picked.term, meaning);
    setSavedNow((s) => ({ ...s, [picked.term]: 1 }));
  };

  const finish = () => {
    if (!article) return;
    const paid = onFinish(article);
    setFinishMsg(paid ? "✅ Marked read · +3 XP" : "✅ Marked read · bonus already claimed today");
  };

  const inputStyle = {
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--text)",
    fontFamily: "inherit",
    fontSize: 14,
  } as const;

  if (!article) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>
          Real English from the web. Tap any word for a gloss, save the useful ones as
          cards, and mark it read for XP. No AI, and the text stays on this device.
        </p>
        <div style={{ display: "flex", gap: 6 }}>
          {(["url", "text"] as const).map((m) => (
            <button
              key={m}
              className={`sidebar-btn small${mode === m ? " secondary" : ""}`}
              style={{ width: "auto", fontSize: 12 }}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
            >
              {m === "url" ? "🔗 From a link" : "📋 Paste text"}
            </button>
          ))}
        </div>
        {mode === "url" ? (
          <>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void loadLink();
              }}
              placeholder="https://www.example.com/article"
              style={inputStyle}
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                className="sidebar-btn small primary"
                style={{ width: "auto" }}
                disabled={busy || !url.trim()}
                onClick={() => void loadLink()}
              >
                {busy ? "Extracting…" : "Read →"}
              </button>
              <span style={{ fontSize: 11, opacity: 0.7 }}>Public article pages only.</span>
            </div>
          </>
        ) : (
          <>
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder="Paste an article, newsletter, or any English text…"
              rows={7}
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                className="sidebar-btn small primary"
                style={{ width: "auto" }}
                disabled={!paste.trim()}
                onClick={loadPaste}
              >
                Read pasted text →
              </button>
              <span style={{ fontSize: 11, opacity: 0.7 }}>No network needed.</span>
            </div>
          </>
        )}
        {error ? <div style={{ fontSize: 12, color: "var(--danger, #c0392b)" }}>⚠️ {error}</div> : null}
        <p style={{ margin: 0, fontSize: 11, opacity: 0.6 }}>
          Tip: if a link fails, open the article and use Paste — paywalls and login walls
          can&apos;t be read for you.
        </p>
      </div>
    );
  }

  const pickedSaved = !!picked && (known.has(picked.term) || !!savedNow[picked.term]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 12, opacity: 0.8 }}>
        <span>{article.site || "Pasted"}</span>
        <span>·</span>
        <span>{article.wordCount.toLocaleString()} words</span>
        <span>·</span>
        <span>~{article.minutes} min</span>
        <span>·</span>
        <span title="Estimated from sentence length and word complexity">CEFR {article.level}</span>
        <span style={{ flex: 1 }} />
        <button
          className="sidebar-btn small"
          style={{ width: "auto", fontSize: 11 }}
          onClick={() => setFont((f) => Math.max(13, f - 1))}
          title="Smaller text"
        >
          A−
        </button>
        <button
          className="sidebar-btn small"
          style={{ width: "auto", fontSize: 11 }}
          onClick={() => setFont((f) => Math.min(22, f + 1))}
          title="Larger text"
        >
          A+
        </button>
        <button
          className="sidebar-btn small"
          style={{ width: "auto", fontSize: 11 }}
          onClick={() => {
            setArticle(null);
            setPicked(null);
            setUrl("");
            setPaste("");
            setError(null);
          }}
          title="Read something else"
        >
          ✕ New
        </button>
      </div>

      <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.35 }}>{article.title}</div>

      {picked ? (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <b>{picked.term}</b>
            <span style={{ fontSize: 11, opacity: 0.7 }}>
              {picked.entry ? picked.entry.level : "not in the bank yet"}
            </span>
            <span style={{ flex: 1 }} />
            <button
              className="sidebar-btn small"
              style={{ width: "auto", fontSize: 11 }}
              onClick={() => onSpeak(picked.term)}
              title="Hear the word"
            >
              🔊
            </button>
            <button
              className="sidebar-btn small"
              style={{ width: "auto", fontSize: 11 }}
              onClick={() => setPicked(null)}
              title="Close"
            >
              ✕
            </button>
          </div>
          <div style={{ fontSize: 13 }}>
            {picked.entry?.meaning || "No gloss yet — save it and add your own meaning in Cards."}
          </div>
          {picked.entry?.ko ? <div style={{ fontSize: 12, opacity: 0.8 }}>{picked.entry.ko}</div> : null}
          <div>
            <button
              className="sidebar-btn small"
              style={{ width: "auto", fontSize: 12 }}
              disabled={pickedSaved}
              onClick={savePicked}
            >
              {pickedSaved ? "✓ Saved" : "🗂️ +Card"}
            </button>
          </div>
        </div>
      ) : null}

      {studyWords.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 12, opacity: 0.75 }}>Study words from this page:</span>
          {studyWords.map((e) => (
            <button
              key={e.term}
              className="sidebar-btn small"
              style={{ width: "auto", fontSize: 12 }}
              title={e.meaning}
              onClick={() => setPicked({ term: e.term, entry: e })}
            >
              {e.term} <span style={{ opacity: 0.6 }}>{e.level}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {article.paragraphs.map((p, pi) => (
          <div key={`${pi}-${p.slice(0, 24)}`}>
            <p style={{ margin: 0, fontSize: font, lineHeight: 1.7 }}>
              {tokenizeParagraph(p).map((tok, ti) =>
                tok.word ? (
                  <span
                    key={ti}
                    onClick={() => pick(tok.text)}
                    style={{
                      cursor: "pointer",
                      borderBottom:
                        picked && lemmaCandidates(tok.text)[0] === picked.term
                          ? "2px solid var(--green)"
                          : "1px dotted var(--border)",
                    }}
                  >
                    {tok.text}
                  </span>
                ) : (
                  <span key={ti}>{tok.text}</span>
                ),
              )}
            </p>
            <button
              className="sidebar-btn small"
              style={{ width: "auto", fontSize: 11, marginTop: 4 }}
              onClick={() => onSpeak(p)}
              title="Listen to this paragraph"
            >
              🔊
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {finishMsg ? (
          <span style={{ fontSize: 12, opacity: 0.85 }}>{finishMsg}</span>
        ) : (
          <button className="sidebar-btn small primary" style={{ width: "auto" }} onClick={finish}>
            ✅ Done reading
          </button>
        )}
        <span style={{ fontSize: 11, opacity: 0.7 }}>
          Worth +3 XP the first time each day. Tap a word to save it as a card.
        </span>
      </div>
    </div>
  );
}
