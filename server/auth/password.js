import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// 管理员口令哈希：node:crypto 的 scrypt，格式 `scrypt$N$r$p$salt$hash`（salt/hash 为 base64）。
// 不引入 bcrypt/argon2 等需要 native 编译的依赖。仅供 Node 侧使用。

const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;
const SALT_BYTES = 16;

export function hashPassword(password) {
  const salt = randomBytes(SALT_BYTES);
  const hash = scryptSync(String(password), salt, KEY_LENGTH, { N, r: R, p: P });
  return ["scrypt", N, R, P, salt.toString("base64"), hash.toString("base64")].join("$");
}

export function verifyPassword(password, stored) {
  const parts = String(stored ?? "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  let actual;
  try {
    actual = scryptSync(String(password), salt, expected.length || KEY_LENGTH, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
