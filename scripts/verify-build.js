import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveFields, widgetMetadata } from "../src/widget-config.js";
import { widgets } from "../src/widgets-registry.js";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const manifest = JSON.parse(await readFile(path.join(dist, "widgets", "manifest.json"), "utf8"));
const registeredIds = Object.keys(widgets).sort();
const builtIds = Object.keys(manifest).sort();

if (JSON.stringify(registeredIds) !== JSON.stringify(builtIds)) {
  throw new Error(`组件清单与注册表不一致：注册 ${registeredIds.join(", ")}，构建 ${builtIds.join(", ")}`);
}

for (const widgetId of registeredIds) {
  const entry = manifest[widgetId];
  const jsPath = path.join(dist, entry.js.replace(/^\//, ""));
  const jsStat = await stat(jsPath);
  if (jsStat.size < 100) throw new Error(`组件 ${widgetId} 的 JS 产物异常：${jsStat.size} bytes`);

  const module = await import(`${pathToFileURL(jsPath).href}?verify=${Date.now()}`);
  const config = JSON.parse(await readFile(path.join(dist, entry.config.replace(/^\//, "")), "utf8"));
  const fields = resolveFields(config, widgetId);
  const prefix = `/widgets/${widgetId}/`;
  for (const url of [entry.config, entry.js, ...entry.css]) {
    if (!url.startsWith(prefix) || url.includes("..")) throw new Error("插件资源不在独立目录内: " + url);
  }
  const resolveEntry = value => prefix + value.slice(2);
  if (resolveEntry(config.entry.js) !== entry.js || JSON.stringify(config.entry.css.map(resolveEntry)) !== JSON.stringify(entry.css)) throw new Error("配置入口与清单不一致: " + widgetId);
  for (const [key, value] of Object.entries(widgetMetadata(config))) {
    if (entry[key] !== value) throw new Error("配置元信息与清单不一致: " + widgetId + "/" + key);
  }
  if (typeof module.render !== "function") throw new Error(`组件 ${widgetId} 未导出 render`);
  for (const dimension of ["width", "height"]) {
    const field = fields.find(({ key }) => key === dimension);
    if (!field || field.type !== "number" || field.min === undefined || field.max === undefined) {
      throw new Error(`组件 ${widgetId} 缺少有效的 ${dimension} 尺寸配置`);
    }
  }
  for (const dimension of ["width", "height"]) {
    if (fields.find(({ key }) => key === dimension).default !== "") {
      throw new Error(`组件 ${widgetId} 的 ${dimension} 默认值必须为空以保持自适应`);
    }
  }

  if (!Array.isArray(entry.css) || entry.css.length === 0) {
    throw new Error(`组件 ${widgetId} 没有独立 CSS 产物`);
  }
  await Promise.all(entry.css.map((url) => access(path.join(dist, url.replace(/^\//, "")))));
}

console.log(`已验证 ${registeredIds.length} 个独立组件产物`);
