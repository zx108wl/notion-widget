import { useEffect, useMemo, useState } from "react";
import { loadManifest, loadDefinition, type WidgetMeta } from "../../core/loader.js";
import type { WidgetCatalogValue } from "../context/WidgetCatalogContext.js";

// 加载 widget 清单（单例 manifestPromise 已在 loader 内部缓存）
// 替代原 App.tsx 中向 window.__widgetCatalog / __widgetGetDefinition 注入的反模式
export function useWidgetCatalog(): WidgetCatalogValue {
  const [widgets, setWidgets] = useState<WidgetMeta[]>([]);
  const [catalog, setCatalog] = useState<Record<string, WidgetMeta>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadManifest()
      .then((result) => {
        if (cancelled) return;
        setCatalog(result);
        setWidgets(Object.values(result));
      })
      .catch((err) => {
        if (cancelled) return;
        setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadDefinitionFn = useMemo(
    () => (widgetId: string, signal?: AbortSignal) => loadDefinition(catalog, widgetId, signal),
    [catalog],
  );

  return { widgets, catalog, loading, error, loadDefinition: loadDefinitionFn };
}
