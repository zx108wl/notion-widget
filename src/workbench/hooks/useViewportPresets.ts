import { useCallback, useState } from "react";

export interface ViewportPreset {
  label: string;
  width: number;
  height: number;
}

const STORAGE_KEY = "notion-widget:view-presets";

function loadPresets(): ViewportPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// 视口预设管理：localStorage 持久化 + 增删
export function useViewportPresets() {
  const [presets, setPresets] = useState<ViewportPreset[]>(() => loadPresets());

  const savePreset = useCallback((label: string, width: number, height: number) => {
    const next = [...presets, { label, width, height }];
    setPresets(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, [presets]);

  const deletePreset = useCallback((label: string) => {
    const next = presets.filter((p) => p.label !== label);
    setPresets(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, [presets]);

  return { presets, savePreset, deletePreset };
}
