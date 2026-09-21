// 🧪 PROTOTYPE (branch exp/canvas) — Artifacts canvas demo.
// Renders fenced code blocks from an assistant message as live "artifacts"
// (HTML preview / Markdown preview / raw code) in a side panel.
// Delete this file + revert the two hook sites to discard (see bottom).
"use client";

import { useMemo, useState } from "react";
import { renderMarkdown } from "@/lib/markdown";
import type { ChatMessage } from "@/lib/types";

interface Artifact {
  title: string;
  lang: string;
  code: string;
}

const SAMPLE_MD = `# Weekly plan

## Monday
- [x] Ship the prototype
- [ ] Review translations

## Friday
**Demo day** — show the canvas to the team.
`;

const SAMPLE_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
body { font-family: system-ui; padding: 24px; background: #0f172a; color: #e2e8f0; }
.card { background: #1e293b; border-radius: 12px; padding: 20px; max-width: 420px; }
h1 { margin: 0 0 8px; font-size: 22px; }
</style></head>
<body><div class="card">
<h1>🎨 Canvas demo</h1>
<p>This HTML was rendered live from a code block — no server involved.</p>
<p><b>Scripts are blocked</b> in previews (sandboxed), so pages are safe to open.</p>
</div></body>
</html>`;

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

export default function CanvasPanel({
  message,
  onClose,
}: {
  message: ChatMessage | null;
  onClose: () => void;
}) {
  const artifacts = useMemo<Artifact[]>(() => {
    const found = message ? extractArtifacts(message.content) : [];
    if (found.length > 0) return found;
    // No fences (or no message): show built-in samples so the idea is visible instantly.
    return [
      { title: "sample · markdown", lang: "markdown", code: SAMPLE_MD },
      { title: "sample · html", lang: "html", code: SAMPLE_HTML },
    ];
  }, [message]);
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
        width: "min(560px, 100vw)",
        zIndex: 900,
        display: "flex",
        flexDirection: "column",
        background: "var(--model-bar-bg)",
        borderLeft: "1px solid var(--border)",
        boxShadow: "-8px 0 24px rgba(0,0,0,0.2)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>🎨 Canvas</span>
        <span style={{ fontSize: 11, opacity: 0.7, border: "1px solid var(--border)", borderRadius: 4, padding: "1px 6px" }}>
          🧪 prototype
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => setView("preview")}
          disabled={view === "preview"}
          style={{ fontSize: 12 }}
        >
          Preview
        </button>
        <button
          type="button"
          onClick={() => setView("code")}
          disabled={view === "code"}
          style={{ fontSize: 12 }}
        >
          Code
        </button>
        <button type="button" onClick={copy} style={{ fontSize: 12 }} title="Copy artifact code">
          {copied ? "✓ Copied" : "📋 Copy"}
        </button>
        <button type="button" onClick={onClose} style={{ fontSize: 14 }} title="Close canvas">
          ✕
        </button>
      </div>
      {artifacts.length > 1 ? (
        <div style={{ display: "flex", gap: 6, padding: "8px 12px", borderBottom: "1px solid var(--border)", overflowX: "auto" }}>
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
                fontWeight: sel === i ? 700 : 400,
                textDecoration: sel === i ? "underline" : "none",
              }}
            >
              {a.title}
            </button>
          ))}
        </div>
      ) : null}
      <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
        {!art ? (
          <p style={{ fontSize: 13, opacity: 0.7 }}>Nothing to show.</p>
        ) : view === "code" || !canPreview(art.lang) ? (
          <>
            {!canPreview(art.lang) && view === "preview" ? (
              <p style={{ fontSize: 12, opacity: 0.7 }}>No visual preview for “{art.lang}” — showing code.</p>
            ) : null}
            <pre
              style={{
                fontSize: 12,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                background: "rgba(0,0,0,0.25)",
                borderRadius: 8,
                padding: 12,
                margin: 0,
              }}
            >
              {art.code}
            </pre>
          </>
        ) : art.lang === "html" ? (
          <iframe
            title={art.title}
            sandbox=""
            srcDoc={art.code}
            style={{ width: "100%", height: "100%", minHeight: 400, border: "1px solid var(--border)", borderRadius: 8, background: "#fff" }}
          />
        ) : (
          <div
            className="content md"
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
//   2. components/Chat.tsx — canvasIdx state + <CanvasPanel> render
