import { Router } from "express";
import {
  authenticate,
  findUserByUsername,
  markLogin,
  updatePassword,
  updateUsername,
} from "../auth/users.js";
import {
  clearSessionCookie,
  clientIp,
  createSession,
  createSessionGuard,
  revokeOtherSessions,
  revokeSession,
  serializeSessionCookie,
  sessionCookieSecure,
} from "../auth/session.js";

// /api/auth/*：登录态与口令管理。属核心保留前缀，插件不得声明。
// 仅供 Node 侧使用。

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const MIN_PASSWORD_LENGTH = 8;
// 账号名：2-32 位，允许各国文字、数字与 . _ -（不含空格与控制字符）
const USERNAME_RE = /^[\p{L}\p{N}._-]{2,32}$/u;

// 按 IP 的失败计数：登录与改名共用同一套窗口策略，各用各的实例
function createAttemptLimiter() {
  const attempts = new Map();
  const entryOf = (ip, now) => {
    const entry = attempts.get(ip);
    return entry && entry.resetAt > now ? entry : null;
  };
  // 过期计数必须清掉，否则大量不同来源 IP 会一直堆积在内存里
  const prune = (now) => {
    for (const [ip, entry] of attempts) {
      if (entry.resetAt <= now) attempts.delete(ip);
    }
  };
  return {
    allow(ip, now = Date.now()) {
      prune(now);
      const entry = entryOf(ip, now);
      return !entry || entry.count < LOGIN_MAX_ATTEMPTS;
    },
    fail(ip, now = Date.now()) {
      const entry = entryOf(ip, now);
      if (entry) entry.count += 1;
      else attempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    },
    reset(ip) {
      attempts.delete(ip);
    },
  };
}

export function createAuthRouter({ db, env = process.env }) {
  const router = Router();
  const secure = sessionCookieSecure(env);
  const limiter = createAttemptLimiter();
  // 改名的失败计数单独一份：登录与改名互不影响
  const renameLimiter = createAttemptLimiter();
  const requireSession = createSessionGuard(db);

  router.post("/login", (request, response) => {
    const ip = clientIp(request);
    if (!limiter.allow(ip)) {
      return response.status(429).json({ error: "登录尝试过于频繁，请稍后再试" });
    }
    const username = String(request.body?.username ?? "").trim();
    const password = String(request.body?.password ?? "");
    if (!username || !password) {
      return response.status(400).json({ error: "请输入用户名与密码" });
    }
    const user = authenticate(db, username, password);
    if (!user) {
      limiter.fail(ip);
      return response.status(401).json({ error: "用户名或密码不正确" });
    }
    limiter.reset(ip);
    const { token, expiresAt } = createSession(db, user.id);
    markLogin(db, user.id);
    response.set("Set-Cookie", serializeSessionCookie(token, { secure }));
    response.set("Cache-Control", "no-store");
    return response.json({
      user: { username: user.username, mustChangePassword: Number(user.must_change_password) === 1 },
      expiresAt,
    });
  });

  router.post("/logout", (request, response) => {
    const token = request.sessionToken ?? null;
    revokeSession(db, token);
    response.set("Set-Cookie", clearSessionCookie({ secure }));
    response.set("Cache-Control", "no-store");
    return response.json({ ok: true });
  });

  router.get("/me", requireSession, (request, response) => {
    response.set("Cache-Control", "no-store");
    return response.json({
      user: {
        username: request.session.username,
        mustChangePassword: Number(request.session.must_change_password) === 1,
      },
    });
  });

  // 修改账号名：会话按 user_id 关联，改名后无需重新登录；.env 里的 ADMIN_USERNAME 只是引导值
  router.put("/username", requireSession, (request, response) => {
    if (Number(request.session.must_change_password) === 1) {
      return response.status(403).json({ error: "首次登录需要先修改密码", code: "PASSWORD_CHANGE_REQUIRED" });
    }
    const ip = clientIp(request);
    // 改名本身不敏感，但反复试探可以枚举账号名，失败次数仍按 IP 限制
    if (!renameLimiter.allow(ip)) {
      return response.status(429).json({ error: "操作过于频繁，请稍后再试" });
    }
    const username = String(request.body?.username ?? "").trim();
    if (!USERNAME_RE.test(username)) {
      renameLimiter.fail(ip);
      return response
        .status(400)
        .json({ error: "账号名需为 2-32 位，只能包含文字、数字、点、下划线或连字符" });
    }
    const owner = findUserByUsername(db, username);
    if (owner && owner.id !== request.session.user_id) {
      renameLimiter.fail(ip);
      return response.status(409).json({ error: "该账号名已被占用" });
    }
    try {
      updateUsername(db, request.session.user_id, username);
    } catch (error) {
      // 两个请求同时改名时都可能通过上面的查重，最终由 UNIQUE 约束兜底
      if (/UNIQUE/i.test(String(error?.message))) {
        renameLimiter.fail(ip);
        return response.status(409).json({ error: "该账号名已被占用" });
      }
      throw error;
    }
    renameLimiter.reset(ip);
    response.set("Cache-Control", "no-store");
    return response.json({ user: { username } });
  });

  router.post("/password", requireSession, (request, response) => {
    const current = String(request.body?.currentPassword ?? "");
    const next = String(request.body?.newPassword ?? "");
    if (next.length < MIN_PASSWORD_LENGTH) {
      return response.status(400).json({ error: `新密码至少 ${MIN_PASSWORD_LENGTH} 位` });
    }
    const user = authenticate(db, request.session.username, current);
    if (!user) return response.status(400).json({ error: "当前密码不正确" });
    updatePassword(db, user.id, next);
    // 改密码后立刻踢掉其它会话：服务端可撤销，不需要等 Cookie 过期
    const revoked = revokeOtherSessions(db, user.id, request.sessionToken);
    return response.json({ ok: true, revokedSessions: revoked, mustChangePassword: false });
  });

  return router;
}
