import { credentialAad, decryptSecret, encryptSecret } from "../crypto/secrets.js";

// 主密钥轮换：先全量解密验证旧密钥确实能解开所有凭据，再在一个事务里用新密钥重新加密。
// 任何一条解密失败都会在写库前抛出，不会留下新旧混存的数据。
// 仅供 Node 侧使用。

export function reencryptCredentials(db, oldKey, newKey, now = new Date()) {
  const rows = db
    .prepare("SELECT provider, slot, secret_enc, key_version FROM credentials ORDER BY provider, slot")
    .all();

  const planned = rows.map((row) => ({
    ...row,
    plaintext: decryptSecret(row.secret_enc, {
      key: oldKey,
      aad: credentialAad(row.provider, row.slot),
    }),
  }));

  const iso = now.toISOString();
  const update = db.prepare(
    `UPDATE credentials
        SET secret_enc = ?, key_version = ?, updated_at = ?
      WHERE provider = ? AND slot = ?`,
  );

  db.exec("BEGIN");
  try {
    for (const row of planned) {
      const keyVersion = Number(row.key_version) + 1;
      const secretEnc = encryptSecret(row.plaintext, {
        key: newKey,
        keyVersion,
        aad: credentialAad(row.provider, row.slot),
      });
      update.run(secretEnc, keyVersion, iso, row.provider, row.slot);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return planned.length;
}
