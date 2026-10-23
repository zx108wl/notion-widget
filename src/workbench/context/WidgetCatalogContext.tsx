import { createContext, useContext } from "react";
import type { WidgetMeta } from "../../core/loader.js";
import type { DefinitionResult } from "../../core/loader.js";

export interface WidgetCatalogValue {
  widgets: WidgetMeta[];
  catalog: Record<string, WidgetMeta>;
  loading: boolean;
  error: string | null;
  loadDefinition: (widgetId: string, signal?: AbortSignal) => Promise<DefinitionResult>;
}

export const WidgetCatalogContext = createContext<WidgetCatalogValue | null>(null);

export function useWidgetCatalog(): WidgetCatalogValue {
  const ctx = useContext(WidgetCatalogContext);
  if (!ctx) throw new Error("useWidgetCatalog 必须在 WidgetCatalogProvider 内使用");
  return ctx;
}
