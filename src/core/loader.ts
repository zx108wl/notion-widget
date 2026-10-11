import { createAsyncCache } from "./cache/async-cache.js";
import { createRequestCache } from "./cache/request-cache.js";
import { resolveFields, validateConfig, widgetMetadata } from "./schema/widget-config.schema.js";
import type { Field } from "./schema/field.schema.js";
import type { WidgetConfig } from "./schema/widget-config.schema.js";
import type { WidgetIcon } from "./schema/icon.schema.js";

export interface WidgetMeta {
  id: string;
  name: string;
  icon: WidgetIcon;
  summary: string;
  description: string;
  version: string;
  config: string;
  js: string;
  css: string[];
}

export interface DefinitionResult {
  config: WidgetConfig;
  fields: Field[];
}

const modules = createAsyncCache();
const styles = createAsyncCache();
const definitions = createRequestCache<WidgetConfig>(async (url, signal) => {
  const response = await fetch(url, { cache: "no-cache", signal });
  if (!response.ok) throw new Error(`配置加载失败：HTTP ${response.status}`);
  return response.json();
});

export function getWidgetsCatalog(): Record<string, { id: string }> {
  // 由调用方注入
  return {};
}

export async function loadDefinition(
  widgetsCatalog: Record<string, WidgetMeta>,
  widgetId: string,
  signal?: AbortSignal,
): Promise<DefinitionResult> {
  if (!Object.hasOwn(widgetsCatalog, widgetId)) throw new Error("组件不存在");
  const definition = await definitions.get(widgetsCatalog[widgetId].config, signal);
  validateConfig(definition, widgetId);
  return { config: definition, fields: resolveFields(definition) };
}

export async function loadWidgetDefinition(
  widgetsCatalog: Record<string, WidgetMeta>,
  widgetId: string,
  signal?: AbortSignal,
): Promise<DefinitionResult> {
  if (window.parent !== window) {
    try {
      const parentGet = (window.parent as unknown as { __widgetGetDefinition?: typeof loadDefinition }).__widgetGetDefinition;
      if (parentGet) return await parentGet(widgetsCatalog, widgetId, signal);
    } catch (error) {
      if ((error as Error).name !== "SecurityError") throw error;
    }
  }
  return loadDefinition(widgetsCatalog, widgetId, signal);
}

let manifestPromise: Promise<Record<string, WidgetMeta>> | null = null;

export function loadManifest(): Promise<Record<string, WidgetMeta>> {
  if (!manifestPromise) {
    manifestPromise = fetch("/widgets/manifest.json", { cache: "no-cache" })
      .then((response) => {
        if (!response.ok) throw new Error("插件清单加载失败");
        return response.json();
      })
      .catch((error) => {
        manifestPromise = null;
        throw error;
      });
  }
  return manifestPromise;
}

export function loadModule(widgetId: string, entry: WidgetMeta): Promise<unknown> {
  return modules.get(widgetId, async () => {
    await Promise.all((entry.css || []).map(loadStylesheet));
    return import(/* @vite-ignore */ entry.js);
  });
}

export function loadStylesheet(href: string): Promise<void> {
  return styles.get(href, () =>
    new Promise<void>((resolve, reject) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.addEventListener("load", () => resolve(), { once: true });
      link.addEventListener(
        "error",
        () => {
          link.remove();
          reject(new Error(`样式加载失败：${href}`));
        },
        { once: true },
      );
      document.head.append(link);
    }),
  );
}

export { widgetMetadata };
