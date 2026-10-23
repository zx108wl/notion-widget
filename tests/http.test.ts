import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createRequire } from "node:module";
import { openDatabase } from "../server/db/schema.js";
import { createAuthRouter } from "../server/routes/auth.js";
import { createAdminRouter } from "../server/routes/admin.js";
import { clientIp } from "../server/auth/session.js";
import { createUser } from "../server/auth/users.js";
import { issueToken } from "../server/auth/tokens.js";
import { recordCall } from "../server/auth/usage.js";

const silent = { log() {}, warn() {} } as unknown as Console;

// express 5 不自带 d.ts：测试里只声明真正用到的形状，把它当不透明宿主
type JsonResponse = { status(code: number): JsonResponse; json(body: unknown): unknown; set(name: string, value: string): void };
const express = createRequire(import.meta.url)("express") as {
  (): {
    use(handler: unknown): void;
    use(path: string, handler: unknown): void;
    listen(port: number, host: string, callback: () => void): Server;
  };
  json(): unknown;
};

type Db = ReturnType<typeof openDatabase>;

function one(db: Db, sql: string, ...params: string[]): Record<string, any> {
  return db.prepare(sql).get(...params) as unknown as Record<string, any>;
}

function memoryDb(): Db {
  const options = { file: ":memory:", logger: silent };
  return openDatabase(options);
}

// 起真实 express：认证与管理路由都挂在各自的保留前缀下，整条链路（含 JSON 解析、守卫、状态码）都走一遍
function createApp(db: Db) {
  const app = express();
  app.use(express.json());
  const keyOptions = { key: randomBytes(32) };
  app.use("/api/auth", createAuthRouter({ db, env: { NODE_ENV: "test" } }));
  app.use(
    "/api/admin",
    createAdminRouter({
      db,
      key: keyOptions.key,
      declaredCredentials: new Map(),
      widgetCredentialRequirements: new Map(),
      widgetAuth: new Map(),
    }),
  );
  app.use((_request: unknown, response: JsonResponse) => {
    response.status(404).json({ error: "Not found" });
  });
  return app;
}

async function withApp(db: Db, run: (base: string) => Promise<void>) {
  const app = createApp(db);
  const server = await new Promise<Server>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

// Set-Cookie 里取出 `wn_session=...`，后续请求原样带回
function sessionCookie(response: Response): string {
  const raw = response.headers.get("set-cookie") ?? "";
  return raw.split(";")[0] ?? "";
}

async function login(base: string, username: string, password: string) {
  return fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
}

describe("来源 IP：只信反向代理覆写的 X-Real-IP", () => {
  it("客户端自带的 X-Forwarded-For 被忽略，伪造头无法绕过限流与黑名单", () => {
    const request = {
      headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2", "x-real-ip": "9.9.9.9" },
      socket: { remoteAddress: "10.0.0.1" },
    };
    assert.equal(clientIp(request), "9.9.9.9");
    // 只有 XFF 时回落到 socket，而不是采信可伪造的那一段
    assert.equal(clientIp({ headers: { "x-forwarded-for": "1.1.1.1" }, socket: { remoteAddress: "10.0.0.1" } }), "10.0.0.1");
  });

  it("IPv4-mapped IPv6 还原成 IPv4，无来源时兜底 unknown", () => {
    assert.equal(clientIp({ headers: {}, socket: { remoteAddress: "::ffff:127.0.0.1" } }), "127.0.0.1");
    assert.equal(clientIp({ headers: {}, socket: {} }), "unknown");
  });
});

describe("认证路由：登录、改名、改密码", () => {
  it("改名后旧名不可登录、会话继续有效；改密码踢掉其它会话", async () => {
    const db = memoryDb();
    createUser(db, "admin", "password123");
    createUser(db, "second", "password123");

    await withApp(db, async (base) => {
      assert.equal((await login(base, "admin", "wrong-password")).status, 401);

      const first = await login(base, "admin", "password123");
      assert.equal(first.status, 200);
      const firstCookie = sessionCookie(first);
      const secondCookie = sessionCookie(await login(base, "admin", "password123"));

      const me = await fetch(`${base}/api/auth/me`, { headers: { cookie: firstCookie } });
      assert.equal((await me.json() as { user: { username: string } }).user.username, "admin");

      const rename = (username: string, cookie = firstCookie) =>
        fetch(`${base}/api/auth/username`, {
          method: "PUT",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({ username }),
        });

      assert.equal((await rename("a")).status, 400);
      assert.equal((await rename("second")).status, 409);
      const renamed = await rename("新账号");
      assert.equal(renamed.status, 200);
      assert.deepEqual(await renamed.json(), { user: { username: "新账号" } });

      // 会话按 user_id 关联：Cookie 不变也能读到新名字
      const afterRename = await fetch(`${base}/api/auth/me`, { headers: { cookie: secondCookie } });
      assert.equal((await afterRename.json() as { user: { username: string } }).user.username, "新账号");
      assert.equal((await login(base, "admin", "password123")).status, 401);
      assert.equal((await login(base, "新账号", "password123")).status, 200);

      const changePassword = (currentPassword: string, newPassword: string, cookie = firstCookie) =>
        fetch(`${base}/api/auth/password`, {
          method: "POST",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({ currentPassword, newPassword }),
        });

      assert.equal((await changePassword("nope", "newpassword123")).status, 400);
      assert.equal((await changePassword("password123", "short")).status, 400);
      const changed = await changePassword("password123", "newpassword123");
      assert.equal(changed.status, 200);
      assert.ok((await changed.json() as { revokedSessions: number }).revokedSessions >= 1);

      // 当前会话保留，其它会话立刻失效
      assert.equal((await fetch(`${base}/api/auth/me`, { headers: { cookie: firstCookie } })).status, 200);
      assert.equal((await fetch(`${base}/api/auth/me`, { headers: { cookie: secondCookie } })).status, 401);

      // 未登录改名直接 401
      assert.equal((await rename("another", "")).status, 401);
    });
  });

  it("同一 IP 连续登录失败 10 次后返回 429", async () => {
    const db = memoryDb();
    createUser(db, "admin", "password123");

    await withApp(db, async (base) => {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        assert.equal((await login(base, "admin", "wrong-password")).status, 401);
      }
      assert.equal((await login(base, "admin", "wrong-password")).status, 429);
    });
  });

  it("改名失败次数同样按 IP 限流，避免被用来枚举账号名", async () => {
    const db = memoryDb();
    createUser(db, "admin", "password123");

    await withApp(db, async (base) => {
      const cookie = sessionCookie(await login(base, "admin", "password123"));
      const rename = (username: string) =>
        fetch(`${base}/api/auth/username`, {
          method: "PUT",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({ username }),
        });
      for (let attempt = 0; attempt < 10; attempt += 1) {
        assert.equal((await rename("a")).status, 400);
      }
      assert.equal((await rename("valid-name")).status, 429);
    });
  });
});

