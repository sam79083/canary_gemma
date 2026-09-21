// 🧪 PROTOTYPE (branch exp/canvas) — Artifacts canvas demo.
// Renders fenced code blocks from an assistant message as live "artifacts"
// (HTML preview / Markdown preview / raw code) in a side panel.
// Delete this file + revert the two hook sites to discard (see bottom).
"use client";

import { useMemo, useState, useEffect } from "react";
import { renderMarkdown } from "@/lib/markdown";
import { downloadHref } from "@/lib/api";
import type { ChatMessage } from "@/lib/types";

interface Artifact {
  title: string;
  lang: string;
  code: string;
}

function extractArtifacts(text: string): Artifact[] {
  const out: Artifact[] = [];
  const re = /```(\w*)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text)) !== null) {
    n += 1;
    const lang = (m[1] || "code").toLowerCase();
    out.push({ title: `${lang} · ${n}`, lang, code: m[2].replace(/^\n+|\n+$/g, "") });
  }
  return out;
}

/** Auto-open rule (Claude-style): a fence long enough to deserve a panel. */
export const CANVAS_AUTO_LINES = 15;
export function hasLongFence(text: string): boolean {
  return extractArtifacts(text).some((a) => a.code.split("\n").length >= CANVAS_AUTO_LINES);
}

function canPreview(lang: string): boolean {
  return lang === "html" || lang === "markdown" || lang === "md";
}

/** Max bytes pulled into the panel per file (safety cap). */
const MAX_FILE_BYTES = 200_000;

function extOf(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

/** Files worth opening in the canvas (renderable document types). */
export function isPreviewableFile(name: string): boolean {
  const e = extOf(name);
  return e === "html" || e === "md" || e === "markdown";
}

function langOf(name: string): string {
  const e = extOf(name);
  if (e === "md") return "markdown";
  return e || "code";
}

async function loadFileText(
  name: string,
  path: string,
  viaWorkspace: boolean,
): Promise<string> {
  if (viaWorkspace) {
    const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
    const data = (await res.json()) as { content?: string };
    if (!res.ok || data.content === undefined) throw new Error("unreadable");
    return data.content;
  }
  const res = await fetch(downloadHref(name));
  if (!res.ok) throw new Error("unreadable");
  return await res.text();
}

const iconBtn: React.CSSProperties = {
  border: "1px solid transparent",
  background: "transparent",
  color: "var(--text)",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 12,
  cursor: "pointer",
};

export default function CanvasPanel({
  message,
  workspaceConnected,
  onClose,
}: {
  message: ChatMessage | null;
  workspaceConnected: boolean;
  onClose: () => void;
}) {
  const fenceArts = useMemo<Artifact[]>(
    () => (message ? extractArtifacts(message.content) : []),
    [message],
  );
  // Files written in this turn (agent uploads / workspace files) load as
  // artifacts too — agents usually save documents instead of pasting code.
  const [fileArts, setFileArts] = useState<Artifact[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  useEffect(() => {
    const files = message?.files ?? [];
    const wanted = files.filter((f) => isPreviewableFile(f.name));
    if (wanted.length === 0) {
      setFileArts([]);
      setLoadingFiles(false);
      return;
    }
    let live = true;
    setLoadingFiles(true);
    void (async () => {
      const got: Artifact[] = [];
      for (const f of wanted) {
        try {
          let code = await loadFileText(f.name, f.path, workspaceConnected);
          if (code.length > MAX_FILE_BYTES) code = code.slice(0, MAX_FILE_BYTES) + "\n…(truncated)";
          got.push({ title: `📄 ${f.name}`, lang: langOf(f.name), code });
        } catch {
          // unreadable (binary/gone) — skip silently in prototype
        }
      }
      if (live) {
        setFileArts(got);
        setLoadingFiles(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [message, workspaceConnected]);
  const artifacts = useMemo<Artifact[]>(
    () => [...fileArts, ...fenceArts],
    [fileArts, fenceArts],
  );
  const [sel, setSel] = useState(0);
  const [view, setView] = useState<"preview" | "code">("preview");
  const [copied, setCopied] = useState(false);
  const art = artifacts[Math.min(sel, artifacts.length - 1)];

  const copy = () => {
    if (!art) return;
    try {
      void navigator.clipboard?.writeText(art.code).then(
        () => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        },
        () => {},
      );
    } catch {
      // clipboard unavailable — ignore in prototype
    }
  };

  return (
    <div
      role="complementary"
      aria-label="Canvas prototype"
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: "min(600px, 100vw)",
        zIndex: 900,
        display: "flex",
        flexDirection: "column",
        background: "var(--sidebar-bg)",
        color: "var(--text)",
        borderLeft: "1px solid var(--border)",
        boxShadow: "-12px 0 32px rgba(0,0,0,0.22)",
      }}
    >
      {/* header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 700 }}>🎨 Canvas</span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.4,
            color: "var(--note-text)",
            background: "var(--note-bg)",
            borderRadius: 20,
            padding: "2px 8px",
          }}
        >
          PROTOTYPE
        </span>
        <span style={{ flex: 1 }} />
        <div
          style={{
            display: "flex",
            background: "var(--note-bg)",
            borderRadius: 10,
            padding: 2,
            gap: 2,
          }}
        >
          {(["preview", "code"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              style={{
                ...iconBtn,
                padding: "4px 12px",
                fontWeight: view === v ? 700 : 400,
                background: view === v ? "var(--icon-bg)" : "transparent",
                color: view === v ? "var(--icon-color)" : "var(--note-text)",
              }}
            >
              {v === "preview" ? "Preview" : "Code"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={copy}
          title="Copy artifact code"
          style={iconBtn}
          onMouseOver={(e) => ((e.target as HTMLElement).style.background = "var(--icon-bg-hover)")}
          onMouseOut={(e) => ((e.target as HTMLElement).style.background = "transparent")}
        >
          {copied ? "✓ Copied" : "📋 Copy"}
        </button>
        <button
          type="button"
          onClick={onClose}
          title="Close canvas"
          style={{ ...iconBtn, fontSize: 14, padding: "6px 8px" }}
          onMouseOver={(e) => ((e.target as HTMLElement).style.background = "var(--icon-bg-hover)")}
          onMouseOut={(e) => ((e.target as HTMLElement).style.background = "transparent")}
        >
          ✕
        </button>
      </div>

      {/* artifact tabs */}
      {artifacts.length > 1 ? (
        <div
          style={{
            display: "flex",
            gap: 6,
            padding: "10px 16px",
            borderBottom: "1px solid var(--border)",
            overflowX: "auto",
          }}
        >
          {artifacts.map((a, i) => (
            <button
              key={a.title}
              type="button"
              onClick={() => {
                setSel(i);
                setView("preview");
              }}
              style={{
                fontSize: 12,
                whiteSpace: "nowrap",
                borderRadius: 20,
                border: "1px solid var(--border)",
                padding: "4px 12px",
                cursor: "pointer",
                fontWeight: sel === i ? 700 : 400,
                background: sel === i ? "var(--icon-bg)" : "transparent",
                color: sel === i ? "var(--icon-color)" : "var(--note-text)",
              }}
            >
              {a.title}
            </button>
          ))}
        </div>
      ) : null}

      {/* body */}
      <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
        {loadingFiles && !art ? (
          <div style={{ textAlign: "center", marginTop: 72, color: "var(--note-text)" }}>
            <div style={{ fontSize: 40 }}>📄</div>
            <p style={{ fontSize: 13, marginTop: 12 }}>Loading document…</p>
          </div>
        ) : !art ? (
          <div style={{ textAlign: "center", marginTop: 72, color: "var(--note-text)" }}>
            <div style={{ fontSize: 40 }}>🎨</div>
            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: "12px 0 6px" }}>
              No document in this answer
            </p>
            <p style={{ fontSize: 13, margin: 0, lineHeight: 1.6 }}>
              Ask the AI to write something substantial —
              <br />
              a letter, a report, a study guide, a web page —
              <br />
              and it will open here as a readable document.
            </p>
          </div>
        ) : view === "code" || !canPreview(art.lang) ? (
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 12,
              overflow: "hidden",
              background: "var(--model-bar-bg)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "8px 12px",
                borderBottom: "1px solid var(--border)",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                color: "var(--note-text)",
              }}
            >
              {art.lang}
              <span style={{ flex: 1 }} />
              <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                {art.code.split("\n").length} lines
              </span>
            </div>
            <pre
              style={{
                fontSize: 12.5,
                lineHeight: 1.65,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                padding: 14,
                margin: 0,
                maxHeight: "100%",
                overflow: "auto",
              }}
            >
              {art.code}
            </pre>
          </div>
        ) : art.lang === "html" ? (
          <iframe
            title={art.title}
            sandbox=""
            srcDoc={art.code}
            style={{
              width: "100%",
              height: "100%",
              minHeight: 480,
              border: "1px solid var(--border)",
              borderRadius: 12,
              background: "#fff",
            }}
          />
        ) : (
          <div
            className="content md"
            style={{
              background: "var(--model-bar-bg)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: "20px 22px",
            }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(art.code, "Copy") }}
          />
        )}
      </div>
    </div>
  );
}

// DISCARD INSTRUCTIONS:
//   git checkout main && git branch -D exp/canvas
// Hook sites to revert (only if merging nothing):
//   1. components/chat/MessageList.tsx — onOpenCanvas prop + 🎨 button
//   2. components/Chat.tsx — canvasIdx state + auto-open effect + <CanvasPanel> render
