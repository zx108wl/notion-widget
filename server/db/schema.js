import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// 存储：单文件 node:sqlite（零新依赖；node:sqlite 自 v22.13 起无需 --experimental-sqlite 标志）。
// 迁移用 `PRAGMA user_version` 幂等推进，不引入迁移框架：新增一个 schema 版本就往 MIGRATIONS 追加一段，
// 已推进过的版本在下次启动不会重复执行（幂等）。
// 仅供 Node 侧使用。

export const SCHEMA_VERSION = 7;

// 全表 STRICT：列类型必须是 INT/INTEGER/REAL/TEXT/BLOB/ANY，写入类型不符直接报错而不是静默强转
const MIGRATIONS = [
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_login_at TEXT
      ) STRICT;

      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

      -- provider + slot 泛化结构：新增第三方密钥 = INSERT 一行，轮换 = 同键 UPSERT，
      -- 删除 = DELETE 一行，全程零 ALTER TABLE、零代码改动
      CREATE TABLE IF NOT EXISTS credentials (
        id INTEGER PRIMARY KEY,
        provider TEXT NOT NULL,
        slot TEXT NOT NULL,
        secret_enc TEXT NOT NULL,
        key_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (provider, slot)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_credentials_provider ON credentials(provider);

      -- 嵌入令牌：id 可公开（用于监控与日志关联），secret 只存 SHA-256
      CREATE TABLE IF NOT EXISTS embed_tokens (
        id TEXT PRIMARY KEY,
        widget_id TEXT NOT NULL,
        label TEXT,
        secret_hash TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        revoked_at TEXT,
        last_used_at TEXT,
        use_count INTEGER NOT NULL DEFAULT 0,
        revoked_reason TEXT
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_embed_tokens_widget ON embed_tokens(widget_id);

      -- 只在令牌校验通过后写入；保留期由 usage 模块按行裁剪
      CREATE TABLE IF NOT EXISTS call_logs (
        id INTEGER PRIMARY KEY,
        token_id TEXT NOT NULL,
        ts INTEGER NOT NULL,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        status INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL,
        ip TEXT
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_call_logs_token_ts ON call_logs(token_id, ts);

      CREATE TABLE IF NOT EXISTS usage_hourly (
        token_id TEXT NOT NULL,
        bucket INTEGER NOT NULL,
        calls INTEGER NOT NULL DEFAULT 0,
        errors INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (token_id, bucket)
      ) STRICT;
    `);
  },
  (db) => {
    // 令牌可绑定的第三方密钥：签发时选定，运行时 context.credential(ref) 只放行已绑定的 ref。
    // 令牌注销时 ON DELETE CASCADE 自动清理绑定关系。
    db.exec(`
      CREATE TABLE IF NOT EXISTS token_credentials (
        token_id TEXT NOT NULL REFERENCES embed_tokens(id) ON DELETE CASCADE,
        ref TEXT NOT NULL,
        PRIMARY KEY (token_id, ref)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_token_credentials_token ON token_credentials(token_id);
    `);
  },
  (db) => {
    // 令牌明文加密副本：工作台需要复用已创建的令牌生成嵌入 URL。
    // 校验仍然以 secret_hash 为准；注销时清空密文，旧令牌（本次迁移前签发）没有密文、不可回显。
    db.exec(`
      ALTER TABLE embed_tokens ADD COLUMN secret_enc TEXT;
      ALTER TABLE embed_tokens ADD COLUMN key_version INTEGER;
    `);
  },
  (db) => {
    // v4 回退：令牌明文不再落库（仅保留 secret_hash 校验），完整嵌入链接只在签发时生成并复制。
    // 列保留以兼容迁移历史，但清空历史密文，保证库里不存在任何可解密的令牌副本。
    db.exec(`UPDATE embed_tokens SET secret_enc = NULL, key_version = NULL;`);
  },
  (db) => {
    // v5 令牌级 IP 黑名单：只拦该令牌从这个 IP 的调用，删除令牌时级联清理
    db.exec(`
      CREATE TABLE IF NOT EXISTS token_ip_blocks (
        token_id TEXT NOT NULL REFERENCES embed_tokens(id) ON DELETE CASCADE,
        ip TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (token_id, ip)
      ) STRICT;
    `);
  },
  (db) => {
    // v6 运行时设置：目前只有调用记录保留天数（key/value 泛化结构，后续新设置零 ALTER TABLE）
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT;
    `);
  },
  (db) => {
    // v7 清理 v3 遗留列：令牌明文副本在 v4 已全部清空且不再写入，
    // 留着空列容易让人误以为库里还有可解密的令牌，直接删掉
    db.exec(`
      ALTER TABLE embed_tokens DROP COLUMN secret_enc;
      ALTER TABLE embed_tokens DROP COLUMN key_version;
    `);
  },
];

export function openDatabase({ file, logger = console } = {}) {
  const target = file || ":memory:";
  if (target !== ":memory:") mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
  const db = new DatabaseSync(target);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  migrate(db, logger);
  return db;
}

export function migrate(db, logger = console) {
  const { user_version: current } = db.prepare("PRAGMA user_version").get();
  if (current >= SCHEMA_VERSION) return SCHEMA_VERSION;
  for (let version = current; version < SCHEMA_VERSION; version += 1) {
    db.exec("BEGIN");
    try {
      MIGRATIONS[version](db);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec("COMMIT");
      logger.log?.(`[db] 已迁移到 schema v${version + 1}`);
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  return SCHEMA_VERSION;
}
