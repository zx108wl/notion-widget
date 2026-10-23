import { hashPassword, verifyPassword } from "./password.js";

// 用户表：结构天然支持多行，但本阶段不做注册接口，
// 只有首个管理员由 .env 的 ADMIN_USERNAME / ADMIN_PASSWORD 在 users 表为空时引导创建。
// 仅供 Node 侧使用。

export function countUsers(db) {
  return Number(db.prepare("SELECT COUNT(*) AS total FROM users").get().total);
}

export function findUserByUsername(db, username) {
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username) ?? null;
}

export function createUser(db, username, password, now = new Date()) {
  const result = db
    .prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)")
    .run(username, hashPassword(password), now.toISOString());
  return Number(result.lastInsertRowid);
}

export function authenticate(db, username, password) {
  const user = findUserByUsername(db, username);
  if (!user) return null;
  if (!verifyPassword(password, user.password_hash)) return null;
  return user;
}

export function markLogin(db, userId, now = new Date()) {
  db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(now.toISOString(), userId);
}

export function updatePassword(db, userId, password) {
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(password), userId);
}

// 改账号名：会话按 user_id 关联，改名后所有已登录会话自动跟着变，无需重新登录；
// 唯一性由 users.username 的 UNIQUE 约束兜底，路由层先查一次给出友好错误。
export function updateUsername(db, userId, username) {
  db.prepare("UPDATE users SET username = ? WHERE id = ?").run(username, userId);
}

// 引导：只在 users 表为空时按 env 建库；之后只校验库内哈希，env 里改了也不会覆盖已有账号
export function ensureAdminUser(db, env = process.env, logger = console) {
  if (countUsers(db) > 0) return null;
  const username = String(env.ADMIN_USERNAME ?? "").trim();
  const password = String(env.ADMIN_PASSWORD ?? "");
  if (!username || !password) {
    logger.warn?.(
      "[auth] users 表为空且未提供 ADMIN_USERNAME/ADMIN_PASSWORD：无法登录。请在 .env 配置后重启一次",
    );
    return null;
  }
  createUser(db, username, password);
  logger.log?.(`[auth] 已按 .env 引导创建管理员 ${username}`);
  return username;
}
