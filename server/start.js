// 必须在解析主密钥之前加载 .env：否则本地已有的 WIDGET_DB_KEY 会被文件密钥抢先
import "dotenv/config";
import { ensureMasterKey } from "./crypto/key-store.js";

// 启动引导：先拿到主密钥（环境变量或独立密钥卷），注入进程环境后再加载服务本体。
// 这样 server/index.js 仍然只从环境变量读取，不感知密钥来自哪里。
// 仅供 Node 侧使用。

try {
  const { key } = await ensureMasterKey();
  process.env.WIDGET_DB_KEY = key.toString("base64");
} catch (error) {
  console.error(`[auth] ${error.message}`);
  process.exit(1);
}

await import("./index.js");
