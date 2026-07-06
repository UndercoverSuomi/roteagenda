export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "rote-agenda-theme";

export function readStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return "system";

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // localStorage kann in strikten Privacy-Modi fehlen.
  }

  return "system";
}

export function storeTheme(preference: ThemePreference) {
  try {
    if (preference === "system") {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, preference);
    }
  } catch {
    // Ohne localStorage gilt die Wahl nur für die aktuelle Sitzung.
  }
}

export function applyTheme(preference: ThemePreference) {
  const resolved =
    preference === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : preference;

  document.documentElement.dataset.theme = resolved;
}

// Muss inhaltlich zu applyTheme/readStoredTheme passen; läuft vor dem ersten
// Paint im <body>, damit die Seite nicht hell aufblitzt.
export const THEME_BOOT_SCRIPT = `(function(){try{var s=localStorage.getItem("${STORAGE_KEY}");var d=s==="dark"||(s!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){document.documentElement.dataset.theme="light"}})();`;
