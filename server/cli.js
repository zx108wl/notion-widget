import "dotenv/config";
import { randomBytes } from "node:crypto";
import { openDatabase } from "./db/schema.js";
import { findUserByUsername, generateInitialPassword, updatePassword } from "./auth/users.js";
import { revokeAllSessions } from "./auth/session.js";
import { reencryptCredentials } from "./auth/rotate.js";
import { ensureMasterKey, writeKeyFile } from "./crypto/key-store.js";

// 运维命令行：在 api 容器内执行，复用与运行时完全相同的库与密钥路径。
//   docker compose exec api node server/cli.js rotate-key
//   docker compose exec api node server/cli.js set-password [--user admin] [--password 新密码]
// 仅供 Node 侧使用。

const DB_PATH = process.env.WIDGET_DB_PATH || "/data/widget.db";

function option(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const exact = process.argv.indexOf(`--${name}`);
  if (exact >= 0) return process.argv[exact + 1];
  const inline = process.argv.find((value) => value.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : fallback;
}

function usage() {
  console.log(`用法：
  node server/cli.js rotate-key
      生成新的主密钥并重新加密库内全部第三方密钥；
      密钥来自文件时自动替换文件，来自环境变量时打印新值供更新 .env。
      执行后必须重启 api 容器。

  node server/cli.js set-password [--user 账号名] [--password 新密码]
      不带 --password 时自动生成强随机密码并打印一次；
      成功后该账号所有会话立即失效。`);
}

async function rotateKey() {
  const { key: oldKey, source, path: keyFile } = await ensureMasterKey({ generate: false });
  const newKey = randomBytes(32);
  const newKeyBase64 = newKey.toString("base64");

  // 先打印再写库：即使后续写文件失败，也能靠这行输出恢复
  console.log(`[cli] 新主密钥（请立即备份）：${newKeyBase64}`);

  const db = openDatabase({ file: DB_PATH });
  try {
    const count = reencryptCredentials(db, oldKey, newKey);
    console.log(`[cli] 已用新主密钥重新加密 ${count} 条第三方密钥`);
  } finally {
    db.close();
  }

  if (source === "env") {
    console.log(
      `[cli] 当前主密钥来自环境变量：请把 .env 的 WIDGET_DB_KEY 改为上面的新值，然后重启 api`,
    );
  } else {
    await writeKeyFile(keyFile, newKeyBase64);
    console.log(`[cli] 已更新密钥文件 ${keyFile}，请重启 api：docker compose restart api`);
  }
}

function setPassword() {
  const username = String(option("user", "admin"));
  const provided = option("password");
  const password = provided || generateInitialPassword();

  const db = openDatabase({ file: DB_PATH });
  try {
    const user = findUserByUsername(db, username);
    if (!user) throw new Error(`账号不存在：${username}`);
    updatePassword(db, user.id, password);
    const revoked = revokeAllSessions(db, user.id);
    console.log(`[cli] 已重置账号 ${username} 的密码（已退出 ${revoked} 个登录）`);
    if (!provided) console.log(`[cli] 新密码（只显示这一次）：${password}`);
  } finally {
    db.close();
  }
}

try {
  const command = process.argv[2];
  if (command === "rotate-key") await rotateKey();
  else if (command === "set-password") setPassword();
  else {
    usage();
    process.exitCode = command ? 1 : 0;
  }
} catch (error) {
  console.error(`[cli] ${error.message}`);
  process.exitCode = 1;
}
