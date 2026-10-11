import { useEffect, useState } from "react";

export type ThemeMode = "auto" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "notion-widget:theme";

export function loadThemeMode(): ThemeMode {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === "light" || raw === "dark" ? raw : "auto";
}

export function saveThemeMode(mode: ThemeMode) {
  localStorage.setItem(STORAGE_KEY, mode);
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => loadThemeMode());
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    loadThemeMode() === "dark" ||
    (loadThemeMode() === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches)
      ? "dark"
      : "light",
  );

  // 跟随系统变化 + 同步到 <html data-theme>
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const next: ResolvedTheme = mode === "auto" ? (media.matches ? "dark" : "light") : mode;
      setResolved(next);
      document.documentElement.dataset.theme = next;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [mode]);

  const changeMode = (next: ThemeMode) => {
    setMode(next);
    saveThemeMode(next);
  };

  return { mode, resolved, changeMode };
}
