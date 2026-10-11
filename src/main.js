import "./style.css";
import { createWidgetIcon } from "./widget-icon.js";
import { resolveFields, validateConfig } from "./widget-config.js";
import { parseParams, validateValue, validateValues } from "./config-validation.js";
import { mountControl } from "./controls/index.js";
import { createAsyncCache } from "./async-cache.js";
import { createRequestCache } from "./request-cache.js";
import { createWidgetRuntime } from "./widget-runtime.js";

let widgets = {};
const app = document.querySelector("#app");
const widgetMatch = window.location.pathname.match(/^\/widget\/([^/]+)\/?$/);
const modules = createAsyncCache(), styles = createAsyncCache();
const definitions = createRequestCache(async (url, signal) => {
  const response = await fetch(url, { cache: "no-cache", signal });
  if (!response.ok) throw new Error("配置加载失败：HTTP " + response.status);
  return response.json();
});
let manifestPromise;
initialize();

async function initialize() {
  try {
    if (widgetMatch && window.parent !== window) {
      try { widgets = window.parent.__widgetCatalog || {}; } catch { /* Cross-origin embedding loads its own catalog. */ }
    }
    if (!Object.keys(widgets).length) widgets = await loadManifest();
    if (widgetMatch) await renderWidget(decodeURIComponent(widgetMatch[1]));
    else {
      window.__widgetCatalog = widgets;
      window.__widgetGetDefinition = loadDefinition;
      renderConfigurator();
    }
  } catch (error) {
    console.error(error); app.innerHTML = '<p class="load-error">插件清单加载失败，请刷新重试。</p>';
  }
}

async function loadDefinition(widgetId, signal) {
  if (!Object.hasOwn(widgets, widgetId)) throw new Error("组件不存在");
  const definition = await definitions.get(widgets[widgetId].config, signal);
  validateConfig(definition, widgetId);
  return definition;
}

async function loadWidgetDefinition(widgetId, signal) {
  if (window.parent !== window) {
    try { if (window.parent.__widgetGetDefinition) return await window.parent.__widgetGetDefinition(widgetId, signal); }
    catch (error) { if (error.name !== "SecurityError") throw error; }
  }
  return loadDefinition(widgetId, signal);
}

async function renderWidget(widgetId) {
  document.body.className = "widget-page";
  if (!Object.hasOwn(widgets, widgetId)) {
    document.title = "组件不存在";
    app.innerHTML = '<section class="embed-card error-card"><h1>没有找到这个组件</h1><a href="/">返回组件中心</a></section>'; return;
  }
  const controller = new AbortController(); let runtime;
  window.addEventListener("pagehide", () => { controller.abort(); runtime?.destroy(); }, { once: true });
  try {
    const definition = await loadWidgetDefinition(widgetId, controller.signal);
    const fields = resolveFields(definition, widgetId);
    const parsed = parseParams(fields, new URLSearchParams(window.location.search));
    if (parsed.errors.length) { renderErrors(parsed.errors, widgetId); return; }
    const signature = config => JSON.stringify(fields.map(field => config[field.key]));
    let lastConfig = signature(parsed.config);
    const renderConfig = config => {
      document.body.classList.remove("parameter-error-page");
      document.title = widgets[widgetId].name + " · Notion Widget";
      document.documentElement.dataset.theme = config.theme || "auto";
      document.documentElement.style.setProperty("--widget-width", config.width ? config.width + "px" : "auto");
      document.documentElement.style.setProperty("--widget-height", config.height ? config.height + "px" : "auto");
      document.body.classList.toggle("auto-height", !config.height);
    };
    runtime = createWidgetRuntime({ root: app, validate: config => validateValues(fields, config),
      loadModule: () => modules.get(widgetId, async () => {
        const entry = widgets[widgetId];
        await Promise.all((entry.css || []).map(loadStylesheet));
        return import(/* @vite-ignore */ entry.js);
      }), showErrors: errors => renderErrors(errors, widgetId), showFailure: renderFailure });
    renderConfig(parsed.config); await runtime.render(parsed.config);
    const message = async event => {
      if (event.origin !== window.location.origin || event.source !== window.parent || event.data?.type !== "widget-config" || event.data.id !== widgetId) return;
      const errors = validateValues(fields, event.data.values || {});
      if (errors.length) { await runtime.render(event.data.values || {}); return; }
      const nextConfig = signature(event.data.values);
      if (nextConfig === lastConfig) return;
      lastConfig = nextConfig;
      renderConfig(event.data.values); await runtime.render(event.data.values);
    };
    window.addEventListener("message", message, { signal: controller.signal });
    if (window.parent !== window) window.parent.postMessage({ type: "widget-ready", id: widgetId }, window.location.origin);
  } catch (error) { if (error.name !== "AbortError") renderFailure(error); }
}

