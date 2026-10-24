import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { masterKeyPath } from "../crypto/key-store.js";
import { hashPassword, verifyPassword } from "./password.js";

// 用户表：结构天然支持多行，但本阶段不做注册接口。
// 首个管理员在 users 表为空时创建：用户名默认 admin；
// ADMIN_PASSWORD 未配置时自动生成随机密码，并标记首次登录必须改密。
// 仅供 Node 侧使用。

const DEFAULT_ADMIN_USERNAME = "admin";
const INITIAL_PASSWORD_FILE = "initial-admin-password";
const INITIAL_PASSWORD_BYTES = 15;

export function generateInitialPassword() {
  return randomBytes(INITIAL_PASSWORD_BYTES).toString("base64url");
}

export function countUsers(db) {
  return Number(db.prepare("SELECT COUNT(*) AS total FROM users").get().total);
}

export function findUserByUsername(db, username) {
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username) ?? null;
}

export function createUser(
  db,
  username,
  password,
  { mustChangePassword = false, now = new Date() } = {},
) {
  const result = db
    .prepare(
      "INSERT INTO users (username, password_hash, created_at, must_change_password) VALUES (?, ?, ?, ?)",
    )
    .run(username, hashPassword(password), now.toISOString(), mustChangePassword ? 1 : 0);
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

export function updatePassword(db, userId, password, { mustChangePassword = false } = {}) {
  db.prepare(
    "UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?",
  ).run(hashPassword(password), mustChangePassword ? 1 : 0, userId);
}

// 改账号名：会话按 user_id 关联，改名后所有已登录会话自动跟着变，无需重新登录；
// 唯一性由 users.username 的 UNIQUE 约束兜底，路由层先查一次给出友好错误。
export function updateUsername(db, userId, username) {
  db.prepare("UPDATE users SET username = ? WHERE id = ?").run(username, userId);
}

// 引导：只在 users 表为空时创建首个管理员；之后只校验库内哈希，env 里改了也不会覆盖已有账号。
// 未配置 ADMIN_PASSWORD 时自动生成，并把明文写入密钥卷内的一次性文件（0600），
// 同时标记 must_change_password，登录后必须先改密才能使用其它接口。
export function ensureAdminUser(db, env = process.env, logger = console) {
  if (countUsers(db) > 0) return null;
  const username = String(env.ADMIN_USERNAME ?? "").trim() || DEFAULT_ADMIN_USERNAME;
  const configured = String(env.ADMIN_PASSWORD ?? "");
  const generated = !configured;
  const password = configured || generateInitialPassword();

  createUser(db, username, password, { mustChangePassword: generated });
  if (!generated) {
    logger.log?.(`[auth] 已按 .env 引导创建管理员 ${username}`);
    return username;
  }

  const file = path.join(path.dirname(masterKeyPath(env)), INITIAL_PASSWORD_FILE);
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${username}\n${password}\n`, { mode: 0o600 });
    chmodSync(file, 0o600);
  } catch (error) {
    logger.warn?.(`[auth] 初始密码文件写入失败（${file}）：${error.message}`);
  }
  logger.warn?.(
    `[auth] 已自动创建管理员 ${username}，初始密码：${password}\n` +
      `[auth] 明文同时写入 ${file}；首次登录必须修改密码，改完后请删除该文件`,
  );
  return username;
}
