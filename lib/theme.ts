// Visual themes. One mechanism only: `document.body.dataset.theme`.
// The old `body.dark` class is gone — "dark" is just another value here,
// so stored "dark"/"light" settings from earlier versions keep working.

export type Theme = "light" | "dark" | "midnight" | "sepia" | "forest";

export const THEMES: Theme[] = ["light", "dark", "midnight", "sepia", "forest"];

export const THEME_KEY = "theme";

export function isTheme(v: unknown): v is Theme {
  return (
    v === "light" ||
    v === "dark" ||
    v === "midnight" ||
    v === "sepia" ||
    v === "forest"
  );
}

/** Which themes need light-on-dark chrome (toaster, etc.). */
export function isDarkTheme(t: Theme): boolean {
  return t === "dark" || t === "midnight";
}