function renderErrors(errors, widgetId) {
  document.body.classList.add("parameter-error-page");
  app.innerHTML = '<section class="embed-card error-card"><h1>插件参数错误</h1><ul class="parameter-errors"></ul></section>';
  const list = app.querySelector("ul");
  for (const error of errors) {
    const item = document.createElement("li");
    item.textContent = error.label + "（" + error.key + "=" + error.value + "）：" + error.reason + "。" + error.suggestion;
    list.append(item);
  }
  const link = document.createElement("a"); link.href = "/?widget=" + encodeURIComponent(widgetId); link.textContent = "打开工作台修正参数"; app.querySelector("section").append(link);
}
function renderFailure(error) { console.error(error); app.innerHTML = '<section class="embed-card error-card"><h1>组件加载失败</h1><p>请刷新重试。</p></section>'; }

function renderConfigurator() {
  document.body.className = "config-page"; document.title = "Notion 小组件中心";
  let selectedId = new URLSearchParams(window.location.search).get("widget");
  if (!Object.hasOwn(widgets, selectedId)) selectedId = Object.keys(widgets)[0];
  app.innerHTML = `
    <header class="topbar">
      <a class="brand" href="/"><span class="brand-mark">W</span><span>Notion 小组件</span></a>
      <p>选择组件，生成可嵌入的专属 URL</p>
    </header>
    <div class="workspace">
      <aside class="catalog" aria-label="组件列表">
        <div class="section-label">组件库</div><div id="widget-list" class="widget-list"></div>
      </aside>
      <main class="editor">
        <section class="editor-panel">
          <div class="panel-heading">
            <div><p class="eyebrow">CONFIGURE</p><h1 id="editor-title"></h1><p id="editor-description" class="muted"></p></div>
            <span id="widget-path" class="path-badge"></span>
          </div>
          <form id="config-form" class="config-form"></form>
        </section>
        <section class="preview-panel">
          <div class="preview-heading">
            <div><p class="eyebrow">PREVIEW</p><h2>实时预览</h2></div>
            <button id="open-preview" class="button secondary" type="button">新窗口打开</button>
          </div>
          <div class="preview-stage">
            <div id="preview-frame" class="preview-frame-wrap"><iframe id="preview" title="组件实时预览"></iframe></div>
          </div>
          <p class="preview-size-hint">拖动预览框右下角可调整显示区域，不会改变组件尺寸</p>
          <label class="url-field"><span>嵌入 URL</span><div class="url-row"><input id="result-url" readonly /><button id="copy-url" class="button primary" type="button">复制 URL</button></div></label>
          <p id="copy-status" class="copy-status" role="status"></p>
        </section>
      </main>
    </div>`;

  const list = document.querySelector("#widget-list"), form = document.querySelector("#config-form");
  const preview = document.querySelector("#preview"), resultUrl = document.querySelector("#result-url"), copyStatus = document.querySelector("#copy-status");
  const copyButton = document.querySelector("#copy-url"), openButton = document.querySelector("#open-preview");
  const lifetime = new AbortController();
  let selectionStatus = "idle";
  let selectionVersion = 0, selection, fields = [], values = {}, instances = [], fieldErrors = new Map(), previewTimer, readyId, previewId;
  const drafts = new Map();
  const destroyInstances = () => { for (const instance of instances) { try { instance.destroy(); } catch (error) { console.error(error); } } instances = []; };
  const clearSelection = () => { selection?.abort(); clearTimeout(previewTimer); destroyInstances(); fieldErrors.clear(); readyId = null; previewId = null; preview.src = "about:blank"; };
  window.addEventListener("pagehide", () => { clearSelection(); lifetime.abort(); }, { once: true });
  form.addEventListener("submit", event => event.preventDefault(), { signal: lifetime.signal });
  Object.values(widgets).forEach(widget => {
    const button = document.createElement("button"); button.type = "button"; button.className = "widget-option"; button.dataset.widgetId = widget.id;
    button.innerHTML = '<span class="widget-icon"></span><span><strong>' + escapeHtml(widget.name) + '</strong><small>' + escapeHtml(widget.summary) + '</small></span>';
    button.querySelector(".widget-icon").replaceWith(createWidgetIcon(widget.icon));
    button.addEventListener("click", () => { if (selectedId !== widget.id || selectionStatus === "error") selectWidget(widget.id); }, { signal: lifetime.signal }); list.append(button);
  });
  copyButton.addEventListener("click", async () => {
    if (copyButton.disabled) return;
    try { await navigator.clipboard.writeText(resultUrl.value); copyStatus.textContent = "已复制，可粘贴到 Notion 的 /embed 中。"; }
    catch { resultUrl.select(); copyStatus.textContent = "请使用 Ctrl+C 复制。"; }
  }, { signal: lifetime.signal });
  openButton.addEventListener("click", () => { if (!openButton.disabled) window.open(resultUrl.value, "_blank", "noopener,noreferrer"); }, { signal: lifetime.signal });
  window.addEventListener("message", event => {
    if (event.origin !== window.location.origin || event.source !== preview.contentWindow || event.data?.type !== "widget-ready" || event.data.id !== selectedId || previewId !== selectedId) return;
    readyId = selectedId;
    if (!validateValues(fields, values).length) preview.contentWindow.postMessage({ type: "widget-config", id: selectedId, values }, window.location.origin);
  }, { signal: lifetime.signal });

  async function selectWidget(widgetId) {
    selectionStatus = "loading";
    const version = ++selectionVersion; clearSelection(); selectedId = widgetId; selection = new AbortController(); const signal = selection.signal;
    fields = []; values = {}; resultUrl.value = ""; copyButton.disabled = openButton.disabled = true;
    const widget = widgets[widgetId];
    document.querySelectorAll(".widget-option").forEach(option => option.classList.toggle("active", option.dataset.widgetId === widgetId));
    document.querySelector("#editor-title").textContent = widget.name; document.querySelector("#editor-description").textContent = widget.description;
    document.querySelector("#widget-path").textContent = "/widget/" + widget.id;
    form.innerHTML = '<p class="muted">正在加载组件配置…</p>'; history.replaceState(null, "", "/?widget=" + encodeURIComponent(widgetId)); copyStatus.textContent = "";
    try {
      const definition = await loadDefinition(widgetId, signal);
      if (signal.aborted || version !== selectionVersion) return;
      fields = resolveFields(definition, widgetId);
      values = drafts.get(widgetId) || Object.fromEntries(fields.map(field => [field.key, field.default])); drafts.set(widgetId, values);
      form.replaceChildren();
      const slots = fields.map(field => {
        const wrapper = document.createElement("div"); wrapper.className = "field";
        const title = document.createElement("label"); title.className = "field-label"; title.htmlFor = "field-" + field.key; title.textContent = field.label;
        const holder = document.createElement("div"); holder.className = "control-host";
        const warning = document.createElement("small"); warning.className = "control-warning";
        const error = document.createElement("small"); error.className = "field-error"; error.id = "error-" + field.key; error.setAttribute("role", "status");
        if (field.description) { const hint = document.createElement("small"); hint.className = "muted"; hint.textContent = field.description; wrapper.append(title, hint); } else wrapper.append(title);
        wrapper.append(holder, warning, error); form.append(wrapper); fieldErrors.set(field.key, error);
        return { field, holder, warning };
      });
      await Promise.all(slots.map(async ({ field, holder, warning }) => {
        const instance = await mountControl(holder, { field, value: values[field.key], props: field.control?.props || {}, signal,
          onChange(value) { if (signal.aborted || version !== selectionVersion) return; values[field.key] = String(value ?? ""); updateUrl(); },
        }, widget.config, loadStylesheet, error => { warning.textContent = "设置控件加载失败，已使用默认控件。"; console.error(error); });
        if (!instance) return;
        if (signal.aborted || version !== selectionVersion) { instance.destroy(); return; }
        instances.push(instance);
      }));
      if (signal.aborted || version !== selectionVersion) return;
      selectionStatus = "ready";
      updateUrl();
    } catch (error) { if (!signal.aborted && version === selectionVersion) { selectionStatus = "error"; destroyInstances(); form.innerHTML = '<p class="load-error">组件配置或控件加载失败，请刷新重试。</p>'; console.error(error); } }
  }
  function updateUrl() {
    clearTimeout(previewTimer);
    const errors = validateValues(fields, values);
    for (const field of fields) { const error = validateValue(field, values[field.key]); fieldErrors.get(field.key).textContent = error ? error.reason + "。" + error.suggestion : ""; }
    copyButton.disabled = openButton.disabled = errors.length > 0;
    if (errors.length) { resultUrl.value = ""; copyStatus.textContent = "请修正参数后再更新预览。"; return; }
    const params = new URLSearchParams();
    fields.forEach(field => { if (values[field.key] !== field.default || field.defaultValue) params.set(field.key, values[field.key]); });
    const query = params.toString(), id = selectedId;
    const url = window.location.origin + "/widget/" + id + (query ? "?" + query : ""); resultUrl.value = url; copyStatus.textContent = "";
    const snapshot = { ...values };
    previewTimer = setTimeout(() => {
      if (selection.signal.aborted || id !== selectedId) return;
      if (previewId === id && readyId === id) preview.contentWindow.postMessage({ type: "widget-config", id, values: snapshot }, window.location.origin);
      else if (previewId !== id) { previewId = id; preview.src = url; }
    }, 250);
  }
  if (selectedId) selectWidget(selectedId);
}

function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
function loadManifest() {
  if (!manifestPromise) manifestPromise = fetch("/widgets/manifest.json", { cache: "no-cache" }).then(response => { if (!response.ok) throw new Error("插件清单加载失败"); return response.json(); }).catch(error => { manifestPromise = null; throw error; });
  return manifestPromise;
}
function loadStylesheet(href) {
  return styles.get(href, () => new Promise((resolve, reject) => {
    const link = document.createElement("link"); link.rel = "stylesheet"; link.href = href;
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", () => { link.remove(); reject(new Error("样式加载失败：" + href)); }, { once: true }); document.head.append(link);
  }));
}
