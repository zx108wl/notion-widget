import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 插件注册表：动态扫描 widgets/ 目录，凡含 config.json 的目录即一个插件。
// 每次调用都重新扫描——dev 中间件按请求调用，实现"新增目录即上线"的热插拔；
// 构建与校验脚本启动时各调用一次。
// 仅供 Node 侧使用（vite.config / build / verify），浏览器代码不得引入。
const widgetsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "widgets");

export function getWidgets(): Record<string, { id: string }> {
  const ids = readdirSync(widgetsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(widgetsDir, entry.name, "config.json")))
    .map((entry) => entry.name);
  return Object.fromEntries(ids.map((id) => [id, { id }]));
}

export type WidgetRegistry = Record<string, { id: string }>;
