// 运行时设置：key/value 单表，值统一按字符串存（与字段值协议一致）。
// 用于需要用户在工作台调整、且必须跨重启保留的参数（如调用记录保留天数）。
// 仅供 Node 侧使用。

export function getSetting(db, key) {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
  return row ? row.value : null;
}

export function setSetting(db, key, value) {
  db.prepare(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
  ).run(key, String(value));
}
