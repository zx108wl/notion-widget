import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ensureMasterKey } from "../server/crypto/key-store.js";

const silent = { log() {}, warn() {} } as unknown as Console;

async function tempKeyPath() {
  const dir = await mkdtemp(path.join(tmpdir(), "widget-key-"));
  return { dir, file: path.join(dir, "master.key") };
}

describe("主密钥自动生成", () => {
  it("首次生成写入文件，后续启动复用同一把密钥", async () => {
    const { dir, file } = await tempKeyPath();
    try {
      const env = { WIDGET_KEY_PATH: file };
      const first = await ensureMasterKey({ env, logger: silent });
      assert.equal(first.source, "file");
      assert.equal(first.generated, true);
      assert.equal(first.key.length, 32);

      const persisted = await readFile(file, "utf8");
      assert.equal(Buffer.from(persisted.trim(), "base64").length, 32);

      const second = await ensureMasterKey({ env, logger: silent });
      assert.equal(second.generated, false);
      assert.deepEqual(second.key, first.key);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("环境变量 WIDGET_DB_KEY 优先于密钥文件", async () => {
    const { dir, file } = await tempKeyPath();
    try {
      const envValue = Buffer.from("x".repeat(32)).toString("base64");
      const result = await ensureMasterKey({
        env: { WIDGET_KEY_PATH: file, WIDGET_DB_KEY: envValue },
        logger: silent,
      });
      assert.equal(result.source, "env");
      assert.deepEqual(result.key, Buffer.from(envValue, "base64"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("generate=false 时缺密钥直接报错，不会悄悄换一把新钥匙", async () => {
    const { dir, file } = await tempKeyPath();
    try {
      await assert.rejects(
        () => ensureMasterKey({ env: { WIDGET_KEY_PATH: file }, logger: silent, generate: false }),
        /缺少主密钥/,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
