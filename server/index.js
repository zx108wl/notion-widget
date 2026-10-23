import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "./db/schema.js";
import { readMasterKey } from "./crypto/secrets.js";
import { ensureAdminUser } from "./auth/users.js";
import { pruneSessions } from "./auth/session.js";
import { pruneUsage } from "./auth/usage.js";
import { purgeRevokedTokens } from "./auth/tokens.js";
import { createAuthRouter } from "./routes/auth.js";
import { createAdminRouter } from "./routes/admin.js";
import { createPluginAuthorizer, createPluginContextFactory } from "./plugin-auth.js";
import { createPluginDispatcher } from "./plugin-routes.js";
import { loadPluginServers, resolvePluginServerMode } from "./plugin-loader.js";

const app = express();
const port = Number(process.env.PORT || 3000);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// 主密钥只从 .env 读取：缺失/长度不对一律拒绝启动，绝不做"没有主密钥就明文存"的降级
let masterKey;
try {
  masterKey = readMasterKey(process.env);
} catch (error) {
  console.error(`[auth] ${error.message}`);
  process.exit(1);
}

const dbPath = process.env.WIDGET_DB_PATH || "/data/widget.db";
const db = openDatabase({ file: dbPath });
ensureAdminUser(db, process.env);
pruneSessions(db);
pruneUsage(db);
purgeRevokedTokens(db);

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

// 健康检查保持公开（容器探活与 status 组件都用它），但不回显插件清单与路由：
// 那属于部署拓扑信息，没必要对未登录访客可见。
// 每次探活都真的查一次库：库被锁死或文件损坏时必须返回 503，不能让探活一直"自己骗自己"
app.get("/api/health", (_request, response) => {
  response.set("Cache-Control", "no-store");
  try {
    db.prepare("SELECT 1 AS ok").get();
    return response.json({ ok: true, time: new Date().toISOString() });
  } catch (error) {
    console.error("[api] 健康检查失败:", error);
    return response.status(503).json({ ok: false, time: new Date().toISOString() });
  }
});

// 插件分发器注册在核心路由之后、404 之前：核心永远优先，插件无法遮蔽核心接口
const { table } = await loadPluginServers({ rootDir, mode: resolvePluginServerMode() });

// 被插件声明依赖的凭据：删除这类密钥时给出明确错误，而不是留到运行时才抛"未配置凭据"
const declaredCredentials = new Map();
// 各插件对凭据的可读需求（label/description）：工作台据此告诉用户该填什么
const widgetCredentialRequirements = new Map();
// 插件接口是否需要访问令牌：工作台据此提示"嵌入链接需去令牌页签发"
const widgetAuth = new Map();
for (const entry of table.values()) {
  for (const ref of entry.credentials ?? []) {
    if (!declaredCredentials.has(ref)) declaredCredentials.set(ref, new Set());
    declaredCredentials.get(ref).add(entry.widgetId);
  }
  const list = widgetCredentialRequirements.get(entry.widgetId) ?? [];
  for (const requirement of entry.credentialRequirements ?? []) {
    if (!list.some((item) => item.ref === requirement.ref)) list.push(requirement);
  }
  widgetCredentialRequirements.set(entry.widgetId, list);
  // 同一插件可能暴露多条路由：只要有一条要求令牌，整个插件的嵌入页就需要令牌
  if (entry.auth === "token") widgetAuth.set(entry.widgetId, "token");
  else if (!widgetAuth.has(entry.widgetId)) widgetAuth.set(entry.widgetId, "none");
}

// 用户系统与密钥托管挂在分发器之前：/api/auth/* 与 /api/admin/* 是核心保留前缀
app.use("/api/auth", createAuthRouter({ db }));
app.use(
  "/api/admin",
  createAdminRouter({ db, key: masterKey, declaredCredentials, widgetCredentialRequirements, widgetAuth }),
);

app.use(
  createPluginDispatcher({
    table,
    authorize: createPluginAuthorizer({ db }),
    createContext: createPluginContextFactory({ db, key: masterKey }),
  }),
);

app.use((_request, response) => {
  response.status(404).json({ error: "Not found" });
});

// JSON 错误处理器必须是最后一个中间件，且必须带 4 个参数（否则 express 不会当作错误处理器）
app.use((error, _request, response, _next) => {
  console.error("[api] 未处理的错误:", error);
  response.status(500).json({ error: "服务器内部错误" });
});

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`API listening on port ${port}`);
});

// 优雅退出：docker compose 重建容器时先发 SIGTERM，先停止接收新连接，
// 等在途请求收尾后再关库；超时强制退出，避免探活失败却卡住不走
function shutdown(signal) {
  console.log(`[api] 收到 ${signal}，正在关闭…`);
  server.close(() => {
    try {
      db.close();
    } catch (error) {
      console.error("[api] 关闭数据库失败:", error);
    }
    process.exit(0);
  });
  setTimeout(() => {
    console.error("[api] 关闭超时，强制退出");
    process.exit(1);
  }, 10_000).unref();
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
