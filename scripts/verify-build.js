import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
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
  if (!Array.isArray(module.fields)) throw new Error(`组件 ${widgetId} 未导出 fields`);
  if (typeof module.render !== "function") throw new Error(`组件 ${widgetId} 未导出 render`);

  if (!Array.isArray(entry.css) || entry.css.length === 0) {
    throw new Error(`组件 ${widgetId} 没有独立 CSS 产物`);
  }
  await Promise.all(entry.css.map((url) => access(path.join(dist, url.replace(/^\//, "")))));
}

console.log(`已验证 ${registeredIds.length} 个独立组件产物`);
