"use client";

import { useState } from "react";
import LoginDialog from "@/components/LoginDialog";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";

/** Member account: status, Google login, logout. */
export default function AccountSection() {
  const { t } = useLanguage();
  const auth = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    <section className="settings-section">
      <h2>{t("seAccount")}</h2>
      {auth.user ? (
        <>
          <div className="workspace-hint" style={{ color: "#2e7d32", fontWeight: 600 }}>
            {t("lgMember", { user: auth.user })}
          </div>
          <button
            className="sidebar-btn small"
            style={{ justifyContent: "center" }}
            onClick={() => void auth.logout()}
          >
            {t("lgLogout")}
          </button>
        </>
      ) : (
        <>
          <div className="workspace-hint">{t("seAccountHint")}</div>
          <button
            className="sidebar-btn small"
            style={{ justifyContent: "center" }}
            onClick={() => setLoginOpen(true)}
          >
            {t("lgLogin")}
          </button>
        </>
      )}
      <LoginDialog
        open={loginOpen}
        checking={auth.checking}
        error={auth.error}
        onGoogleLogin={auth.loginWithGoogle}
        onClearError={auth.clearError}
        onClose={() => setLoginOpen(false)}
        t={t}
      />
    </section>
  );
}
