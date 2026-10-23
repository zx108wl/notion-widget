import { Router } from "express";
import { createSessionGuard } from "../auth/session.js";
import {
  deleteCredential,
  listCredentials,
  parseCredentialRef,
  upsertCredential,
} from "../auth/credentials.js";
import {
  blockTokenIp,
  deleteToken,
  embedUrl,
  issueToken,
  listTokens,
  requestOrigin,
  TOKEN_ID_RE,
  unblockTokenIp,
} from "../auth/tokens.js";
import {
  callLogRetentionDays,
  callLogStats,
  clearCallLogs,
  listCallLogs,
  MAX_CALL_RETENTION_DAYS,
  MIN_CALL_RETENTION_DAYS,
  pruneUsage,
  saveCallLogRetentionDays,
  tokenRequestStats,
} from "../auth/usage.js";

// /api/admin/*：凭据托管与令牌管理，全部要求有效管理员会话。属核心保留前缀，插件不得声明。
// 仅供 Node 侧使用。

const NAME_RE = /^[A-Za-z0-9_]{1,64}$/;
// 来源 IP 形如 127.0.0.1 / ::1 / ::ffff:127.0.0.1（反向代理透传 x-forwarded-for）
const IP_RE = /^[A-Za-z0-9:._-]{2,64}$/;

