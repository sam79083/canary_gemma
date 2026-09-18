"use client";

import { useEffect, useState } from "react";
import UsageBlock from "@/components/UsageBlock";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import {
  useLanguageModel,
  type Provider,
} from "@/hooks/useLanguageModel";

const HF_KEY = "canary-hf-token";

function detectMobile(): boolean {
  try {
    return /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(
      navigator.userAgent || "",
    );
  } catch {
    return false;
  }
}

/**
 * Models & keys. Own model instance for selection/validation only — it
 * never creates an AI session here; the chat page picks stored values up
 * on return and connects there.
 */
export default function ProviderSection() {
  const { lang, t } = useLanguage();
  const auth = useAuth();
  const member = auth.user !== null;
  const model = useLanguageModel(lang, t, member);
  const [isMobile, setIsMobile] = useState(false);
  const [ollamaUrlDraft, setOllamaUrlDraft] = useState(model.ollamaUrl);
  const [geminiKeyDraft, setGeminiKeyDraft] = useState(model.geminiKey);
  const [showKeyHelp, setShowKeyHelp] = useState(false);
  const [showHfHelp, setShowHfHelp] = useState(false);
  const [hfKey, setHfKey] = useState("");

  useEffect(() => {
    setIsMobile(detectMobile());
  }, []);

  useEffect(() => {
    setOllamaUrlDraft(model.ollamaUrl);
  }, [model.ollamaUrl]);
  useEffect(() => {
    setGeminiKeyDraft(model.geminiKey);
  }, [model.geminiKey]);
  useEffect(() => {
    try {
      const k = localStorage.getItem(HF_KEY);
      if (k) setHfKey(k);
    } catch {
      // ignore
    }
  }, []);

  const setHfKeyStored = (k: string) => {
    setHfKey(k);
    try {
      localStorage.setItem(HF_KEY, k);
    } catch {
      // ignore
    }
  };

  const switchProvider = async (p: Provider) => {
    if (p === model.provider || model.busyRef.current) return;
    model.setProvider(p);
    await model.supported();
  };

  return (
    <section className="settings-section">
      <h2>{t("seProviders")}</h2>
      <div className="workspace-actions">
        {isMobile ? null : (
          <>
            <button
              className={`sidebar-btn small${model.provider === "gemma" ? " secondary" : ""}`}
              onClick={() => void switchProvider("gemma")}
              title="Gemma"
            >
              {t("pgGemma")}
            </button>
            <button
              className={`sidebar-btn small${model.provider === "ollama" ? " secondary" : ""}`}
              onClick={() => void switchProvider("ollama")}
              title="Ollama"
            >
              {t("pgOllama")}
            </button>
          </>
        )}
        <button
          className={`sidebar-btn small${model.provider === "cloud" ? " secondary" : ""}`}
          onClick={() => void switchProvider("cloud")}
          title="Cloud"
        >
          {t("pgCloud")}
        </button>
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
              value={model.ollamaModel}
              onChange={(e) => {
                model.setOllamaModel(e.target.value);
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
                void model.refreshGeminiModels();
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
                void model.refreshGeminiModels();
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
              value={model.geminiModel}
              onChange={(e) => {
                model.setGeminiModel(e.target.value);
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

      <div className="workspace-box" style={{ marginTop: 12 }}>
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
    </section>
  );
}
