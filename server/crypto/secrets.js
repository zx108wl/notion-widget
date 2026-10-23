import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

// 库内第三方密钥的加密。主密钥是**对称密钥**（不是证书、不是非对称密钥对）：
// 一条 32 字节随机数（`openssl rand -base64 32`），同时用于 AES-256-GCM 的加密与解密。
// 它只留在宿主机 .env 的 WIDGET_DB_KEY，绝不入库：进库等于加密形同虚设。
// 备份要求：主密钥与数据库文件分开存放（一个丢了另一个也救不回来；两个一起丢等于不加密）。
// 仅供 Node 侧使用。

export const MASTER_KEY_ENV = "WIDGET_DB_KEY";
export const SECRET_FORMAT = "v1";
const CIPHER = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

// 缺失或长度不对一律拒绝启动：绝不做"没有主密钥就明文存"的降级
export function readMasterKey(env = process.env) {
  const raw = env[MASTER_KEY_ENV];
  if (!raw || !String(raw).trim()) {
    throw new Error(`缺少 ${MASTER_KEY_ENV}：请执行 openssl rand -base64 32 生成主密钥并写入 .env`);
  }
  const key = Buffer.from(String(raw).trim(), "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(`${MASTER_KEY_ENV} 必须是 32 字节的 base64（当前解码为 ${key.length} 字节）`);
  }
  return key;
}

// 密文绑定到它所属的那一行，防止把 A 记录的密文挪到 B 记录（换位攻击）
export function credentialAad(provider, slot) {
  return `${provider}|${slot}`;
}

// 存储格式：v1.<keyVersion>.<iv_b64>.<tag_b64>.<ciphertext_b64>；每条记录独立随机 IV
export function encryptSecret(plaintext, { key, keyVersion = 1, aad = "" } = {}) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(CIPHER, key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    SECRET_FORMAT,
    keyVersion,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decryptSecret(payload, { key, aad = "" } = {}) {
  const parts = String(payload ?? "").split(".");
  if (parts.length !== 5 || parts[0] !== SECRET_FORMAT) throw new Error("密文格式无法识别");
  const iv = Buffer.from(parts[2], "base64");
  const tag = Buffer.from(parts[3], "base64");
  const ciphertext = Buffer.from(parts[4], "base64");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error("密文格式无法识别");
  try {
    const decipher = createDecipheriv(CIPHER, key, iv);
    // AAD 不一致（例如密文被挪到别的 provider/slot）时 setAuthTag/ final 会校验失败
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // 错误信息脱敏：绝不把密文/密钥/明文拼进异常消息
    throw new Error("密钥解密失败");
  }
}

export function sha256Hex(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

// 定长哈希的常数时间比对（长度不同直接 false，不做短路比对）
export function safeEqualHex(a, b) {
  const left = Buffer.from(String(a), "hex");
  const right = Buffer.from(String(b), "hex");
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

// 日志/错误响应里需要提到敏感值时的统一脱敏口径
export function redact(value) {
  const text = value == null ? "" : String(value);
  return text ? `••••(${text.length})` : "";
}
