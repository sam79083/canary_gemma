"use client";

import { LANGS, isLang } from "@/lib/i18n";
import { THEMES, type Theme } from "@/lib/theme";
import { useLanguage } from "@/hooks/useLanguage";
import { useTheme } from "@/hooks/useTheme";

const THEME_LABEL: Record<Theme, string> = {
  light: "thLight",
  dark: "thDark",
  midnight: "thMidnight",
  sepia: "thSepia",
  forest: "thForest",
};

/** Appearance: theme + UI language (both apply instantly, stored locally). */
export default function AppearanceSection() {
  const { lang, setLang, t } = useLanguage();
  const { theme, setTheme } = useTheme();

  return (
    <section className="settings-section">
      <h2>{t("seAppearance")}</h2>
      <div className="settings-row">
        <span className="settings-label">{t("thTheme")}</span>
        <select
          className="sidebar-btn small"
          value={theme}
          onChange={(e) => {
            const v = e.target.value;
            if ((THEMES as string[]).includes(v)) setTheme(v as Theme);
          }}
          style={{ cursor: "pointer" }}
        >
          {THEMES.map((th) => (
            <option key={th} value={th}>
              {t(THEME_LABEL[th])}
            </option>
          ))}
        </select>
      </div>
      <div className="settings-row">
        <span className="settings-label">{t("pgLangTitle")}</span>
        <select
          className="sidebar-btn small"
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
      </div>
    </section>
  );
}