describe("管理路由：会话守卫、保留期与清理", () => {
  it("未登录一律 401；登录后保留期与清理参数在路由层校验", async () => {
    const db = memoryDb();
    createUser(db, "admin", "password123");

    await withApp(db, async (base) => {
      assert.equal((await fetch(`${base}/api/admin/tokens`)).status, 401);
      assert.equal((await fetch(`${base}/api/admin/call-logs/stats`)).status, 401);

      const cookie = sessionCookie(await login(base, "admin", "password123"));
      const call = (path: string, init: { method?: string; body?: string } = {}) =>
        fetch(`${base}/api/admin${path}`, {
          ...init,
          headers: { "content-type": "application/json", cookie },
        });

      const stats = await (await call("/call-logs/stats")).json() as { stats: { total: number; retentionDays: number } };
      assert.equal(stats.stats.total, 0);
      assert.equal(stats.stats.retentionDays, 7);

      const setRetention = (days: unknown) =>
        call("/call-logs/retention", { method: "PUT", body: JSON.stringify({ days }) });
      assert.equal((await setRetention(0)).status, 400);
      assert.equal((await setRetention(91)).status, 400);
      assert.equal((await setRetention(7.5)).status, 400);
      const updated = await setRetention(30);
      assert.equal(updated.status, 200);
      assert.equal((await updated.json() as { stats: { retentionDays: number } }).stats.retentionDays, 30);

      // 既不指定 all 也不指定天数：拒绝而不是静默清空
      assert.equal((await call("/call-logs", { method: "DELETE" })).status, 400);
      assert.equal((await call("/call-logs?olderThanDays=-1", { method: "DELETE" })).status, 400);
      assert.equal((await call("/call-logs?olderThanDays=7", { method: "DELETE" })).status, 200);
      assert.equal((await call("/call-logs?all=1", { method: "DELETE" })).status, 200);
    });
  });

  it("删除令牌默认保留调用记录，?clearLogs=1 才连同记录一起删", async () => {
    const db = memoryDb();
    createUser(db, "admin", "password123");
    const kept = issueToken(db, { widgetId: "clock" });
    const purge = issueToken(db, { widgetId: "clock" });
    const now = Date.now();
    const callLog = { method: "GET", path: "/api/weather", status: 200, durationMs: 3, ip: "1.2.3.4" };
    recordCall(db, { ...callLog, tokenId: kept.id }, now);
    recordCall(db, { ...callLog, tokenId: purge.id }, now);

    await withApp(db, async (base) => {
      const cookie = sessionCookie(await login(base, "admin", "password123"));
      const remove = (id: string, query = "") =>
        fetch(`${base}/api/admin/tokens/${id}${query}`, { method: "DELETE", headers: { cookie } });

      const keptResult = await remove(kept.id);
      assert.equal(keptResult.status, 200);
      assert.equal((await keptResult.json() as { clearedLogs: boolean }).clearedLogs, false);
      assert.equal(one(db, "SELECT COUNT(*) AS total FROM call_logs").total, 2);

      const purgeResult = await remove(purge.id, "?clearLogs=1");
      assert.equal(purgeResult.status, 200);
      assert.equal((await purgeResult.json() as { clearedLogs: boolean }).clearedLogs, true);
      assert.equal(one(db, "SELECT COUNT(*) AS total FROM call_logs").total, 1);
      assert.equal(one(db, "SELECT COUNT(*) AS total FROM usage_hourly").total, 1);

      // 已删除的令牌再删一次：404 而不是静默成功
      assert.equal((await remove(purge.id)).status, 404);
      assert.equal((await remove("not-a-token")).status, 400);
    });
  });
});
