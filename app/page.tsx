"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Chat from "@/components/Chat";
import CommandPalette from "@/components/CommandPalette";
import ConfirmDialog from "@/components/ConfirmDialog";
import DownloadsPanel from "@/components/DownloadsPanel";
import FileEditor from "@/components/FileEditor";
import FileTree from "@/components/FileTree";
import HelpDialog from "@/components/HelpDialog";
import LoginDialog from "@/components/LoginDialog";
import CheckRow from "@/components/CheckRow";
import ReviewCard from "@/components/ReviewCard";
import Onboarding from "@/components/Onboarding";
import Tip from "@/components/Tip";
import TrialOverDialog from "@/components/TrialOverDialog";
import Confetti from "@/components/Confetti";
import { touchStreak } from "@/lib/streak";
import { ACHIEVEMENTS, loadUnlocked, unlockAch } from "@/lib/achievements";
import UsageBlock from "@/components/UsageBlock";
import { useAuth } from "@/hooks/useAuth";
import { useConfirm } from "@/hooks/useConfirm";
import { useLanguageModel, type Provider } from "@/hooks/useLanguageModel";
import { useLanguage } from "@/hooks/useLanguage";
import { useWorkspace } from "@/hooks/useWorkspace";
import { LANGS, isLang } from "@/lib/i18n";
import type { TFn } from "@/lib/i18n";
import { fetchQuota, readFileBinary } from "@/lib/api";
import {
  deletePath as serverDeletePath,
  listFiles as serverListFiles,
  makeDir as serverMakeDir,
  readFile as serverReadFile,
  writeFile as serverWriteFile,
  writeFileBinary as serverWriteFileBinary,
} from "@/lib/api";
import {
  applyUndo,
  loadUndoStack,
  saveUndoStack,
  undoDisplayName,
  withTimestamp,
  type UndoEntry,
  type UndoInput,
} from "@/lib/undo";
import { folderCapLine, getFolderCap } from "@/lib/capabilities";
import { TRIAL_GEMINI_LIMIT, TRIAL_HF_LIMIT } from "@/lib/trial-limits";
import { isTheme, isDarkTheme, type Theme } from "@/lib/theme";
import { isPersonalityId, personalityPrompt } from "@/lib/personalities";
import {
  displayTitle,
  listLocalSessions,
  loadLocalSession,
  normalizeTitle,
  saveLocalSession,
} from "@/lib/sessions-local";
import {
  listWorkspaceSessions,
  saveWorkspaceSession,
} from "@/lib/sessions-workspace";
import { getSessionStore } from "@/lib/session-store";
import type { ChatMessage, PendingReview, ReviewFn, ReviewResult, SessionHit, SessionInfo } from "@/lib/types";
import { MotionConfig } from "motion/react";
import * as Tooltip from "@radix-ui/react-tooltip";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Toaster, toast } from "sonner";

const HISTORY_KEY = "gemma4-chat-history";
const THEME_KEY = "theme";
const ONBOARD_KEY = "canary-onboard";

function titleFor(messages: ChatMessage[], t: TFn): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return t("pgNewChat").replace(/^\+ /, "");
  // Guard against blank/whitespace-only openers (voice slips, file sends):
  // a blank title would render as an empty Manage-chats row.
  const text = (typeof first.content === "string" ? first.content : "").trim().slice(0, 50);
  if (!text) return normalizeTitle("", Date.now());
  return text.length >= 50 ? text + "…" : text;
}

