import { credentialAad, decryptSecret, encryptSecret } from "../crypto/secrets.js";

// 第三方密钥的托管：泛化的 provider + slot 结构，
// 后续新增第三方 = INSERT 一行，轮换 = 同键 UPSERT，删除 = DELETE 一行。
// 任何对外输出都不含明文。仅供 Node 侧使用。

export const CREDENTIAL_REF_RE = /^[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/;

export function isCredentialRef(ref) {
  return CREDENTIAL_REF_RE.test(String(ref ?? ""));
}

export function parseCredentialRef(ref) {
  if (!isCredentialRef(ref)) return null;
  const [provider, slot] = String(ref).split(".");
  return { provider, slot };
}

export function listCredentials(db) {
  return db
    .prepare(
      "SELECT provider, slot, key_version, created_at, updated_at FROM credentials ORDER BY provider, slot",
    )
    .all();
}

export function hasCredential(db, provider, slot) {
  return Boolean(
    db.prepare("SELECT 1 AS ok FROM credentials WHERE provider = ? AND slot = ?").get(provider, slot),
  );
}

export function upsertCredential(db, { provider, slot, value, key, keyVersion = 1 }, now = new Date()) {
  const iso = now.toISOString();
  const secretEnc = encryptSecret(value, { key, keyVersion, aad: credentialAad(provider, slot) });
  const existed = hasCredential(db, provider, slot);
  db.prepare(
    `INSERT INTO credentials (provider, slot, secret_enc, key_version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (provider, slot) DO UPDATE SET
       secret_enc = excluded.secret_enc,
       key_version = excluded.key_version,
       updated_at = excluded.updated_at`,
  ).run(provider, slot, secretEnc, keyVersion, iso, iso);
  return { provider, slot, keyVersion, created: !existed, updatedAt: iso };
}

export function deleteCredential(db, provider, slot) {
  const result = db.prepare("DELETE FROM credentials WHERE provider = ? AND slot = ?").run(provider, slot);
  return Number(result.changes) > 0;
}

// 惰性 + 按需解密：只有被插件 server.credentials 声明过的 ref 才会走到这里，
// 且明文只在本次请求内短暂存在，不缓存、不回显。
// widgetId 提供时按「专属优先，default 兜底」解析：先试 provider.<widgetId>，
// 没有则回落 provider.default（slot 语义：default=通用，插件名=该插件专属）。
/**
 * @param {ReturnType<import("../db/schema.js").openDatabase>} db
 * @param {string} ref
 * @param {Buffer} key
 * @param {string | null} [widgetId]
 */
export function readCredential(db, ref, key, widgetId = null) {
  const parsed = parseCredentialRef(ref);
  if (!parsed) throw new Error(`凭据引用不合法: ${ref}`);

  const select = db.prepare("SELECT secret_enc FROM credentials WHERE provider = ? AND slot = ?");
  // 专属 slot 优先（仅当 widgetId 合法且与 slot 不同时尝试，避免重复查询）
  if (widgetId && widgetId !== parsed.slot && /^[A-Za-z0-9_]{1,64}$/.test(widgetId)) {
    const own = select.get(parsed.provider, widgetId);
    if (own) return decryptSecret(own.secret_enc, { key, aad: credentialAad(parsed.provider, widgetId) });
  }
  const row = select.get(parsed.provider, parsed.slot);
  if (!row) {
    throw new Error(widgetId ? `未配置凭据: ${parsed.provider}（${widgetId} 或 ${parsed.slot}）` : `未配置凭据: ${ref}`);
  }
  return decryptSecret(row.secret_enc, { key, aad: credentialAad(parsed.provider, parsed.slot) });
}
