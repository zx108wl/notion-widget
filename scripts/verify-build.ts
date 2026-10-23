import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveFields, widgetMetadata } from "../src/core/schema/widget-config.runtime.js";
import { isReservedRoute, parseRouteKey } from "../src/core/schema/widget-server.schema.js";
import { getWidgets } from "../src/core/registry.js";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const manifest = JSON.parse(await readFile(path.join(dist, "widgets", "manifest.json"), "utf8"));
const registeredIds = Object.keys(getWidgets()).sort();
const builtIds = Object.keys(manifest).sort();

if (JSON.stringify(registeredIds) !== JSON.stringify(builtIds)) {
  throw new Error(`组件清单与注册表不一致：注册 ${registeredIds.join(", ")}，构建 ${builtIds.join(", ")}`);
}

// 服务端模块的构建产物与路由声明：不 import 产物（构建期已用子进程校验过，
// 这里再 import 会让 verify 被插件的顶层副作用挂住）
const routeOwners = new Map<string, string>();
for (const widgetId of registeredIds) {
  const sourceConfig = JSON.parse(await readFile(path.join(root, "widgets", widgetId, "config.json"), "utf8"));
  const publishedConfig = JSON.parse(await readFile(path.join(dist, "widgets", widgetId, "config.json"), "utf8"));

  // 发布产物必须与"未声明服务端模块"时完全一致
  if (Object.hasOwn(publishedConfig, "server")) {
    throw new Error(`组件 ${widgetId} 的发布配置不得包含 server 声明`);
  }
  if (!sourceConfig.server) continue;

  await access(path.join(dist, "widgets", widgetId, "server.js"));

  for (const key of sourceConfig.server.expose) {
    if (!parseRouteKey(key) || isReservedRoute(key)) {
      throw new Error(`组件 ${widgetId} 的接口声明非法或与核心保留路由冲突：${key}`);
    }
    const owner = routeOwners.get(key);
    if (owner) throw new Error(`接口声明跨插件冲突：${key}（${owner} 与 ${widgetId}）`);
    routeOwners.set(key, widgetId);
  }
}

for (const widgetId of registeredIds) {
  const entry = manifest[widgetId];
  const jsPath = path.join(dist, entry.js.replace(/^\//, ""));
  const jsStat = await stat(jsPath);
  if (jsStat.size < 100) throw new Error(`组件 ${widgetId} 的 JS 产物异常：${jsStat.size} bytes`);

  const module = await import(`${pathToFileURL(jsPath).href}?verify=${Date.now()}`);
  const config = JSON.parse(await readFile(path.join(dist, entry.config.replace(/^\//, "")), "utf8"));
  const fields = resolveFields(config);
  const prefix = `/widgets/${widgetId}/`;

  for (const url of [entry.config, entry.js, ...entry.css]) {
    if (!url.startsWith(prefix) || url.includes("..")) throw new Error("插件资源不在独立目录内: " + url);
  }

  const resolveEntry = (value: string) => prefix + value.slice(2);
  if (
    resolveEntry(config.entry.js) !== entry.js ||
    JSON.stringify(config.entry.css.map(resolveEntry)) !== JSON.stringify(entry.css)
  ) {
    throw new Error("配置入口与清单不一致: " + widgetId);
  }

  for (const [key, value] of Object.entries(widgetMetadata(config, entry.config))) {
    if (JSON.stringify(entry[key]) !== JSON.stringify(value)) {
      throw new Error("配置元信息与清单不一致: " + widgetId + "/" + key);
    }
  }

  // 清单字段集合必须与预期一致：插件服务端化的改动不得改变前端清单结构
  const expectedKeys = [
    ...Object.keys(widgetMetadata(config, entry.config)),
    "config",
    "js",
    "css",
  ].sort();
  if (JSON.stringify(expectedKeys) !== JSON.stringify(Object.keys(entry).sort())) {
    throw new Error("清单字段集合与预期不一致: " + widgetId);
  }

  if (config.icon?.type === "image" && config.icon.src.startsWith("./")) {
    const iconUrl = new URL(config.icon.src, `https://widget.invalid${entry.config}`).pathname;
    if (!iconUrl.startsWith(prefix + "assets/")) throw new Error("图标不在插件资源目录内: " + widgetId);
    await access(path.join(dist, iconUrl.slice(1)));
  }

  // 自定义控件检查（React 组件，默认导出）
  const controlEntries = new Map<string, unknown>();
  for (const field of fields.filter((f): f is typeof f & { control: { type: "custom"; entry: string; css?: string[] } } => f.control?.type === "custom")) {
    const href = new URL(field.control.entry, `https://widget.invalid${entry.config}`).pathname;
    if (!href.startsWith(prefix) || href.includes("..")) {
      throw new Error("Custom control path is outside widget directory");
    }
    if (!controlEntries.has(href)) {
      controlEntries.set(href, await import(pathToFileURL(path.join(dist, href.slice(1))).href));
    }
    for (const url of field.control.css || []) {
      const cssHref = new URL(url, `https://widget.invalid${entry.config}`).pathname;
      if (!cssHref.startsWith(prefix)) throw new Error("Custom control CSS path is outside widget directory");
      await access(path.join(dist, cssHref.slice(1)));
    }
  }

  if (typeof module.render !== "function") throw new Error(`组件 ${widgetId} 未导出 render`);

  for (const dimension of ["width", "height"]) {
    const field = fields.find(({ key }) => key === dimension);
    if (!field || field.type !== "number" || field.min === undefined || field.max === undefined) {
      throw new Error(`组件 ${widgetId} 缺少有效的 ${dimension} 尺寸配置`);
    }
  }
  for (const dimension of ["width", "height"]) {
    if (fields.find(({ key }) => key === dimension)!.default !== "") {
      throw new Error(`组件 ${widgetId} 的 ${dimension} 默认值必须为空以保持自适应`);
    }
  }

  if (!Array.isArray(entry.css) || entry.css.length === 0) {
    throw new Error(`组件 ${widgetId} 没有独立 CSS 产物`);
  }
  await Promise.all(entry.css.map((url: string) => access(path.join(dist, url.replace(/^\//, "")))));
}

console.log(`已验证 ${registeredIds.length} 个独立组件产物`);
