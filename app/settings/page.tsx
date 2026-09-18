"use client";

import Link from "next/link";
import { useLanguage } from "@/hooks/useLanguage";
import AppearanceSection from "@/components/settings/AppearanceSection";
import PersonaSection from "@/components/settings/PersonaSection";
import ProviderSection from "@/components/settings/ProviderSection";
import AccountSection from "@/components/settings/AccountSection";

/**
 * Settings, whole page. Every section reads/writes the same stores the
 * chat page uses (localStorage keys + Supabase preferences), so the chat
 * picks changes up when it remounts on return.
 */
export default function SettingsPage() {
  const { t } = useLanguage();

  return (
    <div className="settings-page">
      <div className="settings-top">
        <Link href="/" className="sidebar-btn small settings-back">
          {t("seBack")}
        </Link>
        <h1>{t("seTitle")}</h1>
      </div>
      <AppearanceSection />
      <PersonaSection />
      <ProviderSection />
      <AccountSection />
    </div>
  );
}