export function createAdminRouter({
  db,
  key,
  declaredCredentials,
  widgetCredentialRequirements = new Map(),
  widgetAuth = new Map(),
}) {
  const router = Router();
  router.use(createSessionGuard(db));

  // declaredCredentials 是 ref → Set<widgetId>，这里反向构建 widgetId → Set<ref>
  const widgetDeclared = new Map();
  for (const [ref, widgetIds] of declaredCredentials) {
    for (const widgetId of widgetIds) {
      if (!widgetDeclared.has(widgetId)) widgetDeclared.set(widgetId, new Set());
      widgetDeclared.get(widgetId).add(ref);
    }
  }

  // ===== 第三方密钥 =====

  router.get("/credentials", (_request, response) => {
    response.set("Cache-Control", "no-store");
    return response.json({ credentials: listCredentials(db) });
  });

  router.put("/credentials", (request, response) => {
    const provider = String(request.body?.provider ?? "").trim();
    const slot = String(request.body?.slot ?? "").trim();
    const value = String(request.body?.value ?? "");
    if (!NAME_RE.test(provider) || !NAME_RE.test(slot)) {
      return response.status(400).json({ error: "provider 与 slot 只能包含字母、数字与下划线" });
    }
    if (!value.trim()) return response.status(400).json({ error: "密钥内容不能为空" });
    const result = upsertCredential(db, { provider, slot, value, key });
    // 不回显明文：只回写元信息（key_version 递增可见，用于确认轮换生效）
    return response.json({ credential: { provider, slot, keyVersion: result.keyVersion }, created: result.created });
  });

  router.delete("/credentials/:provider/:slot", (request, response) => {
    const { provider, slot } = request.params;
    const ref = `${provider}.${slot}`;
    // 被插件声明依赖时拒绝删除：直接删掉只会让插件某条接口在运行时抛"未配置凭据"
    const owners = declaredCredentials.get(ref);
    if (owners?.size) {
      return response.status(409).json({
        error: `该密钥被插件声明依赖，请先移除声明再删除：${[...owners].join("、")}`,
        widgets: [...owners],
      });
    }
    if (!deleteCredential(db, provider, slot)) {
      return response.status(404).json({ error: "该密钥不存在" });
    }
    return response.json({ ok: true });
  });

  // 凭据表单的可选值：providers = 插件声明过的 provider 去重；widgets = 插件 id（slot 专属值用）
  router.get("/credential-providers", (_request, response) => {
    const providers = new Set();
    for (const requirements of widgetCredentialRequirements.values()) {
      for (const item of requirements) {
        const parsed = parseCredentialRef(item.ref);
        if (parsed) providers.add(parsed.provider);
      }
    }
    response.set("Cache-Control", "no-store");
    return response.json({
      providers: [...providers].sort(),
      widgets: [...widgetCredentialRequirements.keys()].sort(),
    });
  });

  // ===== 访问令牌 =====

  router.get("/tokens", (_request, response) => {
    response.set("Cache-Control", "no-store");
    return response.json({ tokens: listTokens(db) });
  });

  router.post("/tokens", (request, response) => {
    const widgetId = String(request.body?.widgetId ?? "").trim();
    const label = String(request.body?.label ?? "").trim();
    if (!NAME_RE.test(widgetId)) return response.status(400).json({ error: "请选择要签发令牌的插件" });
    if (label.length > 64) return response.status(400).json({ error: "备注最多 64 个字符" });

    const declared = widgetDeclared.get(widgetId);
    const requirements = widgetCredentialRequirements.get(widgetId) ?? [];
    const requiredDeclared = requirements.filter((item) => item.required !== false);

    // slot 语义是作用域：default=通用 / 插件名=专属。按 provider 维度判断是否已配置
    const isConfigured = (ref) => {
      const parsed = parseCredentialRef(ref);
      if (!parsed) return false;
      return Boolean(
        db
          .prepare("SELECT 1 AS ok FROM credentials WHERE provider = ? AND slot IN ('default', ?) LIMIT 1")
          .get(parsed.provider, widgetId),
      );
    };
    const describe = (item) => `${item.label || item.ref}（${item.ref}）`;

    // 必选密钥：必须先配置，否则令牌无法签发
    const missingRequired = requiredDeclared.filter((item) => !isConfigured(item.ref));
    if (missingRequired.length) {
      return response.status(400).json({
        error: `必选密钥未配置，请先到「第三方密钥」完成配置：${missingRequired.map(describe).join("、")}`,
      });
    }

    const requested = Array.isArray(request.body?.credentials) ? request.body.credentials : [];
    const credentials = [];
    for (const raw of requested) {
      const ref = String(raw ?? "").trim();
      if (!ref) continue;
      // 令牌只能绑定插件声明过的凭据：未声明的绑定了也用不了（运行时 context 会拒绝）
      if (!declared || !declared.has(ref)) {
        return response.status(400).json({ error: `插件未声明该凭据: ${ref}` });
      }
      if (!isConfigured(ref)) {
        const { provider } = parseCredentialRef(ref);
        return response.status(400).json({ error: `凭据未配置: ${provider}（default 或 ${widgetId}）` });
      }
      if (!credentials.includes(ref)) credentials.push(ref);
    }

    // 必选密钥必须随令牌一起授权，不能漏勾
    const notGranted = requiredDeclared.filter((item) => !credentials.includes(item.ref));
    if (notGranted.length) {
      return response.status(400).json({
        error: `必选密钥必须授权给令牌：${notGranted.map(describe).join("、")}`,
      });
    }

    const issued = issueToken(db, { widgetId, label, credentials });
    // 明文与完整 URL 只在本次响应返回；库里不保存令牌明文
    return response.json({
      token: { id: issued.id, widgetId, label: issued.label, createdAt: new Date().toISOString() },
      value: issued.token,
      credentials: issued.credentials,
      url: embedUrl(requestOrigin(request), widgetId, issued.token),
    });
  });

  // 令牌调用分布：按请求路径 + 来源 IP 聚合，供「查看」弹窗使用；数据来自近 7 天的调用明细
  router.get("/tokens/:id/usage", (request, response) => {
    const id = String(request.params.id);
    if (!TOKEN_ID_RE.test(id)) {
      return response.status(400).json({ error: "令牌 ID 不合法" });
    }
    response.set("Cache-Control", "no-store");
    return response.json({
      requests: tokenRequestStats(db, id, { days: Number(request.query.days ?? 7) }),
    });
  });

  // 令牌级 IP 黑名单：禁用后该 IP 用此令牌的调用一律 403；可随时解除
  router.post("/tokens/:id/ip-blocks", (request, response) => {
    const id = String(request.params.id);
    if (!TOKEN_ID_RE.test(id)) {
      return response.status(400).json({ error: "令牌 ID 不合法" });
    }
    const ip = String(request.body?.ip ?? "").trim();
    if (!IP_RE.test(ip)) {
      return response.status(400).json({ error: "IP 格式不合法" });
    }
    if (!db.prepare("SELECT 1 AS ok FROM embed_tokens WHERE id = ?").get(id)) {
      return response.status(404).json({ error: "令牌不存在" });
    }
    blockTokenIp(db, id, ip);
    return response.json({ ok: true });
  });

  router.delete("/tokens/:id/ip-blocks/:ip", (request, response) => {
    const id = String(request.params.id);
    if (!TOKEN_ID_RE.test(id)) {
      return response.status(400).json({ error: "令牌 ID 不合法" });
    }
    if (!unblockTokenIp(db, id, String(request.params.ip))) {
      return response.status(404).json({ error: "该 IP 不在黑名单中" });
    }
    return response.json({ ok: true });
  });

  // 删除令牌：立即失效并从列表消失；调用记录默认保留，?clearLogs=1 时才一并清除
  router.delete("/tokens/:id", (request, response) => {
    const id = String(request.params.id);
    if (!TOKEN_ID_RE.test(id)) {
      return response.status(400).json({ error: "令牌 ID 不合法" });
    }
    const clearLogs = ["1", "true"].includes(String(request.query.clearLogs ?? ""));
    if (!deleteToken(db, id, { clearLogs })) {
      return response.status(404).json({ error: "令牌不存在" });
    }
    return response.json({ ok: true, clearedLogs: clearLogs });
  });

  // ===== 调用监控 =====

  // 各插件声明的凭据需求：工作台据此展示"该填什么"，并在签发令牌时给出可勾选项
  // auth：插件接口是否需要令牌（"token" 的插件，嵌入链接必须由令牌页签发并复制）
  router.get("/widget-credentials", (_request, response) => {
    const widgets = {};
    const auth = {};
    for (const [widgetId, requirements] of widgetCredentialRequirements) {
      widgets[widgetId] = requirements.map((item) => ({
        ref: item.ref,
        label: item.label || item.ref,
        description: item.description || "",
        placeholder: item.placeholder || "",
        // 未声明 required 一律按必选（与插件声明默认值一致）
        required: item.required !== false,
      }));
      auth[widgetId] = widgetAuth.get(widgetId) === "token" ? "token" : "none";
    }
    response.set("Cache-Control", "no-store");
    return response.json({ widgets, auth });
  });

  // 调用记录列表：可按令牌过滤，默认近 7 天
  router.get("/call-logs", (request, response) => {
    const tokenId = String(request.query.tokenId ?? "").trim() || undefined;
    if (tokenId && !TOKEN_ID_RE.test(tokenId)) {
      return response.status(400).json({ error: "令牌 ID 不合法" });
    }
    response.set("Cache-Control", "no-store");
    return response.json({
      logs: listCallLogs(db, {
        tokenId,
        days: Number(request.query.days ?? 7),
        limit: Number(request.query.limit ?? 200),
      }),
    });
  });

  // 调用记录的存量与当前保留期：管理页据此显示条数、最早时间
  router.get("/call-logs/stats", (_request, response) => {
    response.set("Cache-Control", "no-store");
    return response.json({ stats: callLogStats(db) });
  });

  // 调整保留天数：立即按新保留期裁剪一次，不用等到下一次写入
  router.put("/call-logs/retention", (request, response) => {
    const days = Number(request.body?.days);
    if (!Number.isInteger(days) || days < MIN_CALL_RETENTION_DAYS || days > MAX_CALL_RETENTION_DAYS) {
      return response
        .status(400)
        .json({ error: `保留天数必须是 ${MIN_CALL_RETENTION_DAYS}-${MAX_CALL_RETENTION_DAYS} 的整数` });
    }
    saveCallLogRetentionDays(db, days);
    pruneUsage(db);
    response.set("Cache-Control", "no-store");
    return response.json({ stats: callLogStats(db) });
  });

  // 手动清理：?all=1 清空全部；?olderThanDays=N 清理 N 天前；两者都不给则 400
  router.delete("/call-logs", (request, response) => {
    const all = ["1", "true"].includes(String(request.query.all ?? ""));
    const rawDays = request.query.olderThanDays;
    let deleted;
    if (all) {
      deleted = clearCallLogs(db, {});
    } else if (rawDays !== undefined) {
      const days = Number(rawDays);
      if (!Number.isInteger(days) || days < 0 || days > MAX_CALL_RETENTION_DAYS) {
        return response
          .status(400)
          .json({ error: `清理天数必须是 0-${MAX_CALL_RETENTION_DAYS} 的整数` });
      }
      deleted = clearCallLogs(db, { olderThanDays: days });
    } else {
      return response.status(400).json({ error: "请指定 all=1 或 olderThanDays" });
    }
    response.set("Cache-Control", "no-store");
    return response.json({ deleted, stats: callLogStats(db), retentionDays: callLogRetentionDays(db) });
  });

  return router;
}
