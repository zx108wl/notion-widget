import "../styles/widget.css";
import { createWidgetRuntime } from "../core/runtime/index.js";
import type { WidgetModule } from "../core/runtime/index.js";
import {
  loadManifest,
  loadWidgetDefinition,
  loadModule,
  prefetchDefinition,
  type WidgetMeta,
} from "../core/loader.js";
import { validateValues, parseParams } from "../core/validation/index.js";
import type { ValidationError } from "../core/validation/index.js";
import type { Field } from "../core/schema/field.schema.js";

const app = document.querySelector("#app")!;
const widgetMatch = window.location.pathname.match(/^\/widget\/([^/]+)\/?$/);

// 嵌入令牌放 URL fragment（`#t=<id>.<secret>`）：fragment 不发送给服务端，
// 因此不进 nginx access log、也不进 Referer；放 query 会两处都进
const authToken = (() => {
  const raw = window.location.hash.slice(1);
  return (raw ? new URLSearchParams(raw).get("t") : null) || undefined;
})();

let widgets: Record<string, WidgetMeta> = {};

initialize();

async function initialize(): Promise<void> {
  try {
    if (widgetMatch && window.parent !== window) {
      try {
        widgets = (window.parent as unknown as { __widgetCatalog?: Record<string, WidgetMeta> }).__widgetCatalog || {};
      } catch {
        /* Cross-origin embedding loads its own catalog. */
      }
    }
    const widgetId = widgetMatch ? decodeURIComponent(widgetMatch[1]) : null;
    if (!Object.keys(widgets).length) {
      // 清单与该插件的配置并行加载：配置路径由约定确定，无需等清单返回，省掉一次串行往返
      const [catalog] = await Promise.all([
        loadManifest(),
        widgetId ? prefetchDefinition(widgetId) : Promise.resolve(),
      ]);
      widgets = catalog;
    }
    if (widgetId) {
      await renderWidget(widgetId);
    }
  } catch (error) {
    console.error(error);
    app.innerHTML = '<p class="load-error">插件清单加载失败，请刷新重试。</p>';
  }
}

async function renderWidget(widgetId: string): Promise<void> {
  document.body.className = "widget-page";
  if (!Object.hasOwn(widgets, widgetId)) {
    document.title = "组件不存在";
    app.innerHTML =
      '<section class="embed-card error-card"><h1>没有找到这个组件</h1><a href="/">返回组件中心</a></section>';
    return;
  }

  const controller = new AbortController();
  let runtime: ReturnType<typeof createWidgetRuntime> | undefined;
  window.addEventListener("pagehide", () => {
    controller.abort();
    runtime?.destroy();
  }, { once: true });

  try {
    const definition = await loadWidgetDefinition(widgets, widgetId, controller.signal);
    const fields: Field[] = definition.fields;
    const parsed = parseParams(fields, new URLSearchParams(window.location.search));
    if (parsed.errors.length) {
      renderErrors(parsed.errors, widgetId);
      return;
    }

    const signature = (config: Record<string, string>) =>
      JSON.stringify(fields.map((field) => config[field.key]));
    let lastConfig = signature(parsed.config);

    const renderConfig = (config: Record<string, string>) => {
      document.body.classList.remove("parameter-error-page");
      document.title = `${widgets[widgetId].name} · Notion Widget`;
      document.documentElement.dataset.theme = config.theme || "auto";
      document.documentElement.style.setProperty(
        "--widget-width",
        config.width ? `${config.width}px` : "auto",
      );
      document.documentElement.style.setProperty(
        "--widget-height",
        config.height ? `${config.height}px` : "auto",
      );
      document.body.classList.toggle("auto-height", !config.height);
    };

    runtime = createWidgetRuntime({
      root: app,
      validate: (config) => validateValues(fields, config),
      loadModule: () =>
        loadModule(widgetId, widgets[widgetId]).then((mod) => mod as WidgetModule),
      showErrors: (errors) => renderErrors(errors as unknown as ValidationError[], widgetId),
      showFailure: renderFailure,
      authToken,
    });

    renderConfig(parsed.config);
    await runtime.render(parsed.config);

    const message = async (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== window.parent ||
        event.data?.type !== "widget-config" ||
        event.data.id !== widgetId
      ) {
        return;
      }
      const values = (event.data.values || {}) as Record<string, string>;
      const errors = validateValues(fields, values);
      if (errors.length) {
        await runtime!.render(values);
        return;
      }
      const nextConfig = signature(values);
      if (nextConfig === lastConfig) return;
      lastConfig = nextConfig;
      renderConfig(values);
      await runtime!.render(values);
    };

    window.addEventListener("message", message, { signal: controller.signal });
    if (window.parent !== window) {
      window.parent.postMessage({ type: "widget-ready", id: widgetId }, window.location.origin);
    }
  } catch (error) {
    if ((error as Error).name !== "AbortError") renderFailure(error as Error);
  }
}

function renderErrors(errors: ValidationError[], widgetId: string): void {
  document.body.classList.add("parameter-error-page");
  app.innerHTML =
    '<section class="embed-card error-card"><h1>插件参数错误</h1><ul class="parameter-errors"></ul></section>';
  const list = app.querySelector("ul")!;
  for (const error of errors) {
    const item = document.createElement("li");
    item.textContent = `${error.label}（${error.key}=${error.value}）：${error.reason}。${error.suggestion}`;
    list.append(item);
  }
  const link = document.createElement("a");
  link.href = `/?widget=${encodeURIComponent(widgetId)}`;
  link.textContent = "打开工作台修正参数";
  app.querySelector("section")!.append(link);
}

function renderFailure(error: Error): void {
  console.error(error);
  app.innerHTML = '<section class="embed-card error-card"><h1>组件加载失败</h1><p>请刷新重试。</p></section>';
}
