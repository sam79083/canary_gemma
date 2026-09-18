"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useLanguage } from "@/hooks/useLanguage";

/**
 * Route crash boundary (covers / and /settings). A render exception
 * becomes this recoverable card instead of a blank page — chats stay
 * persisted (HISTORY_KEY + session backends), so retrying loses nothing.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useLanguage();

  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  return (
    <div className="settings-page" style={{ textAlign: "center" }}>
      <h1 style={{ fontSize: 22, margin: "24px 0 4px" }}>{t("erTitle")}</h1>
      <p style={{ fontSize: 13, opacity: 0.8 }}>{t("erBody")}</p>
      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "center",
          marginTop: 8,
        }}
      >
        <button
          className="sidebar-btn primary"
          onClick={() => reset()}
          style={{ width: "auto", padding: "8px 16px" }}
        >
          {t("erRetry")}
        </button>
        <Link
          href="/"
          className="sidebar-btn secondary"
          style={{ width: "auto", padding: "8px 16px", textDecoration: "none" }}
        >
          {t("seBack")}
        </Link>
      </div>
    </div>
  );
}
