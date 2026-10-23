import { createAsyncCache } from "./cache/async-cache.js";
import { createRequestCache } from "./cache/request-cache.js";
import {
  assertWidgetConfig,
  resolveFields,
  widgetConfigUrl,
  widgetMetadata,
} from "./schema/widget-config.runtime.js";
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
  defaultSize?: { width: number; height: number };
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

export async function loadDefinition(
  widgetsCatalog: Record<string, WidgetMeta>,
  widgetId: string,
  signal?: AbortSignal,
): Promise<DefinitionResult> {
  if (!Object.hasOwn(widgetsCatalog, widgetId)) throw new Error("组件不存在");
  const definition = await definitions.get(widgetConfigUrl(widgetId), signal);
  assertWidgetConfig(definition, widgetId);
  return { config: definition, fields: resolveFields(definition) };
}

// 与清单并行发起的配置预取：配置路径由约定确定，无需等待清单返回，
// 后续 loadDefinition 命中同一请求缓存即可，省掉一次串行往返
export function prefetchDefinition(widgetId: string): Promise<unknown> {
  return definitions.get(widgetConfigUrl(widgetId)).catch(() => undefined);
}

export async function loadWidgetDefinition(
  widgetsCatalog: Record<string, WidgetMeta>,
  widgetId: string,
  signal?: AbortSignal,
): Promise<DefinitionResult> {
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
    // 样式与入口模块并发加载：若串行等待 <link> 载完再 import 会多一次串行往返
    const [module] = await Promise.all([
      import(/* @vite-ignore */ entry.js),
      ...(entry.css || []).map(loadStylesheet),
    ]);
    return module;
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
