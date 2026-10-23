import { useEffect, useState } from "react";

export type ThemeMode = "auto" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "notion-widget:theme";

function readStoredMode(): ThemeMode {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === "light" || raw === "dark" ? raw : "auto";
}

function resolveMode(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (mode === "auto") return prefersDark ? "dark" : "light";
  return mode;
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => readStoredMode());
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    resolveMode(readStoredMode(), window.matchMedia("(prefers-color-scheme: dark)").matches),
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const next = resolveMode(mode, media.matches);
      setResolved(next);
      document.documentElement.dataset.theme = next;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [mode]);

  const changeMode = (next: ThemeMode) => {
    setMode(next);
    localStorage.setItem(STORAGE_KEY, next);
  };

  return { mode, resolved, changeMode };
}
