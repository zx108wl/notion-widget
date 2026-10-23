import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createRequire } from "node:module";
import { openDatabase } from "../server/db/schema.js";
import { createPluginAuthorizer, createPluginContextFactory } from "../server/plugin-auth.js";
import { createPluginDispatcher } from "../server/plugin-routes.js";
import { SESSION_COOKIE, createSession } from "../server/auth/session.js";
import {
  blockTokenIp,
  deleteToken,
  issueToken,
  listTokens,
  purgeRevokedTokens,
  revokeToken,
  tokenCredentials,
  unblockTokenIp,
  verifyToken,
} from "../server/auth/tokens.js";
import {
  callLogRetentionDays,
  callLogStats,
  clearCallLogs,
  pruneUsage,
  recordCall,
  saveCallLogRetentionDays,
  tokenRequestStats,
} from "../server/auth/usage.js";
import { createUser } from "../server/auth/users.js";
import { upsertCredential } from "../server/auth/credentials.js";

const silent = { log() {}, warn() {} } as unknown as Console;

// express 5 不自带 d.ts，本项目也未引入 @types/express（服务端是纯 JS 不被类型检查）；
// 测试里把它当不透明宿主使用，只声明真正用到的形状
type JsonResponse = { status(code: number): JsonResponse; json(body: unknown): unknown };
const express = createRequire(import.meta.url)("express") as {
  (): { use(handler: unknown): void; listen(port: number, host: string, callback: () => void): Server };
  json(): unknown;
};

type Db = ReturnType<typeof openDatabase>;

// 服务端模块是纯 JS：db.prepare().get() 在 TS 侧返回 SQLOutputValue 联合类型，
// 测试里统一用它取单行并按列断言
function one(db: Db, sql: string, ...params: string[]): Record<string, any> {
  return db.prepare(sql).get(...params) as unknown as Record<string, any>;
}

function memoryDb(): Db {
  // 传变量而非字面量：JS 侧推断的选项类型保真度有限，避免多余属性检查
  const options = { file: ":memory:", logger: silent };
  return openDatabase(options);
}

type RouteEntry = {
  widgetId: string;
  handler: (request: unknown, response: { json(body: unknown): unknown }) => unknown;
  auth: "none" | "token";
  credentials: string[];
};

