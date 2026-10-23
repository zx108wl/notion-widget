import { randomBytes } from "node:crypto";
import { randomToken, safeEqualHex, sha256Hex } from "../crypto/secrets.js";
import { isCredentialRef } from "./credentials.js";

// 嵌入令牌（capability URL）：`<id>.<secret>`，id 形如 `w_<22 位 base62>`。
// - id 可公开：用于监控、日志关联与注销定位（放 URL fragment 的 `#t=<id>.<secret>`）；
// - secret 只存 SHA-256，明文仅在签发时返回一次；
// - 完整嵌入链接由「设置 → 访问令牌」在签发时生成并复制，工作台不再回显令牌；
// - 注销 = 置 status='revoked'，下次校验立刻 401，不改 env、不重启。
// 仅供 Node 侧使用。

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ID_LENGTH = 22;
const SECRET_BYTES = 32;

export const TOKEN_ID_RE = /^w_[0-9A-Za-z]{22}$/;
export const TOKEN_RE = /^(w_[0-9A-Za-z]{22})\.([A-Za-z0-9_-]{20,})$/;

function randomBase62(length) {
  const bytes = randomBytes(length);
  let out = "";
  for (let index = 0; index < length; index += 1) out += ALPHABET[bytes[index] % ALPHABET.length];
  return out;
}

/**
 * 签发嵌入令牌
 * @param {ReturnType<import("../db/schema.js").openDatabase>} db
 * @param {{ widgetId: string, label?: string, credentials?: string[] }} opts
 * @param {Date} [now]
 */
