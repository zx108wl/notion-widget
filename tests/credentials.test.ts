import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { migrate, openDatabase, SCHEMA_VERSION } from "../server/db/schema.js";
import {
  credentialAad,
  decryptSecret as decryptSecretRaw,
  encryptSecret as encryptSecretRaw,
  readMasterKey,
} from "../server/crypto/secrets.js";
import { listCredentials, readCredential, upsertCredential } from "../server/auth/credentials.js";
import { createPluginContextFactory } from "../server/plugin-auth.js";

const silent = { log() {}, warn() {} } as unknown as Console;

type Db = ReturnType<typeof openDatabase>;

// 服务端模块是纯 JS，TS 对"带默认值的解构参数"推断出的选项类型会丢掉无默认值的字段，
// 故显式包一层签名；同时传变量而非字面量，避开对象字面量的多余属性检查
type SecretOptions = { key: Buffer; keyVersion?: number; aad?: string };
const encryptSecret = (plaintext: string, options: SecretOptions) => encryptSecretRaw(plaintext, options);
const decryptSecret = (payload: string, options: SecretOptions) => decryptSecretRaw(payload, options);

// 服务端模块是纯 JS：db.prepare().get() 在 TS 侧返回 SQLOutputValue 联合类型，
// 测试里统一用它取单行并按列断言，避免逐处类型断言的噪音
function one(db: Db, sql: string, ...params: string[]): Record<string, any> {
  return db.prepare(sql).get(...params) as unknown as Record<string, any>;
}

function memoryDb(): Db {
  const options = { file: ":memory:", logger: silent };
  return openDatabase(options);
}

