import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { MASTER_KEY_ENV, readMasterKey } from "./secrets.js";

// 主密钥的获取顺序：环境变量优先（兼容已有部署），其次独立密钥卷里的文件，最后首次生成。
// 文件放在独立命名卷（默认 /key/master.key），与数据库卷分开备份；
// 生成后绝不重写，否则库里已加密的第三方密钥会全部解不开。
// 仅供 Node 侧使用。

// 本地默认放 data/ 便于开发；生产由 compose 显式指定 /key/master.key（独立卷）
export const DEFAULT_KEY_PATH = path.resolve("data", "master.key");
const KEY_BYTES = 32;

export function masterKeyPath(env = process.env) {
  const configured = String(env.WIDGET_KEY_PATH ?? "").trim();
  return configured || DEFAULT_KEY_PATH;
}

export function decodeMasterKey(raw, source = MASTER_KEY_ENV) {
  const value = String(raw ?? "").trim();
  if (!value) throw new Error(`缺少主密钥：${source} 为空`);
  const key = Buffer.from(value, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(`${source} 必须是 32 字节的 base64（当前解码为 ${key.length} 字节）`);
  }
  return key;
}

// 原子写入：先写同目录临时文件再 rename，避免进程中断留下半截密钥
export async function writeKeyFile(file, keyBase64) {
  const target = path.resolve(file);
  await mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.tmp-${process.pid}`;
  await writeFile(temp, `${keyBase64}\n`, { mode: 0o600 });
  await chmod(temp, 0o600).catch(() => undefined);
  await rename(temp, target);
}

/**
 * 解析主密钥。generate=false 时缺密钥直接报错（供 CLI 使用，绝不悄悄换一把新钥匙）。
 * 返回 source 让 CLI 知道轮换后应该写文件还是提示更新环境变量。
 */
export async function ensureMasterKey({ env = process.env, logger = console, generate = true } = {}) {
  if (String(env[MASTER_KEY_ENV] ?? "").trim()) {
    return { key: readMasterKey(env), source: "env", path: null, generated: false };
  }

  const file = masterKeyPath(env);
  try {
    const raw = await readFile(file, "utf8");
    return { key: decodeMasterKey(raw, file), source: "file", path: file, generated: false };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  if (!generate) {
    throw new Error(
      `缺少主密钥：请设置 ${MASTER_KEY_ENV}，或先生成密钥文件 ${file}（例如 docker compose up 一次自动生成）`,
    );
  }

  const keyBase64 = randomBytes(KEY_BYTES).toString("base64");
  await writeKeyFile(file, keyBase64);
  logger.warn?.(
    `[crypto] 已自动生成主密钥 ${file}：请立即单独备份该文件；缺失后库内第三方密钥将无法解密`,
  );
  return { key: decodeMasterKey(keyBase64, file), source: "file", path: file, generated: true };
}
