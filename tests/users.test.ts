import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase } from "../server/db/schema.js";
import { createSession, resolveSession } from "../server/auth/session.js";
import {
  authenticate,
  createUser,
  ensureAdminUser,
  findUserByUsername,
  updatePassword,
  updateUsername,
} from "../server/auth/users.js";

const silent = { log() {}, warn() {} } as unknown as Console;

type Db = ReturnType<typeof openDatabase>;

function memoryDb(): Db {
  // 传变量而非字面量：JS 侧推断的选项类型保真度有限，避免多余属性检查
  const options = { file: ":memory:", logger: silent };
  return openDatabase(options);
}

describe("首次部署管理员引导", () => {
  it("默认账号 admin，自动生成密码写入密钥卷并强制首次改密", async () => {
    const db = memoryDb();
    const dir = await mkdtemp(path.join(tmpdir(), "widget-admin-"));
    try {
      const env = { WIDGET_KEY_PATH: path.join(dir, "master.key") };
      assert.equal(ensureAdminUser(db, env, silent), "admin");

      const user = findUserByUsername(db, "admin");
      assert.ok(user);
      assert.equal(Number(user.must_change_password), 1);

      const lines = (await readFile(path.join(dir, "initial-admin-password"), "utf8")).trim().split("\n");
      assert.equal(lines[0], "admin");
      assert.ok(lines[1].length >= 16);
      assert.equal(authenticate(db, "admin", lines[1])?.id, user.id);

      // 已有用户后再次启动不会覆盖密码
      assert.equal(ensureAdminUser(db, env, silent), null);

      updatePassword(db, user.id, "changed-password");
      assert.equal(Number(findUserByUsername(db, "admin").must_change_password), 0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("显式配置 ADMIN_PASSWORD 时不强制改密", () => {
    const db = memoryDb();
    ensureAdminUser(db, { ADMIN_USERNAME: "boss", ADMIN_PASSWORD: "password123", WIDGET_KEY_PATH: ":memory:" }, silent);
    const user = findUserByUsername(db, "boss");
    assert.ok(user);
    assert.equal(Number(user.must_change_password), 0);
    assert.equal(authenticate(db, "boss", "password123")?.id, user.id);
  });
});

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