describe("第三方密钥：AES-256-GCM 托管", () => {
  it("往返解密成功，且密文里不含明文", () => {
    const key = randomBytes(32);
    const aad = credentialAad("weatherApi", "default");
    const payload = encryptSecret("sk-live-abcdef", { key, aad });

    assert.match(payload, /^v1\.1\./);
    assert.equal(decryptSecret(payload, { key, aad }), "sk-live-abcdef");
    assert.ok(!payload.includes("sk-live-abcdef"));

    const db = memoryDb();
    upsertCredential(db, { provider: "weatherApi", slot: "default", value: "sk-live-abcdef", key });
    const stored = one(db, "SELECT secret_enc, key_version FROM credentials");
    assert.ok(!String(stored.secret_enc).includes("sk-live-abcdef"));
    assert.equal(stored.key_version, 1);
    assert.equal(readCredential(db, "weatherApi.default", key), "sk-live-abcdef");
  });

  it("AAD 绑定行：换位到别的 provider/slot 必须解密失败", () => {
    const key = randomBytes(32);
    const payload = encryptSecret("sk-live-abcdef", { key, aad: credentialAad("weatherApi", "default") });

    assert.throws(() => decryptSecret(payload, { key, aad: credentialAad("weatherApi", "backup") }), /解密失败/);
    assert.throws(() => decryptSecret(payload, { key, aad: credentialAad("openai", "default") }), /解密失败/);
    assert.throws(() => decryptSecret(payload, { key, aad: "" }), /解密失败/);
    // 换主密钥同样失败：主密钥丢了就没有任何补救路径
    assert.throws(
      () => decryptSecret(payload, { key: randomBytes(32), aad: credentialAad("weatherApi", "default") }),
      /解密失败/,
    );
    assert.throws(() => decryptSecret("v2.1.a.b.c", { key, aad: "" }), /密文格式无法识别/);

    // 库里真实行被换用：把 A 行的密文写进 B 行，读取时必须失败
    const db = memoryDb();
    upsertCredential(db, { provider: "a", slot: "one", value: "value-a", key });
    const movedCipher = one(db, "SELECT secret_enc FROM credentials WHERE provider = 'a'").secret_enc;
    db.prepare("INSERT INTO credentials (provider, slot, secret_enc, key_version, created_at, updated_at) VALUES ('b', 'two', ?, 1, '', '')").run(
      movedCipher,
    );
    assert.throws(() => readCredential(db, "b.two", key), /解密失败/);
  });

  it("主密钥缺失或长度不对一律失败（不做明文降级）", () => {
    assert.throws(() => readMasterKey({}), /WIDGET_DB_KEY/);
    assert.throws(() => readMasterKey({ WIDGET_DB_KEY: "   " }), /WIDGET_DB_KEY/);
    assert.throws(() => readMasterKey({ WIDGET_DB_KEY: randomBytes(16).toString("base64") }), /32 字节/);
    assert.equal(readMasterKey({ WIDGET_DB_KEY: randomBytes(32).toString("base64") }).length, 32);
  });

  it("UPSERT 即轮换，且插件只能读到已声明的凭据", () => {
    const db = memoryDb();
    const key = randomBytes(32);

    upsertCredential(db, { provider: "weatherApi", slot: "default", value: "first", key });
    upsertCredential(db, { provider: "weatherApi", slot: "default", value: "second", key });
    assert.equal(listCredentials(db).length, 1);
    assert.equal(readCredential(db, "weatherApi.default", key), "second");

    const createContext = createPluginContextFactory({ db, key, logCall: () => {} });
    const entry = { credentials: ["weatherApi.default"] };
    const context = createContext(entry, {}, {}, {});
    assert.equal(context.credential("weatherApi.default"), "second");
    // 未声明的 provider 读不到（与路由白名单同一套"不声明即不存在"思路）
    assert.throws(() => context.credential("openai.default"), /未声明该凭据/);
    assert.throws(() => readCredential(db, "openai.default", key), /未配置凭据/);
  });

  it("迁移幂等：连跑两次不重复推进版本，已有数据不丢", () => {
    const db = memoryDb();
    assert.equal(migrate(db, silent), SCHEMA_VERSION);
    assert.equal(one(db, "PRAGMA user_version").user_version, SCHEMA_VERSION);

    upsertCredential(db, { provider: "weatherApi", slot: "default", value: "kept", key: randomBytes(32) });
    assert.equal(migrate(db, silent), SCHEMA_VERSION);
    assert.equal(one(db, "PRAGMA user_version").user_version, SCHEMA_VERSION);
    assert.equal(listCredentials(db).length, 1);
    assert.equal(one(db, "SELECT COUNT(*) AS total FROM users").total, 0);
  });

  it("专属优先 default 兜底：widgetId 命中专属则用专属，否则回落 default", () => {
    const db = memoryDb();
    const key = randomBytes(32);

    // 只配 default：两个插件都读到 default 的值
    upsertCredential(db, { provider: "weatherApi", slot: "default", value: "sk-shared", key });
    assert.equal(readCredential(db, "weatherApi.default", key, "clock"), "sk-shared");
    assert.equal(readCredential(db, "weatherApi.default", key, "status"), "sk-shared");
    // 不带 widgetId（向后兼容）：直接读声明的 slot
    assert.equal(readCredential(db, "weatherApi.default", key), "sk-shared");

    // 再给 clock 配专属：clock 读到专属值，status 仍回落 default
    upsertCredential(db, { provider: "weatherApi", slot: "clock", value: "sk-clock-only", key });
    assert.equal(readCredential(db, "weatherApi.default", key, "clock"), "sk-clock-only");
    assert.equal(readCredential(db, "weatherApi.default", key, "status"), "sk-shared");

    // 只有专属没有 default：别的插件读不到
    upsertCredential(db, { provider: "openai", slot: "clock", value: "sk-openai-clock", key });
    assert.equal(readCredential(db, "openai.default", key, "clock"), "sk-openai-clock");
    assert.throws(() => readCredential(db, "openai.default", key, "status"), /未配置凭据/);
    assert.throws(() => readCredential(db, "openai.default", key), /未配置凭据/);

    // 通过上下文工厂验证插件路径：entry.widgetId 注入生效
    const createContext = createPluginContextFactory({ db, key, logCall: () => {} });
    const clockEntry = { widgetId: "clock", credentials: ["weatherApi.default"] };
    const statusEntry = { widgetId: "status", credentials: ["weatherApi.default"] };
    assert.equal(
      createContext(clockEntry, {}, {}, {}).credential("weatherApi.default"),
      "sk-clock-only",
    );
    assert.equal(
      createContext(statusEntry, {}, {}, {}).credential("weatherApi.default"),
      "sk-shared",
    );
  });
});
