import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { openDatabase } from "../server/db/schema.js";
import { readCredential, upsertCredential } from "../server/auth/credentials.js";
import { reencryptCredentials } from "../server/auth/rotate.js";

const silent = { log() {}, warn() {} } as unknown as Console;

function memoryDb() {
  const options = { file: ":memory:", logger: silent };
  return openDatabase(options);
}

describe("主密钥轮换", () => {
  it("旧密钥解不开、新密钥可正常读取，key_version 递增", () => {
    const db = memoryDb();
    try {
      const oldKey = randomBytes(32);
      const newKey = randomBytes(32);
      upsertCredential(db, { provider: "demo", slot: "default", value: "sk-a", key: oldKey });
      upsertCredential(db, { provider: "demo", slot: "clock", value: "sk-b", key: oldKey });

      const count = reencryptCredentials(db, oldKey, newKey);
      assert.equal(count, 2);

      assert.equal(readCredential(db, "demo.default", newKey), "sk-a");
      assert.equal(readCredential(db, "demo.clock", newKey, "clock"), "sk-b");
      assert.throws(() => readCredential(db, "demo.default", oldKey), /解密失败/);

      const versions = db
        .prepare("SELECT key_version FROM credentials ORDER BY slot")
        .all()
        .map((row) => Number(row.key_version));
      assert.deepEqual(versions, [2, 2]);
    } finally {
      db.close();
    }
  });

  it("旧密钥不对时在写库前失败，库内数据保持原样", () => {
    const db = memoryDb();
    try {
      const realKey = randomBytes(32);
      upsertCredential(db, { provider: "demo", slot: "default", value: "sk-a", key: realKey });

      assert.throws(
        () => reencryptCredentials(db, randomBytes(32), randomBytes(32)),
        /解密失败/,
      );
      assert.equal(readCredential(db, "demo.default", realKey), "sk-a");
    } finally {
      db.close();
    }
  });
});
