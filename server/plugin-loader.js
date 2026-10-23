import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CORE_RESERVED_ROUTES, isReservedRouteKey, isValidRouteKey } from "./plugin-routes.js";

// 插件服务端模块的加载器：扫描 widgets/*/config.json 读取 server 声明并登记接口。
// 目录扫描约定与 src/core/registry.ts 一致（含 config.json 的目录即一个插件）；JS 侧自持一份，
// 因为 registry.ts 只面向 Node 构建侧且不参与运行时。仅供 Node 侧使用。

const SOURCE = "source";
const DIST = "dist";

// dev/prod 必须显式判定，绝不用"dist 是否存在"推断：
// dev 下 dist 往往也在，用存在性推断会静默加载过期产物
export function resolvePluginServerMode(argv = process.argv.slice(2), env = process.env) {
  const flagIndex = argv.indexOf("--plugin-server");
  const flag =
    argv.find((value) => value.startsWith("--plugin-server="))?.slice("--plugin-server=".length) ??
    (flagIndex >= 0 ? argv[flagIndex + 1] : undefined);
  if (flag === SOURCE || flag === DIST) return flag;
  const fromEnv = env.WIDGET_PLUGIN_SERVER;
  if (fromEnv === SOURCE || fromEnv === DIST) return fromEnv;
  return env.NODE_ENV === "production" ? DIST : SOURCE;
}

function listWidgetIds(rootDir) {
  const widgetsDir = path.join(rootDir, "widgets");
  return readdirSync(widgetsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(widgetsDir, entry.name, "config.json")))
    .map((entry) => entry.name);
}

// 凭据声明支持两种写法：字符串（最简）与对象（带可读名称，供工作台展示）。
// required 未声明时按必选处理（与 src/core/schema/widget-server.schema.ts 保持一致）。
function credentialRequirementsOf(server) {
  const raw = Array.isArray(server.credentials) ? server.credentials : [];
  return raw
    .map((item) => {
      if (typeof item === "string") return { ref: item, required: true };
      if (!item || typeof item.ref !== "string") return null;
      return { ...item, required: item.required !== false };
    })
    .filter(Boolean);
}

export async function loadPluginServers({ rootDir, mode }) {
  const table = new Map();
  const plugins = [];
  // 已占用的路由 key：先放核心保留路由，插件声明的 key 全局必须唯一
  const taken = new Set(CORE_RESERVED_ROUTES);

  for (const widgetId of listWidgetIds(rootDir)) {
    let config;
    try {
      config = JSON.parse(await readFile(path.join(rootDir, "widgets", widgetId, "config.json"), "utf8"));
    } catch (error) {
      plugins.push({ id: widgetId, routes: [], status: "error", error: `配置读取失败: ${error.message}` });
      continue;
    }

    const server = config.server;
    if (!server || typeof server !== "object") continue; // 未声明服务端模块 → 与今天完全一致

    const declared = Array.isArray(server.expose) ? server.expose : [];
    const requirements = credentialRequirementsOf(server);
    const record = { id: widgetId, routes: [], status: "ok" };
    const warnings = [];

    const filePath =
      mode === DIST
        ? path.join(rootDir, "dist", "widgets", widgetId, "server.js")
        : path.join(rootDir, "widgets", widgetId, String(server.entry ?? "").replace(/^\.\//, ""));

    if (!existsSync(filePath)) {
      const hint =
        mode === DIST
          ? `缺少服务端产物 ${path.relative(rootDir, filePath)}，请先运行 npm run build`
          : `找不到服务端入口 ${path.relative(rootDir, filePath)}，请检查 config.json 的 server.entry`;
      if (mode === DIST) {
        // 生产环境静默 0 插件上线是不可接受的：显式报错退出
        console.error(`[plugin] ${widgetId}: ${hint}`);
        process.exit(1);
      }
      record.status = "error";
      record.error = hint;
      plugins.push(record);
      continue;
    }

    try {
      const module = await import(pathToFileURL(filePath).href);
      const routes = module.routes;
      if (!routes || typeof routes !== "object") {
        throw new Error("服务端模块必须导出 routes 对象");
      }

      const pending = [];
      for (const key of declared) {
        if (!isValidRouteKey(key)) {
          record.status = "error";
          record.error = `接口声明不合法: ${key}`;
          break;
        }
        if (taken.has(key) || isReservedRouteKey(key)) {
          record.status = "error";
          record.error = `接口声明与已占用路由或核心保留路由冲突: ${key}`;
          break;
        }
        if (typeof routes[key] !== "function") {
          record.status = "error";
          record.error = `服务端模块缺少已声明的接口: ${key}`;
          break;
        }
        pending.push(key);
      }

      // 校验全部通过才提交路由：声明有问题的插件不允许部分上线
      if (record.status === "ok") {
        for (const key of pending) {
          taken.add(key);
          record.routes.push(key);
          table.set(key, {
            widgetId,
            handler: routes[key],
            auth: server.auth === "token" ? "token" : "none",
            credentials: requirements.map((item) => item.ref),
            credentialRequirements: requirements,
          });
        }
      }

      // 模块内多出的 handler 会被忽略：未登记即不可访问，只给出提示
      for (const key of Object.keys(routes)) {
        if (!declared.includes(key)) warnings.push(`未在 config.json 中声明、已忽略的接口: ${key}`);
      }
    } catch (error) {
      record.status = "error";
      record.error =
        error?.code === "ERR_UNKNOWN_FILE_EXTENSION"
          ? `无法加载 ${path.relative(rootDir, filePath)}（.ts 需要 tsx）：请用 npm run dev:api 启动开发环境`
          : error?.message || String(error);
    }

    if (warnings.length) record.warnings = warnings;
    plugins.push(record);
  }

  for (const plugin of plugins) {
    if (plugin.status === "ok") {
      console.log(`[plugin] ${plugin.id}: 已加载 ${plugin.routes.length} 个接口`);
    } else {
      console.error(`[plugin] ${plugin.id}: 加载失败 — ${plugin.error}`);
    }
    for (const warning of plugin.warnings ?? []) console.warn(`[plugin] ${plugin.id}: ${warning}`);
  }

  return { table, plugins };
}
