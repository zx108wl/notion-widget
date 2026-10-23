import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { openDatabase } from "../server/db/schema.js";
import { createSession, resolveSession } from "../server/auth/session.js";
import {
  authenticate,
  createUser,
  findUserByUsername,
  updateUsername,
} from "../server/auth/users.js";

const silent = { log() {}, warn() {} } as unknown as Console;

type Db = ReturnType<typeof openDatabase>;

function memoryDb(): Db {
  // 传变量而非字面量：JS 侧推断的选项类型保真度有限，避免多余属性检查
  const options = { file: ":memory:", logger: silent };
  return openDatabase(options);
}

describe("账号名修改", () => {
  it("改名后已登录会话直接读到新账号名，旧名不能再登录", () => {
    const db = memoryDb();
    const userId = createUser(db, "admin", "password123");
    const { token } = createSession(db, userId);

    updateUsername(db, userId, "新账号");

    assert.equal(authenticate(db, "新账号", "password123")?.id, userId);
    assert.equal(authenticate(db, "admin", "password123"), null);
    // 会话按 user_id 关联：令牌不变，读出来的用户名跟着更新
    assert.equal(resolveSession(db, token)?.username, "新账号");
  });

  it("账号名唯一：改成已存在的名字会被唯一约束拒绝", () => {
    const db = memoryDb();
    const adminId = createUser(db, "admin", "password123");
    createUser(db, "second", "password123");

    assert.throws(() => updateUsername(db, adminId, "second"), /UNIQUE/i);
    assert.equal(findUserByUsername(db, "admin")?.id, adminId);
  });
});