export default function Home() {
  const { lang, setLang, t } = useLanguage();
  const auth = useAuth();
  const member = auth.user !== null;
  const model = useLanguageModel(lang, t, member);
  const workspace = useWorkspace();
  // Members without a picked folder keep chats in Supabase, so history
  // follows the account across devices. Everyone else keeps local behavior.
  const useDb = member && !workspace.connected;
  // Single backend handle — replaces the useDb/workspace ternary at every
  // session call site (see lib/session-store.ts).
  const sessionStore = getSessionStore(useDb, workspace);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [theme, setThemeState] = useState<Theme>("light");
  const [personality, setPersonalityState] = useState("default");
  const [sessionList, setSessionList] = useState<SessionInfo[]>([]);
  /** Filename being renamed inline (null = not renaming). */
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [editorPath, setEditorPath] = useState<string | null>(null);
  const [treeVersion, setTreeVersion] = useState(0);
  const [showFlagHelp, setShowFlagHelp] = useState(false);
  const [flagCopied, setFlagCopied] = useState(false);
  const [ollamaUrlDraft, setOllamaUrlDraft] = useState(model.ollamaUrl);
  const [geminiKeyDraft, setGeminiKeyDraft] = useState(model.geminiKey);

  // Keep the edit drafts in sync when stored settings finish loading.
  useEffect(() => {
    setOllamaUrlDraft(model.ollamaUrl);
  }, [model.ollamaUrl]);
  useEffect(() => {
    setGeminiKeyDraft(model.geminiKey);
  }, [model.geminiKey]);
  const [review, setReview] = useState<PendingReview | null>(null);
  const reviewResolve = useRef<((r: ReviewResult) => void) | null>(null);
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [showKeyHelp, setShowKeyHelp] = useState(false);
  const [showHfHelp, setShowHfHelp] = useState(false);
  const [searchOk, setSearchOk] = useState<boolean | null>(null);
  const [capLine, setCapLine] = useState("…");
  const setupRef = useRef<HTMLDetailsElement>(null);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  // Trial budget display (keyless cloud visitors only — never members).
  const [trialLeft, setTrialLeft] = useState<{ gemini: number; hf: number } | null>(null);
  // Trial counts above the real limits (localhost/member bypass reports
  // 999999) mean unlimited — show no badge instead of an absurd number.
  const trialLimited =
    trialLeft !== null &&
    trialLeft.gemini <= TRIAL_GEMINI_LIMIT &&
    trialLeft.hf <= TRIAL_HF_LIMIT;
  useEffect(() => {
    if (model.provider !== "cloud" || model.geminiKey || member) {
      setTrialLeft(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/trial-status");
        const data = (await res.json()) as { gemini?: number; hf?: number };
        if (!cancelled && typeof data.gemini === "number")
          setTrialLeft({ gemini: data.gemini, hf: data.hf ?? 0 });
      } catch {
        // invisible on failure
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.provider, model.geminiKey, messages.length, member]);

  // Member login popup (upper-right button).
  const [loginOpen, setLoginOpen] = useState(false);
  // Trial-budget-exhausted popup (429 from /api/gemini-chat).
  const [trialOverOpen, setTrialOverOpen] = useState(false);
  const [trialKeySaving, setTrialKeySaving] = useState(false);
  // Help sheet (? button in the composer).
  const [showHelp, setShowHelp] = useState(false);
  // Daily visit streak badge (2+ days).
  const [streak, setStreak] = useState(1);
  useEffect(() => {
    try {
      setStreak(touchStreak());
    } catch {
      // badge is best-effort
    }
  }, []);
  // Achievements: toast on first unlock, badge shows the count.
  const [achCount, setAchCount] = useState(0);
  useEffect(() => {
    try {
      setAchCount(loadUnlocked().size);
    } catch {
      // ignore
    }
  }, []);
  const award = useCallback(
    (id: string) => {
      let unlocked = false;
      try {
        unlocked = unlockAch(id);
      } catch {
        return;
      }
      if (!unlocked) return;
      const def = ACHIEVEMENTS.find((a) => a.id === id);
      try {
        toast(t("achToast", { name: `${def?.icon ?? ""} ${def ? t(def.nameKey) : id}`.trim() }));
      } catch {
        // toasts are best-effort
      }
      try {
        setAchCount(loadUnlocked().size);
      } catch {
        // ignore
      }
    },
    [t],
  );
  const achSeenLen = useRef(0);
  useEffect(() => {
    if (messages.length <= achSeenLen.current) {
      achSeenLen.current = messages.length;
      return;
    }
    achSeenLen.current = messages.length;
    if (messages.filter((m) => m.role === "user").length >= 10)
      award("ten-chats");
    const last = messages[messages.length - 1];
    if (last?.role === "user") {
      if (/https?:\/\//i.test(last.content)) award("first-link");
      if (new Date().getHours() < 5) award("night-owl");
    }
    if (last?.role === "assistant" && last.image) award("first-draw");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, award]);
  // First-file fireworks (once ever per browser).
  const [burstKey, setBurstKey] = useState(0);
  const burstDone = useRef(false);
  const handleFilesCreated = useCallback(() => {
    award("first-file");    if (burstDone.current) return;
    burstDone.current = true;
    try {
      if (localStorage.getItem("canary-first-file")) return;
      localStorage.setItem("canary-first-file", "done");
    } catch {
      // storage unavailable — celebrate once per session
    }
    setBurstKey((k) => k + 1);
  }, [award]);
  // Accessible confirm modal (promise-based, replaces window.confirm).
  const confirmCtl = useConfirm();
  // Command palette (Ctrl+K quick switcher).
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // When the member session resolves/changes, refresh the cloud status line
  // (trial mode <-> member mode) without touching the chat session itself —
  // the server session is the same endpoint, now unlimited via cookie.
  useEffect(() => {
    if (auth.loading || !model.hydrated) return;
    if (model.provider !== "cloud" || model.geminiKey) return;
    if (model.busyRef.current) return;
    void model.supported();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.loading, auth.user, model.hydrated]);

  const handleLogout = useCallback(() => {
    void auth.logout().then(() => {
      try {
        toast(t("lgOut"));
      } catch {
        // toasts are best-effort
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  // Logging in/out switches where chats live (Supabase <-> local), so the
  // Manage-chats list must come from the newly active backend. The open
  // conversation stays on screen; it saves to the new backend on next reply.
  useEffect(() => {
    if (auth.loading || !model.hydrated) return;
    currentSessionFileRef.current = null;
    setCurrentFile(null);
    void refreshSessions().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member, model.hydrated]);
  // HuggingFace token for HD drawing (browser-only, like the Gemini key).
  const [hfKey, setHfKey] = useState("");
  useEffect(() => {
    try {
      const k = localStorage.getItem("canary-hf-token");
      if (k) setHfKey(k);
    } catch {
      // ignore
    }
  }, []);
  const setHfKeyStored = useCallback((k: string) => {
    setHfKey(k);
    try {
      localStorage.setItem("canary-hf-token", k);
    } catch {
      // ignore
    }
  }, []);
  // Mobile browsers have neither the Prompt API nor a folder picker —
  // offering Gemma/Ollama there is a dead end, so hide them entirely.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    try {
      setIsMobile(/Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent || ""));
    } catch {
      setIsMobile(false);
    }
  }, []);
  // Picture viewer (images never open in the text editor).
  const [viewImage, setViewImage] = useState<{ name: string; url: string } | null>(null);

  // ---- Revert safety net: backup-before-write for every mutation ----
  // Shared across chat agent, file editor, and file tree so ANY edit can
  // be undone — even when the new contents are bad. Memory + best-effort
  // localStorage (see lib/undo.ts for caps).
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  // Hydration-safe: localStorage differs between server ([]) and client.
  // Load after mount, and don't persist until the load has happened —
  // otherwise the first save would wipe the stored stack with [].
  const undoHydrated = useRef(false);
  useEffect(() => {
    try {
      setUndoStack(loadUndoStack());
    } catch {
      // memory-only — undo still works this session
    }
    undoHydrated.current = true;
  }, []);
  useEffect(() => {
    if (!undoHydrated.current) return;
    try {
      saveUndoStack(undoStack);
    } catch {
      // memory-only — undo still works this session
    }
  }, [undoStack]);

  const recordUndo = useCallback((e: UndoInput) => {
    try {
      setUndoStack((prev) => [...prev.slice(-19), withTimestamp(e)]);
    } catch {
      // recording must never break the write itself
    }
  }, []);

  /** Ask the user to Keep/Undo a file change. Resolves with the verdict. */
  const reviewChange: ReviewFn = useCallback((r: PendingReview) => {
    return new Promise<ReviewResult>((resolve) => {
      reviewResolve.current = resolve;
      setReview(r);
    });
  }, []);

  const settleReview = useCallback(
    (ok: boolean, text?: string, feedback?: string, saveAsNew?: boolean) => {
      reviewResolve.current?.({
        ok,
        text: text ?? review?.newText ?? "",
        feedback: feedback?.trim() ? feedback.trim() : undefined,
        saveAsNew: saveAsNew || undefined,
      });
      reviewResolve.current = null;
      setReview(null);
    },
    [review],
  );

  /** Never leave the agent loop hanging if the chat is reset mid-review. */
  const cancelPendingReview = useCallback(() => {
    if (reviewResolve.current) {
      reviewResolve.current({ ok: false, text: "" });
      reviewResolve.current = null;
      setReview(null);
    }
  }, []);

  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  const hydratedRef = useRef(false);
  const startedRef = useRef(false);
  // One local file per conversation — overwritten on every reply so a long
  // chat doesn't spam 50 files (the old server API created one per save).
  const currentSessionFileRef = useRef<string | null>(null);

  // Theme + personality: load once, apply theme to body.
  // Old "dark"/"light" stored values keep working (same key, subset).
  useEffect(() => {
    try {
      const storedTheme = localStorage.getItem(THEME_KEY);
      if (isTheme(storedTheme)) setThemeState(storedTheme);
      const storedPers = localStorage.getItem("canary-personality");
      if (isPersonalityId(storedPers)) setPersonalityState(storedPers);
    } catch {
      // storage unavailable — keep defaults
    }
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const setPersonality = useCallback((next: string) => {
    if (!isPersonalityId(next)) return;
    setPersonalityState(next);
    try {
      localStorage.setItem("canary-personality", next);
    } catch {
      // ignore
    }
  }, []);

  // One lightweight search-health ping for the setup checklist
  // (Chat keeps its own quota display; this is only true/false/unknown).
  useEffect(() => {
    setCapLine(folderCapLine(getFolderCap()));
    void (async () => {
      try {
        const data = await fetchQuota();
        setSearchOk(!data.error);
      } catch {
        setSearchOk(false);
      }
    })();
  }, []);

  // Live server-disk meter (sessions/, uploads/, fs free). Refreshes when
  // files change; hidden when the ping fails.
  const [storageLine, setStorageLine] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/storage", { cache: "no-store" });
        const data = (await res.json()) as {
          sessions?: { files?: number; bytes?: number };
          uploads?: { files?: number; bytes?: number };
          fs?: { free?: number; total?: number } | null;
        };
        if (cancelled || !res.ok) return;
        const fmt = (n: number): string => {
          if (!Number.isFinite(n)) return "?";
          if (n < 1024) return `${n}B`;
          if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
          if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
          return `${(n / 1024 / 1024 / 1024).toFixed(2)}GB`;
        };
        const a = `${data.sessions?.files ?? 0} (${fmt(data.sessions?.bytes ?? 0)})`;
        const b = `${data.uploads?.files ?? 0} (${fmt(data.uploads?.bytes ?? 0)})`;
        const c = data.fs && typeof data.fs.free === "number" ? fmt(data.fs.free) : "?";
        if (!cancelled) setStorageLine(t("sgLine", { a, b, c }));
      } catch {
        if (!cancelled) setStorageLine(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeVersion, t]);

  // Auto-open the Setup section when the AI can't run — that's when it's needed.
  useEffect(() => {
    if (
      (model.availability === "unsupported" ||
        model.availability === "unavailable") &&
      setupRef.current
    )
      setupRef.current.open = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.availability]);

  // First visit: show the 3-step guide.
  useEffect(() => {
    try {
      if (!localStorage.getItem(ONBOARD_KEY)) setOnboardOpen(true);
    } catch {
      // storage unavailable — skip the guide
    }
  }, []);

  const closeOnboard = useCallback(() => {
    try {
      localStorage.setItem(ONBOARD_KEY, "done");
    } catch {
      // ignore
    }
    setOnboardOpen(false);
  }, []);

  const handleOnboardPickFolder = useCallback(() => {
    void workspace.pick().then((ok) => {
      if (ok) setTreeVersion((v) => v + 1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace]);
  useEffect(() => {
    document.body.classList.remove("dark");
    document.body.dataset.theme = theme;
  }, [theme]);

  const pushMessage = useCallback(
    (
      role: ChatMessage["role"],
      content: string,
      image?: ChatMessage["image"],
      files?: ChatMessage["files"],
    ) => {
      setMessages((prev) => [...prev, { role, content, image, files }]);
    },
    [],
  );

  /** Trial-over popup: save the typed key and reconnect on it. */
  const handleSaveTrialKey = useCallback(
    (k: string) => {
      const key = k.trim();
      if (!key) return;
      model.setGeminiKey(key);
      setGeminiKeyDraft(key);
      setTrialOverOpen(false);
      setTrialKeySaving(true);
      void model
        .reconnect()
        .catch(() => {})
        .finally(() => setTrialKeySaving(false));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model],
  );

  // Persist chat to localStorage on every change (after initial hydration).
  // Image previews are live object URLs — persist text only.
  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      const stored = messagesRef.current.map(({ role, content }) => ({ role, content }));
      localStorage.setItem(HISTORY_KEY, JSON.stringify(stored));
    } catch (e) {
      console.error("Failed to save history:", e);
    }
  }, [messages]);

  const persistChat = useCallback(() => {
    const msgs = messagesRef.current;
    if (msgs.length === 0) return;
    const existing = currentSessionFileRef.current;
    const title = titleFor(msgs, t);
    // Image previews are live object URLs — persist text only.
    const stored: ChatMessage[] = msgs.map(({ role, content }) => ({ role, content }));
    const refresh = () => {
      void sessionStore
        .list()
        .then(setSessionList)
        .catch((e) => console.error("Failed to load sessions:", e));
    };
    void sessionStore
      .save(title, stored, existing)
      .then((filename) => {
        currentSessionFileRef.current = filename;
        setCurrentFile(filename);
        refresh();
      })
      .catch((e) => console.error("Auto-save session failed:", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useDb, workspace.connected, t]);

  /** Undo one entry against the active backend (workspace or server). */
  const applyUndoEntry = useCallback(
    async (entry: UndoEntry): Promise<void> => {
      const base64ToBlob = (b64: string, mime?: string | null): Blob => {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new Blob([bytes.buffer as ArrayBuffer], {
          type: mime || "application/octet-stream",
        });
      };
      if (workspace.connected) {
        await applyUndo(entry, {
          write: (p, c) => workspace.writeFile(p, c),
          del: (p) => workspace.deletePath(p),
          mkdir: (p) => workspace.makeDir(p),
          writeBinary: async (p, b64) =>
            workspace.writeBinary(p, base64ToBlob(b64)),
        });
      } else {
        await applyUndo(entry, {
          write: (p, c) => serverWriteFile(p, c),
          del: (p) => serverDeletePath(p),
          mkdir: (p) => serverMakeDir(p),
          writeBinary: (p, b64) => serverWriteFileBinary(p, b64),
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspace],
  );

  const describeUndoError = useCallback(
    (e: unknown): string => {
      const msg = e instanceof Error ? e.message : String(e);
      if (/no-backup/i.test(msg)) return t("udNoBackup");
      return msg;
    },
    [t],
  );

  /** Undo the most recent change (LIFO — keeps dependent edits ordered). */
  const handleUndo = useCallback(async () => {
    const entry = undoStack[undoStack.length - 1];
    if (!entry) {
      pushMessage("assistant", t("udNothing"));
      return;
    }
    try {
      await applyUndoEntry(entry);
      setUndoStack((prev) => prev.slice(0, -1));
      setTreeVersion((v) => v + 1);
      // If the undone file is open in the editor, its content is now stale
      // — bump the tree; the editor reloads on path change, and the chat
      // line tells the user what happened.
      pushMessage(
        "assistant",
        t("udUndone", { name: undoDisplayName(entry.path) || entry.path }) +
          (entry.truncated ? " " + t("udPartial") : ""),
      );
      persistChat();
    } catch (e) {
      pushMessage("assistant", t("udFail", { msg: describeUndoError(e) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoStack, applyUndoEntry, t]);

  /** Undo the most recent change touching `path` (out-of-order allowed). */
  const handleUndoPath = useCallback(
    async (path: string) => {
      const idx = [...undoStack]
        .map((e, i) => ({ e, i }))
        .reverse()
        .find(({ e }) => e.path === path || (e.dirFiles ?? []).some((f) => f.path === path))
        ?.i;
      if (idx === undefined) {
        pushMessage("assistant", t("udNothing"));
        return;
      }
      const entry = undoStack[idx];
      try {
        await applyUndoEntry(entry);
        setUndoStack((prev) => prev.filter((_, i) => i !== idx));
        setTreeVersion((v) => v + 1);
        pushMessage(
          "assistant",
          t("udUndone", { name: undoDisplayName(entry.path) || entry.path }) +
            (entry.truncated ? " " + t("udPartial") : ""),
        );
        persistChat();
      } catch (e) {
        pushMessage("assistant", t("udFail", { msg: describeUndoError(e) }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [undoStack, applyUndoEntry, t],
  );

  /** Keyword search across saved messages (palette content matches). */
  const searchSessionContents = useCallback(
    async (q: string): Promise<SessionHit[]> => {
      const query = q.trim().toLowerCase();
      if (query.length < 2) return [];
      const list = (
        await sessionStore.list().catch(() => [])
      ).filter((s) => s.filename && s.filename.trim());
      const out: SessionHit[] = [];
      for (const s of list.slice(0, 30)) {
        try {
          const msgs = await sessionStore.load(s.filename).catch(() => []);
          const hit = msgs.find(
            (m) => typeof m.content === "string" && m.content.toLowerCase().includes(query),
          );
          if (!hit || typeof hit.content !== "string") continue;
          const idx = hit.content.toLowerCase().indexOf(query);
          const start = Math.max(0, idx - 40);
          const snippet =
            (start > 0 ? "…" : "") +
            hit.content.slice(start, start + 120).replace(/\s+/g, " ") +
            (start + 120 < hit.content.length ? "…" : "");
          out.push({ filename: s.filename, title: displayTitle(s), snippet });
          if (out.length >= 10) break;
        } catch {
          // skip one bad session, keep searching the rest
        }
      }
      return out;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [useDb, workspace.connected],
  );

  const refreshSessions = useCallback(async () => {    try {
      setSessionList(await sessionStore.list());
    } catch (e) {
      console.error("Failed to load sessions:", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useDb, workspace.connected]);

  // When the workspace connects, switch the dropdown to that folder's
  // `.canary/sessions/`. First connect migrates any browser-localStorage
  // sessions into the folder once so nothing is lost.
  useEffect(() => {
    currentSessionFileRef.current = null;
    setCurrentFile(null);
    if (!workspace.connected) {
      void listLocalSessions()
        .then(setSessionList)
        .catch((e) => console.error("Failed to load sessions:", e));
      return;
    }
    void (async () => {
      try {
        const existing = await listWorkspaceSessions(workspace);
        if (existing.length === 0) {
          const local = await listLocalSessions();
          for (const s of local.slice(0, 50)) {
            try {
              const msgs = await loadLocalSession(s.filename);
              if (msgs.length > 0)
                await saveWorkspaceSession(workspace, s.title, msgs, s.filename);
            } catch {
              // skip one bad session, keep migrating the rest
            }
          }
        }
        setSessionList(await listWorkspaceSessions(workspace));
      } catch (e) {
        console.error("Failed to load workspace sessions:", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.connected]);

  // Startup: history + model session (waits for stored provider/key
  // settings to load, or the wrong provider would connect).
  useEffect(() => {
    if (!model.hydrated) return;
    if (startedRef.current) return;
    startedRef.current = true;
    let stored: ChatMessage[] = [];
    try {
      stored = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      if (!Array.isArray(stored)) stored = [];
    } catch {
      stored = [];
    }
    void refreshSessions();
    void (async () => {
      const avail = await model.supported();
      if (avail === "unavailable" || avail === "unsupported") {
        setMessages(stored);
        hydratedRef.current = true;
        return;
      }
      if (avail === "downloading" || avail === "downloadable") {
        // Chrome requires a user click to start the model download, so don't
        // auto-create here — the start button in the sidebar does it.
        setMessages(stored);
        hydratedRef.current = true;
        return;
      }
      if (stored.length > 0) {
        // Auto-restore, no popup: last chat comes back as-is.
        setMessages(stored);
        hydratedRef.current = true;
        if (!(await model.restoreSession(stored))) await model.createSession();
      } else {
        hydratedRef.current = true;
        await model.createSession();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.hydrated]);

  const handleNewChat = useCallback(() => {
    cancelPendingReview();
    model.destroy();
    localStorage.removeItem(HISTORY_KEY);
    currentSessionFileRef.current = null;
    setCurrentFile(null);
    setMessages([]);
    void model.supported().then((avail) => {
      // Clicking "New chat" counts as the user gesture, so creating is allowed
      // even when the model still needs downloading.
      if (avail !== "unavailable" && avail !== "unsupported")
        void model.createSession();
    });
    setTimeout(() => document.getElementById("prompt-input")?.focus(), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleProviderSwitch = useCallback(
    async (p: Provider) => {
      if (p === model.provider || model.busyRef.current) return;
      cancelPendingReview();
      model.destroy();
      model.setProvider(p);
      const avail = await model.supported();
      if (avail === "unavailable" || avail === "unsupported") return;
      const msgs = messagesRef.current;
      if (msgs.length > 0) await model.restoreSession(msgs);
      else await model.createSession();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model.provider],
  );

  // On phones only Cloud can work — steer there automatically once ready.
  useEffect(() => {
    if (isMobile && model.hydrated && (model.provider === "gemma" || model.provider === "ollama")) {
      void handleProviderSwitch("cloud");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, model.hydrated]);

  const handleLoadSessionFile = useCallback(
    async (filename: string) => {
      if (!filename) return;
      try {
        const msgs = await sessionStore.load(filename);
        currentSessionFileRef.current = filename;
        setCurrentFile(filename);
        setMessages(msgs);
        model.destroy();
        await model.restoreSession(msgs);
      } catch (e) {
        console.error("Failed to load session:", e);
        // Storage and list disagree (deleted elsewhere, failed write) —
        // drop the ghost row now instead of leaving one that can never
        // open, and say so in chat rather than crashing.
        setSessionList((prev) => prev.filter((s) => s.filename !== filename));
        if (currentSessionFileRef.current === filename) {
          currentSessionFileRef.current = null;
          setCurrentFile(null);
        }
        pushMessage("assistant", t("ssGone"));
        persistChat();
      }
      setTimeout(() => document.getElementById("prompt-input")?.focus(), 0);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspace.connected, t],
  );

  const handleDeleteChat = useCallback(async () => {
    const filename = currentSessionFileRef.current;
    if (!filename) return;
    if (!(await confirmCtl.confirm(t("ssDelete"), "", t("trDelete")))) return;
    let ok = true;
    let failMsg = "";
    try {
      await sessionStore.remove(filename);
    } catch (e) {
      console.error("Delete failed:", e);
      ok = false;
      failMsg = e instanceof Error ? e.message : String(e);
    }
    handleNewChat();
    // The list must reflect the delete even for the active chat —
    // otherwise its row lingers as a ghost that can never open.
    await refreshSessions();
    try {
      toast(ok ? t("trDeleted") : t("trActionFail", { msg: failMsg }));
    } catch {
      // toasts are best-effort
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.connected, t, handleNewChat]);

  const handleDeleteOneChat = useCallback(
    async (filename: string) => {
      if (!filename) return;
      if (!(await confirmCtl.confirm(t("ssDelete"), "", t("trDelete")))) return;
      let ok = true;
      let failMsg = "";
      try {
        await sessionStore.remove(filename);
      } catch (e) {
        console.error("Delete failed:", e);
        ok = false;
        failMsg = e instanceof Error ? e.message : String(e);
      }
      if (currentSessionFileRef.current === filename) {
        handleNewChat();
      }
      // Always re-read the list: the deleted row must vanish even when
      // it was the active chat (handleNewChat alone leaves a ghost row
      // that throws "Not found" when opened).
      await refreshSessions();
      try {
        toast(ok ? t("trDeleted") : t("trActionFail", { msg: failMsg }));
      } catch {
        // toasts are best-effort
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspace.connected, t, handleNewChat],
  );

  const commitRename = useCallback(
    async (filename: string, draft: string) => {
      setRenaming(null);
      const title = draft.trim().slice(0, 80);
      if (!filename || !title) return;
      try {
        await sessionStore.rename(filename, title);
        await refreshSessions();
      } catch (e) {
        console.error("Rename failed:", e);
        try {
          toast(t("trActionFail", { msg: e instanceof Error ? e.message : String(e) }));
        } catch {
          // toasts are best-effort
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  );

  const handleDeleteAllChats = useCallback(async () => {
    if (!(await confirmCtl.confirm(t("ssDeleteAllConfirm"), "", t("ssDeleteAll")))) return;
    try {
      await sessionStore.clearAll();
    } catch (e) {
      console.error("Delete-all failed:", e);
    }
    handleNewChat();
    setSessionList([]);
    try {
      toast(t("trDeleted"));
    } catch {
      // toasts are best-effort
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.connected, t, handleNewChat]);

  const appendInput = useCallback((text: string) => {
    setInput((prev) => (prev.trim() ? prev.trimEnd() + "\n\n" + text : text));
  }, []);

  /** Chat context menu: delete one message bubble. */
  const deleteMessage = useCallback(
    (idx: number) => {
      setMessages((prev) =>
        idx >= 0 && idx < prev.length ? prev.filter((_, i) => i !== idx) : prev,
      );
      setTimeout(() => persistChat(), 0);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /** Chat context menu: save one message bubble as a file. */
  const saveMessageAsFile = useCallback(
    async (idx: number) => {
      const m = messagesRef.current[idx];
      if (!m || typeof m.content !== "string" || !m.content.trim()) return;
      const stamp = new Date()
        .toISOString()
        .slice(0, 16)
        .replace("T", "-")
        .replace(":", "");
      const filename = `msg-${stamp}.md`;
      const body = m.content.trimEnd() + "\n";
      try {
        if (workspace.connected) {
          const rel = `downloads/${filename}`;
          await workspace.makeDir("downloads").catch(() => {});
          await workspace.writeFile(rel, body);
          setTreeVersion((v) => v + 1);
        } else {
          await serverWriteFile(`uploads/${filename}`, body);
          setTreeVersion((v) => v + 1);
        }
        toast(t("svSaved", { name: filename }));
      } catch (e) {
        toast(t("trActionFail", { msg: e instanceof Error ? e.message : String(e) }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspace.connected, t],
  );

  const readInput = useCallback(() => input, [input]);

  const closeEditor = useCallback((focusChat = true) => {
    setEditorPath(null);
    if (focusChat) {
      setTimeout(
        () => document.getElementById("prompt-input")?.focus(),
        0,
      );
    }
  }, []);

  const openFileAndCloseDrawer = useCallback((p: string) => {
    setSideOpen(false);
    // Pictures go to the viewer — never the text editor.
    if (/\.(png|jpe?g|webp|gif|bmp|svg|ico)$/i.test(p)) {
      void (async () => {
        try {
          const blob = workspace.connected
            ? await workspace.readBinary(p)
            : await readFileBinary(p);
          const name = p.split("/").pop() ?? p;
          setViewImage({ name, url: URL.createObjectURL(blob) });
        } catch (e) {
          console.error("Failed to open image:", e);
        }
      })();
      return;
    }
    setEditorPath(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace]);

  const handleSaveChatAsFile = useCallback(async () => {
    const msgs = messagesRef.current;
    if (msgs.length === 0) {
      alert(t("svEmpty"));
      return;
    }
    const title = titleFor(msgs, t);
    const stamp = new Date()
      .toISOString()
      .slice(0, 16)
      .replace("T", "-")
      .replace(":", "");
    const filename = `chat-${stamp}.md`;
    const body =
      `# ${title}\n\n` +
      msgs
        .map((m) => {
          const pic = m.image ? `\n\n![${m.image.name}](${m.image.rel})` : "";
          return `${m.role === "user" ? "🧑" : "🤖"}\n\n${m.content}${pic}`;
        })
        .join("\n\n---\n\n") +
      "\n";
    if (workspace.connected) {
      const rel = `chats/${filename}`;
      try {
        await workspace.makeDir("chats");
        await workspace.writeFile(rel, body);
        setTreeVersion((v) => v + 1);
        alert(t("svSaved", { name: rel }));
      } catch (e) {
        alert(t("trActionFail", { msg: e instanceof Error ? e.message : String(e) }));
      }
      return;
    }
    try {
      const blob = new Blob([body], { type: "text/markdown" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      alert(t("svDownloaded", { name: filename }));
    } catch (e) {
      alert(t("trActionFail", { msg: e instanceof Error ? e.message : String(e) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.connected, t]);

  const showFlags =
    model.provider === "gemma" &&
    (model.availability === "unsupported" ||
      model.availability === "unavailable");
  const showStartButton =
    !model.ready &&
    model.availability !== null &&
    model.availability !== "unavailable" &&
    model.availability !== "unsupported";

  return (
    <MotionConfig reducedMotion="user">
      <Tooltip.Provider delayDuration={400}>
      <Toaster
        position="bottom-center"
        theme={isDarkTheme(theme) ? "dark" : "light"}
        gap={8}
        toastOptions={{
          style: {
            background: "var(--model-bar-bg)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            fontSize: 13,
          },
        }}
      />
      {model.download.show ? (
        <div id="download-overlay" className="download-overlay">
          <div className="download-card">
            <h3>{t("pgDlTitle")}</h3>
            <p id="download-status">{model.download.label || t("pgPreparing")}</p>
            <div className="download-bar-container">
              <div
                id="download-bar"
                className="download-bar"
                style={{ width: model.download.pct + "%" }}
              />
            </div>
            <p id="download-pct" className="download-pct">
              {Math.round(model.download.pct)}%
            </p>
          </div>
        </div>
      ) : null}

      <div className={`sidebar${sideOpen ? " open" : ""}`}>
        <div className="model-header">
          <span
            className="dot"
            id="model-dot"
            style={{ background: model.online ? "#2e7d32" : "#ccc" }}
          />
          {model.provider === "gemma" ? "Gemma 4" : model.provider === "ollama" ? (model.ollamaModel || "Local") : (model.geminiModel.split("-").slice(0, 2).join("-") || "Cloud")}
        </div>

        <div className="privacy-badge" title="Privacy">
          {model.provider === "cloud" ? t("pgPrivacyCloud") : t("pgPrivacy")}
        </div>

        {streak > 1 ? (
          <div className="privacy-badge" title={t("streakDays", { n: streak })}>
            {t("streakDays", { n: streak })}
          </div>
        ) : null}
        {achCount > 0 ? (
          <div
            className="privacy-badge"
            title={ACHIEVEMENTS.filter((a) => {
              try {
                return loadUnlocked().has(a.id);
              } catch {
                return false;
              }
            })
              .map((a) => `${a.icon} ${t(a.nameKey)}`)
              .join(" · ")}
          >
            🏆 {achCount}
          </div>
        ) : null}

        <details className="side-group" open>
          <summary>{t("pgModelTitle")}</summary>
          <div className="workspace-box" id="model-box" style={{ marginTop: 0 }}>
          <div className="workspace-actions">
            {isMobile ? null : (
              <>
                <button
                  className={`sidebar-btn small${model.provider === "gemma" ? " secondary" : ""}`}
                  onClick={() => void handleProviderSwitch("gemma")}
                  title="Gemma"
                >
                  {t("pgGemma")}
                </button>
                <button
                  className={`sidebar-btn small${model.provider === "ollama" ? " secondary" : ""}`}
                  onClick={() => void handleProviderSwitch("ollama")}
                  title="Ollama"
                >
                  {t("pgOllama")}
                </button>
              </>
            )}
            <button
              className={`sidebar-btn small${model.provider === "cloud" ? " secondary" : ""}`}
              onClick={() => void handleProviderSwitch("cloud")}
              title="Cloud"
            >
              {t("pgCloud")}
            </button>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
            <span style={{ fontSize: 12, opacity: 0.75, flex: "0 0 auto" }}>{t("thPersonality")}</span>
            <select
              className="sidebar-btn small"
              value={personality}
              onChange={(e) => setPersonality(e.target.value)}
              style={{ flex: 1, cursor: "pointer" }}
            >
              {(
                [
                  ["default", t("psDefault")],
                  ["concise", t("psConcise")],
                  ["pirate", t("psPirate")],
                  ["poet", t("psPoet")],
                  ["buddy", t("psBuddy")],
                ] as Array<[string, string]>
              ).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {model.provider === "ollama" ? (
            <>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  className="sidebar-btn small"
                  style={{ flex: 1, cursor: "text" }}
                  value={ollamaUrlDraft}
                  onChange={(e) => setOllamaUrlDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      model.setOllamaUrl(ollamaUrlDraft.trim() || model.ollamaUrl);
                      void model.refreshOllamaModels();
                    }
                  }}
                  placeholder={t("pgOllamaUrl")}
                  title={t("pgOllamaUrl")}
                />
                <button
                  className="sidebar-btn small"
                  style={{ flex: "0 0 auto" }}
                  title={t("pgOllamaCheck")}
                  disabled={model.ollamaChecking}
                  onClick={() => {
                    model.setOllamaUrl(ollamaUrlDraft.trim() || model.ollamaUrl);
                    void model.refreshOllamaModels();
                  }}
                >
                  {model.ollamaChecking ? "⏳" : t("pgOllamaCheck")}
                </button>
              </div>
              {model.ollamaModels.length > 0 ? (
                <select
                  className="sidebar-btn small"
                  id="ollama-model-select"
                  value={model.ollamaModel}
                  onChange={(e) => {
                    model.setOllamaModel(e.target.value);
                    void model.reconnect();
                  }}
                >
                  {model.ollamaModel ? null : (
                    <option value="">{t("pgOllamaPick")}</option>
                  )}
                  {model.ollamaModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="workspace-hint">
                  {model.ollamaChecking
                    ? t("pgOllamaChecking")
                    : model.ollamaError === "none"
                      ? t("pgOllamaNone")
                      : t("pgOllamaCors")}
                </div>
              )}
            </>
          ) : null}
          {model.provider === "cloud" ? (
            <>
              {member && !model.geminiKey ? (
                <div className="workspace-hint" style={{ color: "#2e7d32", fontWeight: 600 }}>
                  {t("lgMember", { user: auth.user ?? "" })}
                </div>
              ) : null}
              <input
                className="sidebar-btn small"
                style={{ width: "100%", cursor: "text" }}
                type="password"
                autoComplete="off"
                value={geminiKeyDraft}
                onChange={(e) => setGeminiKeyDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    model.setGeminiKey(geminiKeyDraft.trim());
                    void model.reconnect();
                  }
                }}
                placeholder={t("pgGeminiKeyPh")}
                title={t("pgGeminiKey")}
              />
              {model.geminiKey ? (
                <div className="workspace-hint" style={{ color: "#2e7d32", fontWeight: 600 }}>
                  {t("kgSaved", { last4: model.geminiKey.slice(-4) })}
                </div>
              ) : null}
              {!model.geminiKey && geminiKeyDraft.trim() ? (
                <div className="workspace-hint" style={{ color: "#e65100", fontWeight: 600 }}>
                  {t("kgApply")}
                </div>
              ) : null}
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className="sidebar-btn small"
                  style={{ flex: 1, justifyContent: "center" }}
                  disabled={model.geminiChecking}
                  onClick={() => {
                    model.setGeminiKey(geminiKeyDraft.trim());
                    void model.reconnect();
                  }}
                >
                  {model.geminiChecking ? "⏳" : t("pgOllamaCheck")}
                </button>
                <button
                  className="sidebar-btn small"
                  style={{ flex: 1, justifyContent: "center" }}
                  onClick={() => setShowKeyHelp((v) => !v)}
                >
                  {t("kgTitle")}
                </button>
              </div>
              <div className="workspace-hint">
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("pgGeminiGetKey")}
                </a>
                {" — "}{t("pgGeminiHint")}
              </div>
              {showKeyHelp || (!model.geminiKey && !member) ? (
                <div className="workspace-hint" style={{ lineHeight: 1.6 }}>
                  <div>{t("kgS1")}</div>
                  <div>{t("kgS2")}</div>
                  <div>{t("kgS3")}</div>
                </div>
              ) : null}
              {model.geminiModels.length > 0 ? (
                <select
                  className="sidebar-btn small"
                  id="gemini-model-select"
                  value={model.geminiModel}
                  onChange={(e) => {
                    model.setGeminiModel(e.target.value);
                    void model.reconnect();
                  }}
                >
                  {model.geminiModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : model.geminiError === "bad-key" ? (
                <div className="workspace-error">{t("stCloudBadKey")}</div>
              ) : model.geminiError && model.geminiError !== "need-key" ? (
                <div className="workspace-hint">
                  {model.geminiError === "none" ? t("pgGeminiNone") : t("stCloudFail")}
                </div>
              ) : null}
              {model.geminiModel ? (
                <UsageBlock model={model.geminiModel} t={t} />
              ) : null}
            </>
          ) : null}
        </div>

        {showStartButton ? (
          <button
            className="sidebar-btn"
            id="enable-model-btn"
            onClick={() => void model.createSession()}
          >
            {t("pgStartAi")}
          </button>
        ) : null}
        </details>

        <button className="sidebar-btn" id="new-chat-btn" onClick={handleNewChat} disabled={!model.ready}>
          {t("pgNewChat")}
        </button>

        <button
          className="sidebar-btn small secondary"
          id="save-chat-btn"
          onClick={() => void handleSaveChatAsFile()}
          disabled={messages.length === 0}
          style={{ marginTop: 6 }}
        >
          {t("svSave")}
        </button>

        <select
          className="sidebar-btn small"
          id="session-select"
          defaultValue=""
          onChange={(e) => {
            void handleLoadSessionFile(e.target.value);
            e.target.value = "";
          }}
        >
          <option value="">
            {sessionList.length > 0 ? t("pgPastChats") : t("pgNoPastChats")}
          </option>
          {sessionList
            .filter((s) => s.filename && s.filename.trim())
            .map((s) => (
              <option key={s.filename} value={s.filename}>
                {displayTitle(s)} ({new Date(s.timestamp).toLocaleString()})
              </option>
            ))}
        </select>

        {sessionList.length > 0 ? (
          <details className="side-group" style={{ marginTop: 6 }} open>
            <summary style={{ fontSize: 11 }}>{t("ssManage")}</summary>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4, maxHeight: 180, overflowY: "auto" }}>
          {sessionList
            .filter((s) => s.filename && s.filename.trim())
            .map((s, i) => {
              // Belt-and-braces: title → filename → date, so a row can
              // never render blank. Plain wrapping text (no ellipsis
              // truncation), filename shown inline, native radio to pick.
              const label =
                displayTitle(s).trim() || new Date(s.timestamp).toLocaleString();
              const d = new Date(s.timestamp);
              const when = s.timestamp
                ? `${d.toLocaleDateString()} ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
                : "?";
              const radioId = `chat-pick-${i}`;
              const isCurrent = s.filename === currentFile;
              return (
                <div
                  key={s.filename}
                  style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12, padding: "6px 4px", borderRadius: 6, background: isCurrent ? "var(--border)" : "transparent" }}
                >
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      id={radioId}
                      type="radio"
                      name="canary-chat-pick"
                      checked={isCurrent}
                      onChange={() => void handleLoadSessionFile(s.filename)}
                      title={label}
                      style={{ flex: "0 0 auto", accentColor: "var(--green)" }}
                    />
                    {renaming === s.filename ? (
                      <input
                        autoFocus
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void commitRename(s.filename, renameDraft);
                          else if (e.key === "Escape") setRenaming(null);
                        }}
                        onBlur={() => void commitRename(s.filename, renameDraft)}
                        placeholder={t("ssRename")}
                        maxLength={80}
                        style={{ flex: 1, minWidth: 0, fontSize: 12, padding: "2px 6px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                      />
                    ) : (
                      <label
                        htmlFor={radioId}
                        title={`${label} — click to open`}
                        style={{ flex: 1, minWidth: 0, cursor: "pointer", color: "var(--text)", fontWeight: isCurrent ? 700 : 400, overflowWrap: "break-word" }}
                      >
                        {label}
                      </label>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", paddingLeft: 22 }}>
                    <span
                      title={s.filename}
                      style={{ flex: 1, minWidth: 0, fontSize: 11, opacity: 0.65, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                    >
                      {when} · {s.filename}
                    </span>
                    <button
                      className="sidebar-btn small"
                      style={{ flex: "0 0 auto", width: "auto", padding: "2px 8px" }}
                      title={t("ssRename")}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setRenameDraft(label);
                        setRenaming(s.filename);
                      }}
                    >
                      ✏️
                    </button>
                    <button
                      className="sidebar-btn small"
                      style={{ flex: "0 0 auto", width: "auto", padding: "2px 8px" }}
                      title={t("trDelete")}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        void handleDeleteOneChat(s.filename);
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })}
              <button
                className="sidebar-btn small"
                style={{ justifyContent: "center", marginTop: 4 }}
                onClick={() => void handleDeleteAllChats()}
              >
                {t("ssDeleteAll")}
              </button>
            </div>
          </details>
        ) : null}

        {currentFile ? (
          <div
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
              marginTop: 6,
              fontSize: 12,
            }}
          >
            <span
              style={{
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                opacity: 0.8,
              }}
              title={
                (() => {
                  const cur = sessionList.find((s) => s.filename === currentFile);
                  return cur ? displayTitle(cur) : (currentFile ?? "");
                })()
              }
            >
              💬{" "}
              {(() => {
                const cur = sessionList.find((s) => s.filename === currentFile);
                return cur ? displayTitle(cur) : currentFile;
              })()}
            </span>
            <button
              className="sidebar-btn small"
              style={{ flex: "0 0 auto", width: "auto" }}
              title={t("trDelete")}
              onClick={() => void handleDeleteChat()}
            >
              🗑️
            </button>
          </div>
        ) : null}

        <details className="side-group" open>
          <summary>{t("grpFiles")}</summary>
          <div className="workspace-box" id="hf-box" style={{ marginTop: 8 }}>
            <div className="workspace-name">🖼️ SD 3.5 Medium (HD)</div>
            {member && !hfKey ? (
              <div className="workspace-hint" style={{ color: "#2e7d32", fontWeight: 600 }}>
                {t("lgMember", { user: auth.user ?? "" })}
              </div>
            ) : null}
            <input
              className="sidebar-btn small"
              style={{ width: "100%", cursor: "text" }}
              type="password"
              autoComplete="off"
              value={hfKey}
              onChange={(e) => setHfKeyStored(e.target.value.trim())}
              placeholder={t("cfHFKeyPh")}
              title={t("cfHFKey")}
            />
            {hfKey ? (
              <div className="workspace-hint" style={{ color: "#2e7d32", fontWeight: 600 }}>
                {t("kgSaved", { last4: hfKey.slice(-4) })}
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 6 }}>
              <button
                className="sidebar-btn small"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={() => setShowHfHelp((v) => !v)}
              >
                {t("hgTitle")}
              </button>
            </div>
            <div className="workspace-hint">
              <a
                href="https://huggingface.co/settings/tokens"
                target="_blank"
                rel="noreferrer"
              >
                {t("hgGetToken")}
              </a>
              {" — "}{t("hgHint")}
            </div>
            {showHfHelp || (!hfKey && !member) ? (
              <div className="workspace-hint" style={{ lineHeight: 1.6 }}>
                <div>{t("hgS1")}</div>
                <div>{t("hgS2")}</div>
                <div>{t("hgS3")}</div>
              </div>
            ) : null}
          </div>
          <div className="workspace-box" id="workspace-box">
          {workspace.supported ? (
            workspace.connected ? (
              <>
                <div className="workspace-name" title={workspace.rootName ?? ""}>
                  {workspace.rootName}
                </div>
                <div className="workspace-actions">
                  <button
                    className="sidebar-btn small"
                    onClick={() => {
                      void workspace.pick().then((ok) => {
                        if (ok) {
                          setEditorPath(null);
                          setTreeVersion((v) => v + 1);
                        }
                      });
                    }}
                  >
                    {t("pgChange")}
                  </button>
                  <button
                    className="sidebar-btn small"
                    title={t("pgRemove")}
                    onClick={() => {
                      workspace.disconnect();
                      setEditorPath(null);
                      setTreeVersion((v) => v + 1);
                    }}
                  >
                    ✕
                  </button>
                </div>
              </>
            ) : (
              <button
                className="sidebar-btn primary"
                id="workspace-pick-btn"
                onClick={() => {
                  void workspace.pick().then((ok) => {
                    if (ok) setTreeVersion((v) => v + 1);
                  });
                }}
              >
                📁 {t("pgChooseFolder")}
              </button>
            )
          ) : (
            <div className="workspace-unsupported">
              {t("pgFolderUnsupported")}
            </div>
          )}
          {workspace.error ? (
            <div className="workspace-error">{workspace.error}</div>
          ) : null}
          {workspace.supported && !workspace.connected ? (
            <div className="workspace-hint">
              {t("pgFolderHintPick")}
            </div>
          ) : null}
          {workspace.supported && workspace.connected ? (
            <div className="workspace-hint">
              {t("pgFolderHintSaved")}
            </div>
          ) : null}
        </div>

        {!workspace.connected ? (
          <DownloadsPanel
            version={treeVersion}
            onChanged={() => setTreeVersion((v) => v + 1)}
            onOpenFile={openFileAndCloseDrawer}
            t={t}
          />
        ) : null}

        <FileTree
          onOpenFile={openFileAndCloseDrawer}
          version={treeVersion}
          onMutated={() => setTreeVersion((v) => v + 1)}
          workspace={workspace}
          recordUndo={recordUndo}
          t={t}
        />
        </details>

        <details className="side-group" ref={setupRef}>
          <summary>
            {t("ckTitle")}
            {model.ready &&
            (workspace.connected || !workspace.supported) &&
            searchOk !== false ? null : (
              <span style={{ color: "#e65100" }}> •</span>
            )}
          </summary>
          <div className="note" id="setup-box" style={{ lineHeight: 1.7 }}>
            <CheckRow
              label={t("ckAi")}
              ok={model.ready}
              bad={
                model.availability === "unsupported" ||
                model.availability === "unavailable"
              }
            />
            <CheckRow
              label={
                workspace.connected && workspace.rootName
                  ? `${t("ckFolder")} (${workspace.rootName})`
                  : t("ckFolder")
              }
              ok={workspace.connected || !workspace.supported}
              bad={false}
            />
            <CheckRow label={t("ckSearch")} ok={searchOk === true} bad={searchOk === false} />
            {searchOk === false ? (
              <div style={{ fontSize: 11, opacity: 0.8 }}>{t("ckSearchHint")}</div>
            ) : null}
            {model.provider === "cloud" ? (
              <CheckRow
                label={t("ckKey")}
                ok={!!model.geminiKey && !model.geminiError}
                bad={!!model.geminiKey && model.geminiError === "bad-key"}
              />
            ) : null}
            {trialLeft && !model.geminiKey ? (
              <div style={{ fontSize: 11, opacity: 0.8 }}>
                {trialLimited
                  ? <>💬 {t("trLeft", { n: trialLeft.gemini })} · 🖼️ {t("trLeft", { n: trialLeft.hf })}</>
                  : <>💬 · 🖼️ {t("trUnlimited")}</>}
              </div>
            ) : null}
            <div style={{ fontSize: 11, opacity: 0.7, fontFamily: "monospace" }}>
              {capLine}
            </div>
            {storageLine ? (
              <div style={{ fontSize: 11, opacity: 0.7, fontFamily: "monospace" }}>
                {storageLine}
              </div>
            ) : null}
          </div>

          {showFlags ? (
            <button
              className="sidebar-btn small secondary"
              id="enable-flags-btn"            title={t("pgFlagShow")}
              onClick={() => setShowFlagHelp((v) => !v)}
              style={{ marginTop: 8 }}
            >
              🚩 {showFlagHelp ? t("pgFlagHide") : t("pgFlagShow")}
            </button>
          ) : null}
        {showFlags && showFlagHelp ? (
          <div
            className="note"
            id="flag-help"
            style={{ marginTop: 6, lineHeight: 1.5 }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              {t("pgFlagTitle")}
            </div>
            <div>{t("pgFlagS1")}</div>
            <code style={{ fontSize: 11, wordBreak: "break-all" }}>
              chrome://flags/#prompt-api-for-gemini-nano
            </code>
            <div>{t("pgFlagS1b")}</div>
            <div style={{ marginTop: 4 }}>{t("pgFlagS2")}</div>
            <code style={{ fontSize: 11, wordBreak: "break-all" }}>
              chrome://flags/#optimization-guide-on-device-model
            </code>
            <div>{t("pgFlagS2b")}</div>
            <div style={{ marginTop: 4 }}>
              {t("pgFlagS3a")}{" "}
              <code style={{ fontSize: 11 }}>chrome://components</code>{" "}
              {t("pgFlagS3b")}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button
                className="sidebar-btn small"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={() => {
                  const text =
                    "chrome://flags/#prompt-api-for-gemini-nano\nchrome://flags/#optimization-guide-on-device-model\nchrome://components";
                  void navigator.clipboard
                    ?.writeText(text)
                    .then(() => {
                      setFlagCopied(true);
                      setTimeout(() => setFlagCopied(false), 2000);
                    })
                    .catch(() => {
                      setFlagCopied(false);
                      alert(text);
                    });
                }}
              >
                {flagCopied ? t("pgCopied") : t("pgCopyLinks")}
              </button>
              <button
                className="sidebar-btn small"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={() => {
                  // Chrome blocks pages from opening chrome:// directly,
                  // so just copy + tell the user to paste it manually.
                  const text = "chrome://flags/#prompt-api-for-gemini-nano";
                  void navigator.clipboard?.writeText(text).catch(() => {});
                  alert(
                    t("pgFlagNote") + "\n\n" + text,
                  );
                }}
              >
                {t("pgHowToOpen")}
              </button>
            </div>
            <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6 }}>
              {t("pgFlagNote")}
            </div>
          </div>
        ) : null}

        {!model.ready ? (
          <div className="note">
            {t("pgBrowserNote")}
          </div>
        ) : null}
        <button
          className="sidebar-btn small"
          id="guide-btn"
          onClick={() => setOnboardOpen(true)}
          style={{ marginTop: 8 }}
        >
          {t("obGuide")}
        </button>
        </details>
        <div className="status" id="sidebar-status">
          {model.status}
        </div>
        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: "1px solid var(--border)",
            fontSize: 11,
            opacity: 0.7,
            textAlign: "center",
          }}
        >
          <a
            href="https://github.com/sam79083"
            target="_blank"
            rel="noreferrer"
            style={{ color: "inherit" }}
          >
            GitHub
          </a>
          {" · "}
          <a
            href="https://samori.tistory.com/"
            target="_blank"
            rel="noreferrer"
            style={{ color: "inherit" }}
          >
            Blog
          </a>
          <div style={{ marginTop: 4 }}>© 2026 Sam Oh</div>
        </div>
      </div>

      {sideOpen ? (
        <div className="sidebar-backdrop" onClick={() => setSideOpen(false)} />
      ) : null}

      <div className="main">
        <div className="model-bar">
          <button
            className="hamburger"
            title={t("mbMenu")}
            onClick={() => setSideOpen((v) => !v)}
          >
            ☰
          </button>
          <span className="gemma-badge">
            {model.provider === "gemma" ? "Gemma 4" : model.provider === "ollama" ? (model.ollamaModel || "Local") : (model.geminiModel.split("-").slice(0, 2).join("-") || "Cloud")}
          </span>
          <span id="model-status">{model.status}</span>
          {model.provider === "cloud" && !model.geminiKey && !member && trialLeft ? (
            <span
              id="trial-badge"
              title={trialLimited ? `${t("trLeft", { n: trialLeft.gemini })} · ${t("trLeft", { n: trialLeft.hf })}` : t("trUnlimited")}
              style={{ fontSize: 12, opacity: 0.85, whiteSpace: "nowrap" }}
            >
              {trialLimited
                ? <>💬 {trialLeft.gemini} · 🖼️ {trialLeft.hf}</>
                : <>💬 · 🖼️ {t("trUnlimited")}</>}
            </span>
          ) : null}
          <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {member ? (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    className="theme-toggle"
                    title={auth.user ?? ""}
                    style={{ cursor: "pointer", fontWeight: 700 }}
                  >
                    👤 {auth.user} ✓
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className="menu-content"
                    side="bottom"
                    align="end"
                    sideOffset={6}
                  >
                    <DropdownMenu.Label className="menu-label">
                      {t("lgMember", { user: auth.user ?? "" })}
                    </DropdownMenu.Label>
                    <DropdownMenu.Separator className="menu-separator" />
                    <DropdownMenu.Item
                      className="menu-item"
                      onSelect={() => handleLogout()}
                    >
                      {t("lgLogout")}
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            ) : (
              <button
                className="theme-toggle"
                title={t("lgLogin")}
                onClick={() => setLoginOpen(true)}
                style={{ cursor: "pointer" }}
              >
                {t("lgLogin")}
              </button>
            )}
            <select
              className="theme-toggle"
              title={t("pgLangTitle")}
              value={lang}
              onChange={(e) => {
                if (isLang(e.target.value)) setLang(e.target.value);
              }}
              style={{ cursor: "pointer" }}
            >
              {LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  🌐 {l.label}
                </option>
              ))}
            </select>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  className="theme-toggle"
                  title={`${t("thTheme")}: ${{ light: t("thLight"), dark: t("thDark"), midnight: t("thMidnight"), sepia: t("thSepia"), forest: t("thForest") }[theme]}`}
                  style={{ cursor: "pointer" }}
                >
                  🎨
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="menu-content"
                  side="bottom"
                  align="end"
                  sideOffset={6}
                >
                  <DropdownMenu.Label className="menu-label">
                    {t("thTheme")}
                  </DropdownMenu.Label>
                  <DropdownMenu.Separator className="menu-separator" />
                  {(
                    [
                      ["light", t("thLight")],
                      ["dark", t("thDark")],
                      ["midnight", t("thMidnight")],
                      ["sepia", t("thSepia")],
                      ["forest", t("thForest")],
                    ] as Array<[Theme, string]>
                  ).map(([value, label]) => (
                    <DropdownMenu.Item
                      key={value}
                      className="menu-item"
                      onSelect={() => setTheme(value)}
                    >
                      <span style={{ width: 16 }}>{theme === value ? "✓" : ""}</span>
                      {label}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </span>
        </div>

        <Chat
          messages={messages}
          input={input}
          setInput={setInput}
          sessionRef={model.sessionRef}
          busyRef={model.busyRef}
          modelReady={model.ready}
          setModelStatus={(s, online) => {
            model.setStatus(s);
            model.setOnline(online);
          }}
          pushMessage={pushMessage}
          removeLastAssistant={() =>
            setMessages((prev) =>
              prev.length > 0 && prev[prev.length - 1].role === "assistant"
                ? prev.slice(0, -1)
                : prev,
            )
          }
          deleteMessage={deleteMessage}
          saveMessageAsFile={(idx) => void saveMessageAsFile(idx)}
          persistChat={persistChat}
          workspace={workspace}
          onFilesChanged={() => setTreeVersion((v) => v + 1)}
          onFilesCreated={handleFilesCreated}
          onOpenFile={openFileAndCloseDrawer}
          reviewChange={reviewChange}
          recordUndo={recordUndo}
          undoCount={undoStack.length}
          undoLabel={
            undoStack.length > 0
              ? undoDisplayName(undoStack[undoStack.length - 1].path)
              : null
          }
          onUndo={() => void handleUndo()}
          provider={model.provider}
          ensureVision={model.ensureVisionSession}
          onTrialOver={() => {
            setTrialOverOpen(true);
          }}
          onHelp={() => setShowHelp(true)}
          usageModel={
            model.provider === "cloud"
              ? model.geminiModel
              : model.provider === "ollama"
                ? model.ollamaModel
                : ""
          }
          geminiKey={model.provider === "cloud" ? model.geminiKey : ""}
          hfKey={hfKey}
          personalityLine={personalityPrompt(personality)}
          t={t}
          lang={lang}
        />
      </div>

      <LoginDialog
        open={loginOpen}
        checking={auth.checking}
        error={auth.error}
        onGoogleLogin={auth.loginWithGoogle}
        onClearError={auth.clearError}
        onClose={() => setLoginOpen(false)}
        t={t}
      />

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        sessions={sessionList}
        currentFile={currentFile}
        onPickChat={(filename) => void handleLoadSessionFile(filename)}
        onNewChat={handleNewChat}
        onSaveChat={() => void handleSaveChatAsFile()}
        canSave={messages.length > 0}
        loggedIn={member}
        user={auth.user}
        onLoginClick={() => setLoginOpen(true)}
        onLogoutClick={handleLogout}
        searchContents={searchSessionContents}
        t={t}
      />

      <TrialOverDialog
        open={trialOverOpen}
        saving={trialKeySaving}
        onSaveKey={handleSaveTrialKey}
        onLoginClick={() => setLoginOpen(true)}
        onClose={() => setTrialOverOpen(false)}
        t={t}
      />
      <HelpDialog
        open={showHelp}
        onClose={() => setShowHelp(false)}
        t={t}
      />
      <Confetti burstKey={burstKey} />

      <ConfirmDialog
        req={confirmCtl.req}
        cancelLabel={t("trCancel")}
        onSettle={confirmCtl.settle}
        t={t}
      />

      {editorPath ? (
        <FileEditor
          path={editorPath}
          onClose={() => closeEditor(true)}
          onSaved={() => setTreeVersion((v) => v + 1)}
          workspace={workspace}
          sessionRef={model.sessionRef}
          busyRef={model.busyRef}
          pushMessage={pushMessage}
          appendInput={(text) => {
            appendInput(text);
            closeEditor(true);
          }}
          readInput={readInput}
          persistChat={persistChat}
          recordUndo={recordUndo}
          hasUndoForPath={undoStack.some(
            (e) =>
              e.path === editorPath ||
              (e.dirFiles ?? []).some((f) => f.path === editorPath),
          )}
          onUndoPath={() => void handleUndoPath(editorPath)}
          undoStack={undoStack}
          t={t}
        />
      ) : null}

      {onboardOpen ? (
        <Onboarding
          t={t}
          folderChosen={workspace.connected}
          folderName={workspace.rootName}
          folderSupported={workspace.supported}
          folderError={workspace.error}
          onPickFolder={handleOnboardPickFolder}
          onDone={closeOnboard}
          onSkip={closeOnboard}
        />
      ) : null}

      {viewImage ? (
        <div className="review-overlay" id="image-viewer">
          <div className="review-card" style={{ textAlign: "center" }}>
            <h3>🖼️ {viewImage.name}</h3>
            <img
              src={viewImage.url}
              alt={viewImage.name}
              style={{ maxWidth: "100%", maxHeight: "65vh", borderRadius: 8, margin: "8px 0" }}
            />
            <div className="review-actions" style={{ justifyContent: "center" }}>
              <a
                className="editor-btn primary"
                href={viewImage.url}
                download={viewImage.name}
                style={{ textDecoration: "none" }}
              >
                ⬇ Save
              </a>
              <button
                className="editor-btn"
                onClick={() => {
                  URL.revokeObjectURL(viewImage.url);
                  setViewImage(null);
                  setTimeout(() => document.getElementById("prompt-input")?.focus(), 0);
                }}
              >
                {t("edClose")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {review ? (
        <ReviewCard
          key={`${review.kind}:${review.path}`}
          review={review}
          t={t}
          onSettle={settleReview}
        />
      ) : null}
      </Tooltip.Provider>
    </MotionConfig>
  );
}
