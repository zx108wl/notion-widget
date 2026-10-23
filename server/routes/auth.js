import { Router } from "express";
import { authenticate, markLogin, updatePassword } from "../auth/users.js";
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

function createLoginLimiter() {
  const attempts = new Map();
  const entryOf = (ip, now) => {
    const entry = attempts.get(ip);
    return entry && entry.resetAt > now ? entry : null;
  };
  return {
    allow(ip, now = Date.now()) {
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
  const limiter = createLoginLimiter();
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
    return response.json({ user: { username: user.username }, expiresAt });
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
    return response.json({ user: { username: request.session.username } });
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
    return response.json({ ok: true, revokedSessions: revoked });
  });

  return router;
}
