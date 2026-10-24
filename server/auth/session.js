import { randomToken, sha256Hex } from "../crypto/secrets.js";

// 会话：服务端可撤销（不是自签 JWT）——登出、改密码、发现异常都能立刻失效。
// 库内只存令牌的 SHA-256，明文只存在于 httpOnly Cookie 里。仅供 Node 侧使用。

export const SESSION_COOKIE = "wn_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createSession(db, userId, now = Date.now()) {
  const token = randomToken(32);
  const expiresAt = new Date(now + SESSION_TTL_MS).toISOString();
  db.prepare(
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, NULL)",
  ).run(sha256Hex(token), userId, new Date(now).toISOString(), expiresAt);
  return { token, expiresAt };
}

export function resolveSession(db, token, now = Date.now()) {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT s.token_hash, s.user_id, s.expires_at, s.revoked_at, u.username, u.must_change_password
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ?`,
    )
    .get(sha256Hex(token));
  if (!row || row.revoked_at) return null;
  if (Date.parse(row.expires_at) <= now) return null;
  return row;
}

export function revokeSession(db, token, now = Date.now()) {
  if (!token) return false;
  const result = db
    .prepare("UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL")
    .run(new Date(now).toISOString(), sha256Hex(token));
  return Number(result.changes) > 0;
}

// 改密码后踢掉除当前会话外的所有会话
export function revokeOtherSessions(db, userId, keepToken, now = Date.now()) {
  const result = db
    .prepare(
      "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND token_hash != ? AND revoked_at IS NULL",
    )
    .run(new Date(now).toISOString(), userId, sha256Hex(keepToken ?? ""));
  return Number(result.changes);
}

// CLI 重置密码后使用：该账号所有会话立即失效
export function revokeAllSessions(db, userId, now = Date.now()) {
  const result = db
    .prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL")
    .run(new Date(now).toISOString(), userId);
  return Number(result.changes);
}

export function pruneSessions(db, now = Date.now()) {
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date(now).toISOString());
}

export function readCookie(request, name) {
  const header = request?.headers?.cookie;
  if (!header) return null;
  for (const part of String(header).split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== name) continue;
    const raw = part.slice(index + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

export function serializeSessionCookie(token, { secure, maxAgeSeconds = SESSION_TTL_MS / 1000 } = {}) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  if (maxAgeSeconds > 0) parts.push(`Max-Age=${Math.floor(maxAgeSeconds)}`);
  return parts.join("; ");
}

export function clearSessionCookie({ secure } = {}) {
  return serializeSessionCookie("", { secure, maxAgeSeconds: 0 });
}

export function sessionCookieSecure(env = process.env) {
  // 生产（compose 里 NODE_ENV=production）一律带 Secure；
  // 本地 http 开发下带上 Secure 浏览器会直接丢弃，故仅在非生产环境放宽
  return env.NODE_ENV === "production";
}

// 管理员接口的登录守卫：解析 Cookie 会话，无效即 401
export function createSessionGuard(db) {
  return function requireSession(request, response, next) {
    const token = readCookie(request, SESSION_COOKIE);
    const session = resolveSession(db, token);
    if (!session) {
      response.status(401).json({ error: "未登录或会话已过期" });
      return;
    }
    request.session = session;
    request.sessionToken = token;
    next();
  };
}

// 首次登录改密守卫：必须挂在会话守卫之后。
// 放行范围只保留 /api/auth 内的 me / password / logout，其它接口一律 403。
export function createPasswordChangeGuard() {
  return function requirePasswordChange(request, response, next) {
    if (Number(request.session?.must_change_password) === 1) {
      response.status(403).json({ error: "首次登录需要先修改密码", code: "PASSWORD_CHANGE_REQUIRED" });
      return;
    }
    next();
  };
}

// 来源 IP：只信反向代理用 $remote_addr 覆写的 X-Real-IP（见 deploy/nginx.conf 的 realip 段），
// 绝不解析 X-Forwarded-For——它由客户端自带值拼接而成，取任意一段都能被伪造，
// 而登录限流与令牌级 IP 黑名单都依赖这个值，被绕过即等于失效。
export function clientIp(request) {
  const header = request?.headers?.["x-real-ip"];
  const raw = Array.isArray(header) ? header[0] : header;
  return normalizeIp(raw) || normalizeIp(request?.socket?.remoteAddress) || "unknown";
}

// IPv4-mapped IPv6（::ffff:1.2.3.4，Node 在双栈监听时常见）统一还原成 IPv4，
// 保证调用记录、黑名单与限流用的都是同一种写法
function normalizeIp(raw) {
  const value = raw ? String(raw).trim() : "";
  if (!value) return "";
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(value);
  return mapped ? mapped[1] : value;
}