// 用真实 express + 真实分发器起一个临时服务，验证整条链路而不是单个函数
async function withApp(db: Db, key: Buffer, entries: Record<string, RouteEntry>, run: (base: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use(
    createPluginDispatcher({
      table: new Map(Object.entries(entries)) as never,
      authorize: createPluginAuthorizer({ db }) as never,
      createContext: createPluginContextFactory({ db, key }) as never,
    }),
  );
  app.use((_request: unknown, response: JsonResponse) => {
    response.status(404).json({ error: "Not found" });
  });

  const server = await new Promise<Server>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const weatherEntry: RouteEntry = {
  widgetId: "clock",
  handler: (_request, response) => response.json({ ok: true }),
  auth: "token",
  credentials: [],
};

describe("嵌入令牌：签发 → 校验 → 注销 → 401", () => {
  it("令牌格式、校验、注销即时生效，未声明路由一律 404", async () => {
    const db = memoryDb();
    const key = randomBytes(32);
    const issued = issueToken(db, { widgetId: "clock", label: "我的日历页" });

    assert.match(issued.token, /^w_[0-9A-Za-z]{22}\.[A-Za-z0-9_-]{20,}$/);
    assert.ok(verifyToken(db, issued.token));
    // 只存哈希：库里不存在可回显的令牌明文（令牌明文只在签发响应里返回一次）
    const stored = one(db, "SELECT secret_hash FROM embed_tokens WHERE id = ?", issued.id);
    assert.ok(!issued.token.includes(stored.secret_hash) && !stored.secret_hash.includes(issued.token));
    const listed = listTokens(db).find((row: { id: string }) => row.id === issued.id);
    assert.ok(listed && !("token" in listed));
    assert.equal(verifyToken(db, `${issued.id}.wrongsecretwrongsecretwrongsecret`), null);
    assert.equal(verifyToken(db, "not-a-token"), null);

    await withApp(db, key, { "GET /api/weather": weatherEntry }, async (base) => {
      const call = (headers: Record<string, string> = {}) => fetch(`${base}/api/weather`, { headers });

      assert.equal((await call({ authorization: `Bearer ${issued.token}` })).status, 200);
      assert.equal((await call()).status, 401);
      assert.equal((await call({ authorization: "Bearer nope" })).status, 401);

      // 注销后不重启服务，立刻 401
      assert.equal(revokeToken(db, issued.id, "manual"), true);
      assert.equal(revokeToken(db, issued.id, "manual"), false);
      assert.equal(verifyToken(db, issued.token), null);
      assert.equal((await call({ authorization: `Bearer ${issued.token}` })).status, 401);

      // 已声明路由之外：未声明即不存在，404 而不是 401
      assert.equal((await fetch(`${base}/api/other`)).status, 404);
    });

    // 令牌校验通过后写一条调用监控
    assert.equal(one(db, "SELECT COUNT(*) AS total FROM call_logs").total, 1);
    const touched = one(db, "SELECT use_count, last_used_at FROM embed_tokens WHERE id = ?", issued.id);
    assert.equal(touched.use_count, 1);
    assert.ok(touched.last_used_at);
  });

  it("已注销令牌保留 7 天后从库中清除", () => {
    const db = memoryDb();
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const old = issueToken(db, { widgetId: "clock", label: "old" }, new Date(now - 10 * day));
    const recent = issueToken(db, { widgetId: "clock", label: "recent" }, new Date(now - day));
    revokeToken(db, old.id, "manual", new Date(now - 8 * day));
    revokeToken(db, recent.id, "manual", new Date(now - 2 * day));

    purgeRevokedTokens(db, now);

    const ids = listTokens(db, now).map((row: { id: string }) => row.id);
    assert.ok(!ids.includes(old.id));
    assert.ok(ids.includes(recent.id));
  });

  it("删除令牌立即失效，默认保留调用记录作为审计线索", () => {
    const db = memoryDb();
    const issued = issueToken(db, {
      widgetId: "clock",
      label: "delete-me",
      credentials: ["weatherApi.default"],
    });
    const now = Date.now();
    const call = { tokenId: issued.id, method: "GET", path: "/api/weather", status: 200, durationMs: 12 };
    recordCall(db, { ...call, ip: "1.2.3.4" }, now);
    recordCall(db, { ...call, ip: "1.2.3.4" }, now);
    recordCall(db, { ...call, ip: "5.6.7.8" }, now);

    // 按「请求 + 来源 IP」聚合：同一 IP 两次、另一 IP 一次
    const stats = tokenRequestStats(db, issued.id, {}, now);
    assert.equal(stats.length, 2);
    assert.equal(stats[0].ip, "1.2.3.4");
    assert.equal(stats[0].calls, 2);

    assert.equal(deleteToken(db, issued.id), true);
    assert.equal(deleteToken(db, issued.id), false);
    assert.equal(verifyToken(db, issued.token), null);
    // 默认保留：调用明细与按小时汇总都还在，令牌行与绑定关系已清除
    assert.equal(one(db, "SELECT COUNT(*) AS total FROM call_logs").total, 3);
    assert.equal(one(db, "SELECT COUNT(*) AS total FROM usage_hourly").total, 1);
    assert.equal(one(db, "SELECT COUNT(*) AS total FROM token_credentials").total, 0);
    assert.equal(listTokens(db, now).length, 0);
  });

  it("删除令牌时显式勾选才清除调用记录", () => {
    const db = memoryDb();
    const issued = issueToken(db, { widgetId: "clock", credentials: ["weatherApi.default"] });
    const now = Date.now();
    const call = { tokenId: issued.id, method: "GET", path: "/api/weather", status: 200, durationMs: 8 };
    recordCall(db, { ...call, ip: "1.2.3.4" }, now);
    recordCall(db, { ...call, ip: "1.2.3.4" }, now);

    assert.equal(deleteToken(db, issued.id, { clearLogs: true }), true);
    assert.equal(one(db, "SELECT COUNT(*) AS total FROM call_logs").total, 0);
    assert.equal(one(db, "SELECT COUNT(*) AS total FROM usage_hourly").total, 0);
  });

  it("调用记录保留期可配置，手动清理按天数删除", () => {
    const db = memoryDb();
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const issued = issueToken(db, { widgetId: "clock" });
    const call = { tokenId: issued.id, method: "GET", path: "/api/weather", status: 200, durationMs: 5, ip: "1.2.3.4" };
    recordCall(db, call, now - 10 * day);
    recordCall(db, call, now - 2 * day);

    // 默认 7 天：10 天前的记录被裁掉
    assert.equal(callLogRetentionDays(db), 7);
    pruneUsage(db, now);
    assert.equal(callLogStats(db).total, 1);

    // 放宽到 30 天后，10 天前的记录可以保留
    assert.equal(saveCallLogRetentionDays(db, 30), 30);
    assert.equal(callLogRetentionDays(db), 30);
    recordCall(db, call, now - 10 * day);
    pruneUsage(db, now);
    assert.equal(callLogStats(db).total, 2);

    // 手动清理 7 天前：只删那条 10 天前的
    assert.equal(clearCallLogs(db, { olderThanDays: 7 }, now), 1);
    assert.equal(callLogStats(db).total, 1);

    // 清空全部
    assert.equal(clearCallLogs(db, {}), 1);
    assert.equal(callLogStats(db).total, 0);
    // 保留期设置本身不受清理影响
    assert.equal(callLogStats(db).retentionDays, 30);
  });

  it("令牌级 IP 黑名单：被禁 IP 的调用返回 403，解除后恢复", async () => {
    const db = memoryDb();
    const key = randomBytes(32);
    const issued = issueToken(db, { widgetId: "clock" });

    await withApp(db, key, { "GET /api/weather": weatherEntry }, async (base) => {
      const call = () => fetch(`${base}/api/weather`, { headers: { authorization: `Bearer ${issued.token}` } });
      assert.equal((await call()).status, 200);

      blockTokenIp(db, issued.id, "127.0.0.1");
      assert.equal((await call()).status, 403);
      // 被禁 IP 仍留在统计里（便于解除），但被拒的请求不计数
      const stats = tokenRequestStats(db, issued.id);
      assert.equal(stats[0].blocked, true);
      assert.equal(stats[0].calls, 1);

      assert.equal(unblockTokenIp(db, issued.id, "127.0.0.1"), true);
      assert.equal((await call()).status, 200);
    });
  });

  it("工作台同源会话是捷径：无令牌的预览请求靠 Cookie 放行", async () => {
    const db = memoryDb();
    const key = randomBytes(32);
    const userId = createUser(db, "admin", "password123");
    const session = createSession(db, userId);

    await withApp(db, key, { "GET /api/weather": weatherEntry }, async (base) => {
      const cookie = `${SESSION_COOKIE}=${session.token}`;
      assert.equal((await fetch(`${base}/api/weather`, { headers: { cookie } })).status, 200);
      assert.equal((await fetch(`${base}/api/weather`, { headers: { cookie: `${SESSION_COOKIE}=bogus` } })).status, 401);
      assert.equal((await fetch(`${base}/api/weather`)).status, 401);
    });

    // 会话预览不写监控（只有令牌调用才计数）
    assert.equal(one(db, "SELECT COUNT(*) AS total FROM call_logs").total, 0);
  });

  it("无 auth 声明的接口行为与今天完全一致", async () => {
    const db = memoryDb();
    const key = randomBytes(32);
    const entries: Record<string, RouteEntry> = {
      "GET /api/weather": { ...weatherEntry, auth: "none" },
    };
    await withApp(db, key, entries, async (base) => {
      assert.equal((await fetch(`${base}/api/weather`)).status, 200);
      assert.equal((await fetch(`${base}/api/weather`, { headers: { authorization: "Bearer bogus" } })).status, 200);
    });
  });

  it("令牌按授权密钥最小权限放行：未绑定的 ref 运行时拒绝", () => {
    const db = memoryDb();
    const key = randomBytes(32);
    upsertCredential(db, { provider: "weatherApi", slot: "default", value: "sk-weather", key });
    upsertCredential(db, { provider: "openai", slot: "default", value: "sk-openai", key });

    // 令牌只绑定 weatherApi.default，不绑定 openai.default
    const issued = issueToken(db, {
      widgetId: "clock",
      label: "weather only",
      credentials: ["weatherApi.default"],
    });
    assert.deepEqual(tokenCredentials(db, issued.id), ["weatherApi.default"]);

    const createContext = createPluginContextFactory({ db, key, logCall: () => {} });
    const entry = { credentials: ["weatherApi.default", "openai.default"] };
    const decision = { ok: true as const, token: issued, tokenCredentials: new Set(["weatherApi.default"]) };
    const context = createContext(entry, {}, {}, decision);

    // 已绑定：可读
    assert.equal(context.credential("weatherApi.default"), "sk-weather");
    // 未绑定：运行时拒绝（即使插件声明了、库里也有）
    assert.throws(() => context.credential("openai.default"), /令牌未授权该凭据/);
    // 工作台会话预览（无 token）：所有声明凭据可读
    const preview = createContext(entry, {}, {}, { ok: true as const });
    assert.equal(preview.credential("openai.default"), "sk-openai");
  });
});
