import type { WidgetRouteHandler } from "../../src/core/server/plugin-server.js";

// 密钥演示插件：验证「设置中注册密钥 → 插件服务端解密读取 → 接口返回」的完整链路。
// 凭据引用固定为 secretDemo.default；只有 config.json 的 server.credentials 声明过的 ref 才允许读取。

const CREDENTIAL_REF = "secretDemo.default";

const handlers: Record<string, WidgetRouteHandler> = {
  "GET /api/secret_demo/secret": (_request, response, ctx) => {
    // 明文密钥绝不落缓存
    response.set("Cache-Control", "no-store");
    try {
      const value = ctx.credential(CREDENTIAL_REF);
      return response.json({
        configured: true,
        ref: CREDENTIAL_REF,
        value,
        length: Array.from(value).length,
        readAt: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // 未配置是正常的业务状态：返回 200 让组件展示"去设置里填"的引导，而不是红色错误
      if (message.startsWith("未配置凭据")) {
        return response.json({ configured: false, ref: CREDENTIAL_REF });
      }
      // 令牌签发时未勾选该凭据：语义上是权限不足，单独给出可操作的提示
      if (message.includes("未授权该凭据")) {
        return response.status(403).json({
          error: message,
          hint: `签发访问令牌时勾选 ${CREDENTIAL_REF}，或直接在工作台预览。`,
        });
      }
      return response.status(500).json({ error: message });
    }
  },
};

export const routes = handlers;
