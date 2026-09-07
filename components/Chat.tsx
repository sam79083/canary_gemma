"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { fetchQuota, webSearch } from "@/lib/api";
import type { LanguageModelSession } from "@/lib/prompt-api.d";
import type { BusyKind } from "@/hooks/useLanguageModel";
import type { ChatMessage } from "@/lib/types";

interface Props {
  messages: ChatMessage[];
  input: string;
  setInput: (v: string) => void;
  sessionRef: RefObject<LanguageModelSession | null>;
  busyRef: RefObject<BusyKind>;
  modelReady: boolean;
  setModelStatus: (s: string, online: boolean) => void;
  pushMessage: (role: ChatMessage["role"], content: string) => void;
  persistChat: () => void;
}

export default function Chat({
  messages,
  input,
  setInput,
  sessionRef,
  busyRef,
  modelReady,
  setModelStatus,
  pushMessage,
  persistChat,
}: Props) {
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState<string | null>(null);
  const [quota, setQuota] = useState("🔍 Checking searches left…");
  const [quotaLow, setQuotaLow] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadQuota = useCallback(async () => {
    try {
      const data = await fetchQuota();
      if (data.error) throw new Error(data.error);
      const left = data.total_searches_left ?? data.plan_searches_left;
      setQuota(
        `🔍 ${left} / ${data.searches_per_month} searches left (${data.plan_name || "plan"}, renews ${data.plan_renewal_date || "?"})`,
      );
      setQuotaLow(typeof left === "number" && left < 25);
    } catch (e) {
      setQuota("🔍 Quota unavailable");
      console.warn("[quota] failed:", e);
    }
  }, []);

  useEffect(() => {
    void loadQuota();
  }, [loadQuota]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streamText]);

  const focusInput = () => inputRef.current?.focus();

  const handleSend = useCallback(async () => {
    if (!sessionRef.current || busyRef.current) return;
    const prompt = input.trim();
    if (!prompt) return;
    busyRef.current = "chat";
    setStreaming(true);
    setInput("");
    pushMessage("user", prompt);
    setStreamText("");
    let full = "";
    try {
      const stream = sessionRef.current.promptStreaming(prompt);
      for await (const chunk of stream) {
        full += chunk;
        setStreamText(full);
      }
      if (full.trim()) {
        pushMessage("assistant", full);
        persistChat();
      }
    } catch (e) {
      pushMessage("assistant", `Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      busyRef.current = null;
      setStreaming(false);
      setStreamText(null);
      focusInput();
      persistChat();
    }
  }, [sessionRef, busyRef, input, setInput, pushMessage, persistChat]);

  const handleSearch = useCallback(async () => {
    if (!sessionRef.current || busyRef.current) return;
    const prompt = input.trim();
    if (!prompt) return;
    busyRef.current = "chat";
    setStreaming(true);
    setInput("");
    pushMessage("user", prompt);
    pushMessage("assistant", `🔍 Searching Google for: "${prompt}"…`);
    setStreamText("");
    let full = "";
    try {
      setModelStatus("Searching the web…", true);
      const { results, error } = await webSearch(prompt);
      if (error || results.length === 0) {
        pushMessage(
          "assistant",
          `⚠️ Web search failed${error ? ": " + error : " — no results returned"}. Asking the model without fresh results…`,
        );
      } else {
        pushMessage(
          "assistant",
          `✅ Found ${results.length} results:\n${results.map((r, i) => `${i + 1}. ${r.title} — ${r.url}`).join("\n")}`,
        );
      }
      let context = "";
      if (results.length > 0) {
        context = "\n\n--- Web Search Results (fresh from Google, use these to answer) ---\n";
        for (const r of results)
          context += `\n[${r.source}] ${r.title}: ${r.snippet}\nSource: ${r.url}\n`;
        context += "--- End Search Results ---\n\n";
      }
      const fullPrompt =
        context +
        `User question: ${prompt}\n\n` +
        (results.length > 0
          ? "Instructions: Answer using the Web Search Results above. Do NOT claim you lack real-time access when results are provided. Cite sources by URL. If the results contain the answer (e.g. weather), state it directly."
          : "Instructions: No search results were available. Answer from your own knowledge and say that live search failed.");
      const stream = sessionRef.current.promptStreaming(fullPrompt);
      for await (const chunk of stream) {
        full += chunk;
        setStreamText(full);
      }
      if (full.trim()) {
        pushMessage("assistant", full);
        persistChat();
      }
    } catch (e) {
      pushMessage("assistant", `Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      busyRef.current = null;
      setStreaming(false);
      setStreamText(null);
      focusInput();
      setModelStatus("Ready — Gemma 4 on-device", true);
      persistChat();
      void loadQuota();
    }
  }, [sessionRef, busyRef, input, setInput, pushMessage, persistChat, setModelStatus, loadQuota]);

  const disabled = !modelReady || streaming;

  return (
    <>
      <div className="messages" id="messages">
        {messages.map((m, i) => (
          <div key={i} className={`message ${m.role}`}>
            <div className="avatar">{m.role === "user" ? "U" : "G"}</div>
            <div className="content">{m.content}</div>
          </div>
        ))}
        {streamText !== null ? (
          <div className="message assistant">
            <div className="avatar">G</div>
            <div className="content" id="streaming-content">
              {streamText || (
                <span className="typing-indicator">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </span>
              )}
            </div>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>
      <div className="input-area">
        <div className="input-container">
          <textarea
            id="prompt-input"
            ref={inputRef}
            placeholder="Ask Gemma 4 anything…"
            rows={1}
            disabled={!modelReady || streaming}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          <button
            className="send-btn secondary"
            onClick={() => void handleSearch()}
            disabled={disabled}
            title="Search the web & ask"
          >
            {streaming ? "⏳" : "🔍"}
          </button>
          <button className="send-btn" onClick={() => void handleSend()} disabled={disabled || !input.trim()}>
            {streaming ? "●" : "➤"}
          </button>
        </div>
        <div className={`quota-box input-quota${quotaLow ? " low" : ""}`} title="SerpAPI searches remaining this month">
          <span id="quota-text">{quota}</span>
          <button className="quota-refresh" onClick={() => void loadQuota()} title="Refresh quota">
            ↻
          </button>
        </div>
      </div>
    </>
  );
}
