import "./style.css";
import { widgets } from "./widgets-registry.js";

const app = document.querySelector("#app");
const widgetMatch = window.location.pathname.match(/^\/widget\/([^/]+)\/?$/);
const moduleCache = new Map();
let manifestPromise;

if (widgetMatch) renderWidget(decodeURIComponent(widgetMatch[1]));
else renderConfigurator();

async function renderWidget(widgetId) {
  const widget = widgets[widgetId];
  document.body.className = "widget-page";

  if (!widget) {
    document.title = "组件不存在";
    app.innerHTML = `<section class="embed-card error-card"><p class="eyebrow">404</p><h1>没有找到这个组件</h1><a href="/">返回组件中心</a></section>`;
    return;
  }

  try {
    const component = await loadWidget(widget);
    const params = new URLSearchParams(window.location.search);
    const config = Object.fromEntries(component.fields.map((field) => [field.key, readParam(params, field)]));
    document.title = `${widget.name} · Notion Widget`;
    document.documentElement.dataset.theme = config.theme || "auto";
    component.render(app, config);
  } catch (error) {
    console.error(error);
    app.innerHTML = `<section class="embed-card error-card"><p class="eyebrow">LOAD ERROR</p><h1>组件加载失败</h1><p>请稍后刷新重试。</p></section>`;
  }
}

function renderConfigurator() {
  document.body.className = "config-page";
  document.title = "Notion 小组件中心";
  const pageParams = new URLSearchParams(window.location.search);
  let selectedId = pageParams.get("widget");
  if (!widgets[selectedId]) selectedId = Object.keys(widgets)[0];

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
          <div class="preview-frame-wrap"><iframe id="preview" title="组件实时预览"></iframe></div>
          <label class="url-field"><span>嵌入 URL</span><div class="url-row"><input id="result-url" readonly /><button id="copy-url" class="button primary" type="button">复制 URL</button></div></label>
          <p id="copy-status" class="copy-status" role="status"></p>
        </section>
      </main>
    </div>`;

  const list = document.querySelector("#widget-list");
  const form = document.querySelector("#config-form");
  const preview = document.querySelector("#preview");
  const resultUrl = document.querySelector("#result-url");
  const copyStatus = document.querySelector("#copy-status");

  Object.values(widgets).forEach((widget) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "widget-option";
    button.dataset.widgetId = widget.id;
    button.innerHTML = `<span class="widget-icon">${widget.icon}</span><span><strong>${escapeHtml(widget.name)}</strong><small>${escapeHtml(widget.summary)}</small></span>`;
    button.addEventListener("click", () => selectWidget(widget.id));
    list.append(button);
  });

  form.addEventListener("input", updateUrl);
  form.addEventListener("change", updateUrl);
  document.querySelector("#copy-url").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(resultUrl.value);
      copyStatus.textContent = "已复制，可直接粘贴到 Notion 的 /embed 中。";
    } catch {
      resultUrl.select();
      copyStatus.textContent = "浏览器未授权剪贴板，请使用 Ctrl+C 复制。";
    }
  });
  document.querySelector("#open-preview").addEventListener("click", () => window.open(resultUrl.value, "_blank", "noopener,noreferrer"));

  let selectionVersion = 0;

  async function selectWidget(widgetId) {
    const version = ++selectionVersion;
    selectedId = widgetId;
    const widget = widgets[widgetId];
    document.querySelectorAll(".widget-option").forEach((option) => option.classList.toggle("active", option.dataset.widgetId === widgetId));
    document.querySelector("#editor-title").textContent = widget.name;
    document.querySelector("#editor-description").textContent = widget.description;
    document.querySelector("#widget-path").textContent = `/widget/${widget.id}`;
    form.innerHTML = `<p class="muted">正在加载组件配置…</p>`;
    history.replaceState(null, "", `/?widget=${encodeURIComponent(widgetId)}`);
    copyStatus.textContent = "";
    try {
      const component = await loadWidget(widget);
      if (version !== selectionVersion) return;
      widget.component = component;
      form.replaceChildren(...component.fields.map(createField));
      updateUrl();
    } catch (error) {
      console.error(error);
      if (version === selectionVersion) form.innerHTML = `<p class="load-error">组件配置加载失败，请刷新重试。</p>`;
    }
  }

  function updateUrl() {
    const widget = widgets[selectedId];
    if (!widget.component) return;
    const data = new FormData(form);
    const params = new URLSearchParams();
    widget.component.fields.forEach((field) => {
      const control = form.elements.namedItem(field.key);
      const value = field.type === "checkbox" ? (control.checked ? "1" : "0") : String(data.get(field.key) ?? "").trim();
      if (value !== String(field.default)) params.set(field.key, value);
    });
    const query = params.toString();
    const url = `${window.location.origin}/widget/${widget.id}${query ? `?${query}` : ""}`;
    resultUrl.value = url;
    preview.src = url;
    copyStatus.textContent = "";
  }

  selectWidget(selectedId);
}

function createField(field) {
  const label = document.createElement("label");
  label.className = field.type === "checkbox" ? "field checkbox-field" : "field";
  const title = document.createElement("span");
  title.className = "field-label";
  title.textContent = field.label;
  let control;

  if (field.type === "select") {
    control = document.createElement("select");
    field.options.forEach(({ value, label: optionLabel }) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = optionLabel;
      option.selected = value === field.default;
      control.append(option);
    });
  } else {
    control = document.createElement("input");
    control.type = field.type;
    if (field.type === "checkbox") control.checked = field.default === "1";
    else control.value = field.default;
    if (field.min !== undefined) control.min = field.min;
    if (field.max !== undefined) control.max = field.max;
    if (field.step !== undefined) control.step = field.step;
  }

  control.name = field.key;
  control.id = `field-${field.key}`;
  if (field.type === "checkbox") {
    const switchLabel = document.createElement("span");
    switchLabel.className = "switch";
    switchLabel.append(control, document.createElement("span"));
    label.append(switchLabel, title);
  } else label.append(title, control);
  return label;
}

function readParam(params, field) {
  const value = params.get(field.key);
  if (value === null) return field.default;
  if (field.type === "number") {
    const number = Number(value);
    if (!Number.isFinite(number)) return field.default;
    return String(Math.min(field.max ?? number, Math.max(field.min ?? number, number)));
  }
  if (field.type === "select" && !field.options.some((option) => option.value === value)) return field.default;
  if (field.type === "checkbox") return value === "1" ? "1" : "0";
  if (field.type === "color" && !/^#[0-9a-f]{6}$/i.test(value)) return field.default;
  return value.slice(0, 120);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

async function loadWidget(widget) {
  if (!moduleCache.has(widget.id)) {
    moduleCache.set(widget.id, loadWidgetModule(widget.id));
  }
  return moduleCache.get(widget.id);
}

async function loadWidgetModule(widgetId) {
  const manifest = await loadManifest();
  const entry = manifest[widgetId];
  if (!entry?.js) throw new Error(`组件 ${widgetId} 没有构建入口`);
  await Promise.all((entry.css || []).map(loadStylesheet));
  return import(/* @vite-ignore */ entry.js);
}

function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch("/widgets/manifest.json", { cache: "no-cache" }).then((response) => {
      if (!response.ok) throw new Error(`组件清单加载失败：HTTP ${response.status}`);
      return response.json();
    });
  }
  return manifestPromise;
}

function loadStylesheet(href) {
  if (document.querySelector(`link[data-widget-style="${CSS.escape(href)}"]`)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.widgetStyle = href;
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", () => reject(new Error(`组件样式加载失败：${href}`)), { once: true });
    document.head.append(link);
  });
}