export function issueToken(db, { widgetId, label, credentials = [] }, now = new Date()) {
  const id = `w_${randomBase62(ID_LENGTH)}`;
  const secret = randomToken(SECRET_BYTES);
  const token = `${id}.${secret}`;
  const bound = Array.isArray(credentials)
    ? [...new Set(credentials.filter((ref) => isCredentialRef(ref)))]
    : [];
  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO embed_tokens (id, widget_id, label, secret_hash, status, created_at, use_count)
       VALUES (?, ?, ?, ?, 'active', ?, 0)`,
    ).run(id, widgetId, label ? String(label) : null, sha256Hex(secret), now.toISOString());
    if (bound.length) {
      const insert = db.prepare("INSERT INTO token_credentials (token_id, ref) VALUES (?, ?)");
      for (const ref of bound) insert.run(id, ref);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { id, widgetId, label: label ? String(label) : null, token, credentials: bound };
}

// 令牌已绑定的第三方密钥 ref 列表：运行时 context.credential(ref) 只放行这里面的
export function tokenCredentials(db, id) {
  return db
    .prepare("SELECT ref FROM token_credentials WHERE token_id = ? ORDER BY ref")
    .all(id)
    .map((row) => row.ref);
}

// 查库校验（不是比对 env 常量）：按 id 查行 → status 必须 active → 常数时间比对 secret 哈希
export function verifyToken(db, token) {
  const match = TOKEN_RE.exec(String(token ?? ""));
  if (!match) return null;
  const [, id, secret] = match;
  const row = db.prepare("SELECT * FROM embed_tokens WHERE id = ?").get(id);
  if (!row || row.status !== "active") return null;
  if (!safeEqualHex(sha256Hex(secret), row.secret_hash)) return null;
  return row;
}

export function touchToken(db, id, now = new Date()) {
  db.prepare("UPDATE embed_tokens SET last_used_at = ?, use_count = use_count + 1 WHERE id = ?").run(
    now.toISOString(),
    id,
  );
}

export function revokeToken(db, id, reason = "manual", now = new Date()) {
  const result = db
    .prepare(
      `UPDATE embed_tokens SET status = 'revoked', revoked_at = ?, revoked_reason = ?
        WHERE id = ? AND status = 'active'`,
    )
    .run(now.toISOString(), reason, id);
  return Number(result.changes) > 0;
}

// 令牌级 IP 黑名单：只拦该令牌从这个 IP 的调用；删除令牌时由外键级联清理
export function blockTokenIp(db, tokenId, ip, now = new Date()) {
  db.prepare(
    `INSERT INTO token_ip_blocks (token_id, ip, created_at) VALUES (?, ?, ?)
     ON CONFLICT (token_id, ip) DO NOTHING`,
  ).run(tokenId, ip, now.toISOString());
}

export function unblockTokenIp(db, tokenId, ip) {
  const result = db.prepare("DELETE FROM token_ip_blocks WHERE token_id = ? AND ip = ?").run(tokenId, ip);
  return Number(result.changes) > 0;
}

export function isTokenIpBlocked(db, tokenId, ip) {
  if (!ip) return false;
  return Boolean(db.prepare("SELECT 1 AS ok FROM token_ip_blocks WHERE token_id = ? AND ip = ?").get(tokenId, ip));
}

// 删除令牌：令牌行与绑定关系立即清除，调用记录默认保留（作为审计线索，按保留期自然过期）；
// 只有显式 clearLogs 才连同调用明细与按小时汇总一起删除。
export function deleteToken(db, id, { clearLogs = false } = {}) {
  db.exec("BEGIN");
  try {
    if (clearLogs) {
      db.prepare("DELETE FROM call_logs WHERE token_id = ?").run(id);
      db.prepare("DELETE FROM usage_hourly WHERE token_id = ?").run(id);
    }
    const result = db.prepare("DELETE FROM embed_tokens WHERE id = ?").run(id);
    db.exec("COMMIT");
    return Number(result.changes) > 0;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

// 已注销令牌的保留期：列表不再展示，7 天后连行一起删除（token_credentials 由外键级联清理）
export const REVOKED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export function purgeRevokedTokens(db, now = Date.now()) {
  const cutoff = new Date(now - REVOKED_RETENTION_MS).toISOString();
  const result = db
    .prepare("DELETE FROM embed_tokens WHERE status = 'revoked' AND revoked_at IS NOT NULL AND revoked_at <= ?")
    .run(cutoff);
  return Number(result.changes);
}

// 列表只返回元信息：令牌明文不落库、不可回显，完整嵌入链接在签发时复制
export function listTokens(db, now = Date.now()) {
  // 读取前先清一遍过期注销记录：服务长期不重启时也能按保留期自动清除
  purgeRevokedTokens(db, now);
  return db
    .prepare(
      `SELECT id, widget_id, label, status, created_at, revoked_at, last_used_at, use_count, revoked_reason
         FROM embed_tokens ORDER BY created_at DESC`,
    )
    .all();
}

export function readBearerToken(request) {
  const header = request?.headers?.authorization;
  if (typeof header !== "string") return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

// 嵌入页的完整可粘贴 URL：令牌放 fragment，fragment 不发送给服务端 → 不进 nginx access log、不进 Referer
export function embedUrl(origin, widgetId, token) {
  return `${origin}/widget/${encodeURIComponent(widgetId)}#t=${token}`;
}

export function requestOrigin(request, fallback = "") {
  // 浏览器发起的 POST 会带 Origin：它指向工作台页面（dev 下是 5173，生产是同域域名），
  // 比 Host 更可靠——经 vite/nginx 代理后 Host 可能已被改写成 API 的地址
  const origin = firstHeaderValue(request?.headers?.origin);
  if (origin && /^https?:\/\/[^/]+$/i.test(origin)) return origin;
  const proto =
    firstHeaderValue(request?.headers?.["x-forwarded-proto"]) ?? request?.protocol ?? "http";
  const host = firstHeaderValue(request?.headers?.["x-forwarded-host"]) ?? request?.headers?.host;
  if (!host) return fallback;
  return `${proto}://${host}`;
}

function firstHeaderValue(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw ? String(raw).split(",")[0].trim() : null;
}
