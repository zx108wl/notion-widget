import { clientIp } from "./session.js";
import { getSetting, setSetting } from "../db/settings.js";

// 调用监控：只在令牌校验通过后写入，目的是异常时能定位"哪个 ID、什么时候、打了什么路径"，
// 不做全量审计。call_logs 保留天数可在「调用记录」页调整（默认 7 天），usage_hourly 保留 90 天，
// 启动时与写入时按保留期裁剪。仅供 Node 侧使用。

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CALL_RETENTION_DAYS = 7;
const MIN_CALL_RETENTION_DAYS = 1;
const MAX_CALL_RETENTION_DAYS = 90;
const CALL_LOG_RETENTION_KEY = "call_log_retention_days";
const HOURLY_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

let lastPruneAt = 0;

const HOUR_MS = 60 * 60 * 1000;

// 保留天数：用户可在管理页调整，缺失或非法值回落默认值
export function callLogRetentionDays(db) {
  const stored = getSetting(db, CALL_LOG_RETENTION_KEY);
  // 注意 Number(null) === 0：未设置时必须先判空，否则会被夹到下限 1 天
  if (stored === null || stored === "") return DEFAULT_CALL_RETENTION_DAYS;
  const raw = Number(stored);
  if (!Number.isFinite(raw)) return DEFAULT_CALL_RETENTION_DAYS;
  return Math.min(Math.max(Math.floor(raw), MIN_CALL_RETENTION_DAYS), MAX_CALL_RETENTION_DAYS);
}

export function saveCallLogRetentionDays(db, days) {
  const value = Number(days);
  if (!Number.isFinite(value)) throw new Error("保留天数必须是数字");
  const normalized = Math.min(Math.max(Math.floor(value), MIN_CALL_RETENTION_DAYS), MAX_CALL_RETENTION_DAYS);
  setSetting(db, CALL_LOG_RETENTION_KEY, String(normalized));
  return normalized;
}

export { MAX_CALL_RETENTION_DAYS, MIN_CALL_RETENTION_DAYS };

export function recordCall(db, { tokenId, method, path, status, durationMs, ip }, now = Date.now()) {
  db.prepare(
    "INSERT INTO call_logs (token_id, ts, method, path, status, duration_ms, ip) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(tokenId, now, String(method).toUpperCase(), String(path), Number(status), Number(durationMs), ip ?? null);

  db.prepare(
    `INSERT INTO usage_hourly (token_id, bucket, calls, errors) VALUES (?, ?, 1, ?)
     ON CONFLICT (token_id, bucket) DO UPDATE SET calls = calls + 1, errors = errors + excluded.errors`,
  ).run(tokenId, Math.floor(now / HOUR_MS) * HOUR_MS, Number(status) >= 400 ? 1 : 0);

  if (now - lastPruneAt > PRUNE_INTERVAL_MS) pruneUsage(db, now);
}

export function pruneUsage(db, now = Date.now()) {
  lastPruneAt = now;
  db.prepare("DELETE FROM call_logs WHERE ts < ?").run(now - callLogRetentionDays(db) * DAY_MS);
  db.prepare("DELETE FROM usage_hourly WHERE bucket < ?").run(now - HOURLY_RETENTION_MS);
}

// 手动清理调用明细：olderThanDays 省略时清空全部；按小时汇总不在此处删除
export function clearCallLogs(db, { olderThanDays } = {}, now = Date.now()) {
  if (olderThanDays === undefined || olderThanDays === null) {
    return Number(db.prepare("DELETE FROM call_logs").run().changes);
  }
  const days = Math.max(Number(olderThanDays) || 0, 0);
  return Number(db.prepare("DELETE FROM call_logs WHERE ts < ?").run(now - days * DAY_MS).changes);
}

export function callLogStats(db) {
  const row = db
    .prepare("SELECT COUNT(*) AS total, MIN(ts) AS oldest, MAX(ts) AS newest FROM call_logs")
    .get();
  return {
    total: Number(row.total),
    oldest: row.oldest ?? null,
    newest: row.newest ?? null,
    retentionDays: callLogRetentionDays(db),
  };
}

// 调用记录列表：可选按令牌过滤，按时间倒序，默认近 7 天、最多 200 条
export function listCallLogs(db, { tokenId, days = 7, limit = 200 } = {}, now = Date.now()) {
  const since = now - Math.min(Math.max(Number(days) || 7, 1), 90) * 24 * 60 * 60 * 1000;
  const cap = Math.min(Math.max(Number(limit) || 200, 1), 500);
  const rows = tokenId
    ? db
        .prepare(
          `SELECT ts, method, path, status, duration_ms AS durationMs, ip, token_id AS tokenId
             FROM call_logs WHERE token_id = ? AND ts >= ? ORDER BY ts DESC LIMIT ?`,
        )
        .all(tokenId, since, cap)
    : db
        .prepare(
          `SELECT ts, method, path, status, duration_ms AS durationMs, ip, token_id AS tokenId
             FROM call_logs WHERE ts >= ? ORDER BY ts DESC LIMIT ?`,
        )
        .all(since, cap);
  return rows;
}

// 单个令牌的调用分布：按来源 IP 聚合（调用次数 + 最近调用），并合并已禁用但近 7 天没调用的 IP
export function tokenRequestStats(db, tokenId, { days = 7 } = {}, now = Date.now()) {
  const since = now - Math.min(Math.max(Number(days) || 7, 1), 90) * 24 * 60 * 60 * 1000;
  const rows = db
    .prepare(
      `SELECT ip, COUNT(*) AS calls, MAX(ts) AS lastAt
         FROM call_logs WHERE token_id = ? AND ts >= ?
        GROUP BY ip ORDER BY calls DESC, lastAt DESC`,
    )
    .all(tokenId, since);
  const blocked = new Set(
    db.prepare("SELECT ip FROM token_ip_blocks WHERE token_id = ?").all(tokenId).map((row) => row.ip),
  );
  const seen = new Set(rows.map((row) => row.ip));
  const idle = [...blocked].filter((ip) => !seen.has(ip)).map((ip) => ({ ip, calls: 0, lastAt: null }));
  return [...rows, ...idle].map((row) => ({ ...row, blocked: blocked.has(row.ip) }));
}

export function callLoggerOf(db) {
  return (request, response, tokenId) => {
    const startedAt = Date.now();
    response.on("finish", () => {
      try {
        recordCall(db, {
          tokenId,
          method: request.method,
          path: request.path,
          status: response.statusCode,
          durationMs: Date.now() - startedAt,
          ip: clientIp(request),
        });
      } catch (error) {
        // 监控写入失败不能影响接口本身
        console.error("[usage] 调用记录写入失败:", error instanceof Error ? error.message : error);
      }
    });
  };
}
