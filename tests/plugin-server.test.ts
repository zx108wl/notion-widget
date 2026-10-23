import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateConfig } from "../src/core/schema/widget-config.schema.js";
import { widgetMetadata } from "../src/core/schema/widget-config.runtime.js";
import { parseRouteKey, isReservedRoute } from "../src/core/schema/widget-server.schema.js";

const configUrl = "/widgets/status/config.json";
const readSource = async () =>
  JSON.parse(await readFile(new URL("../widgets/status/config.json", import.meta.url), "utf8"));

describe("插件服务端声明：缺省即与今天完全一致", () => {
  it("无 server 块照旧通过，且元信息输出不变", async () => {
    const source = await readSource();
    assert.doesNotThrow(() => validateConfig(source, "status"));

    const before = widgetMetadata(source, configUrl);
    const withServer = { ...source, server: { entry: "./server.ts", expose: ["GET /api/weather"] } };
    assert.deepEqual(widgetMetadata(withServer, configUrl), before);
    assert.equal(Object.hasOwn(before, "server"), false);
  });

  it("合法的 server 声明被接受", async () => {
    const source = await readSource();
    for (const server of [
      { entry: "./server.ts", expose: ["GET /api/weather"] },
      { entry: "./nested/api.js", expose: ["POST /api/things/1", "DELETE /api/things/2"] },
      { entry: "./server.ts", expose: ["GET /api/x"], auth: "token", credentials: ["weatherApi.default"] },
      {
        entry: "./server.ts",
        expose: ["GET /api/x"],
        auth: "token",
        credentials: [
          { ref: "openai.default", label: "OpenAI API Key", description: "用于生成每日一句" },
        ],
      },
      { entry: "./server.ts", expose: ["GET /api/x"], auth: "none" },
    ]) {
      assert.doesNotThrow(() => validateConfig({ ...source, server }, "status"));
    }
  });

  it("非法声明一律拒绝", async () => {
    const source = await readSource();
    const cases: unknown[] = [
      { entry: "server.ts", expose: ["GET /api/weather"] }, // 缺 ./
      { entry: "./server.md", expose: ["GET /api/weather"] }, // 非 js/ts
      { entry: "./../server.ts", expose: ["GET /api/weather"] }, // 越出插件目录
      { entry: "./server.ts", expose: [] }, // 空白名单
      { entry: "./server.ts", expose: ["GET /api/../x"] }, // 目录穿越
      { entry: "./server.ts", expose: ["GET /api/weather:param"] }, // 参数路由
      { entry: "./server.ts", expose: ["GET /api/*"] }, // 通配路由
      { entry: "./server.ts", expose: ["GET /weather"] }, // 非 /api/
      { entry: "./server.ts", expose: ["FETCH /api/x"] }, // 非法方法
      { entry: "./server.ts", expose: ["GET /api/x", "GET /api/x"] }, // 重复
      { entry: "./server.ts", expose: ["GET /api/health"] }, // 核心保留路由
      { entry: "./server.ts", expose: ["GET /api/admin/credentials"] }, // 保留前缀
      { entry: "./server.ts", expose: ["GET /api/x"], credentials: ["weatherApi"] }, // 非 provider.slot
      { entry: "./server.ts", expose: ["GET /api/x"], credentials: ["a.b", "a.b"] }, // 凭据重复
      { entry: "./server.ts", expose: ["GET /api/x"], auth: "token", credentials: [{ ref: "a.b", label: "" }] }, // 缺可读名称
      { entry: "./server.ts", expose: ["GET /api/x"], auth: "token", credentials: [{ ref: "a", label: "A" }] }, // 非 provider.slot
      { entry: "./server.ts", expose: ["GET /api/x"], auth: "token", credentials: ["a.b", { ref: "a.b", label: "A" }] }, // 跨写法重复
      { entry: "./server.ts", expose: ["GET /api/x"], auth: "session" }, // 非法 auth
    ];
    for (const server of cases) {
      assert.throws(
        () => validateConfig({ ...source, server }, "status"),
        Error,
        `应被拒绝: ${JSON.stringify(server)}`,
      );
    }
  });

  it("路由 key 解析与保留路由判定", () => {
    assert.deepEqual(parseRouteKey("GET /api/weather"), { method: "GET", path: "/api/weather" });
    assert.notEqual(parseRouteKey("GET /api/a/b-c_1"), null);
    assert.equal(parseRouteKey("GET /api/"), null);
    assert.equal(parseRouteKey("GET /api/a/"), null);
    assert.equal(parseRouteKey("NOPE /api/a"), null);
    assert.equal(isReservedRoute("GET /api/health"), true);
    assert.equal(isReservedRoute("GET /api/auth/login"), true);
    assert.equal(isReservedRoute("GET /api/weather"), false);
  });
});
