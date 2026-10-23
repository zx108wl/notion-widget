// 工作台的后端访问层：所有请求同源携带会话 Cookie（credentials: same-origin）。
// 会话 Cookie 是 httpOnly 的，前端拿不到也读不到；未登录时 /api/auth/me 返回 401。

export interface SessionUser {
  username: string;
}

export interface CredentialRow {
  provider: string;
  slot: string;
  key_version: number;
  created_at: string;
  updated_at: string;
}

export interface CredentialRequirement {
  ref: string;
  label: string;
  description: string;
  placeholder: string;
  /** 必选密钥：签发令牌时必须配置并授权；可选密钥可自由勾选组合 */
  required: boolean;
}

export interface TokenRow {
  id: string;
  widget_id: string;
  label: string | null;
  status: string;
  created_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
  use_count: number;
  revoked_reason: string | null;
}

/** 插件元信息：凭据需求 + 接口是否需要访问令牌 */
export interface WidgetMetaInfo {
  widgets: Record<string, CredentialRequirement[]>;
  auth: Record<string, "none" | "token">;
}

export interface IssuedToken {
  token: TokenRow;
  /** 令牌明文：只在签发时返回这一次 */
  value: string;
  url: string;
  /** 该令牌被授权使用的第三方密钥 ref 列表 */
  credentials: string[];
}

export interface CallLogRow {
  ts: number;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  ip: string | null;
  tokenId: string;
}

/** 单个令牌按来源 IP 聚合后的调用分布 */
export interface TokenRequestStat {
  ip: string | null;
  calls: number;
  lastAt: number | null;
  /** 该 IP 是否已被此令牌禁用 */
  blocked: boolean;
}

/** 调用记录存量：条数、最早/最新时间与当前保留天数 */
export interface CallLogStats {
  total: number;
  oldest: number | null;
  newest: number | null;
  retentionDays: number;
}

async function request<T>(
  url: string,
  { method = "GET", body }: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(data?.error || `请求失败（HTTP ${response.status}）`);
  return data as T;
}

export const api = {
  me: () => request<{ user: SessionUser }>("/api/auth/me").then((data) => data.user),
  login: (username: string, password: string) =>
    request<{ user: SessionUser }>("/api/auth/login", {
      method: "POST",
      body: { username, password },
    }).then((data) => data.user),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean; revokedSessions: number }>("/api/auth/password", {
      method: "POST",
      body: { currentPassword, newPassword },
    }),

  listCredentials: () =>
    request<{ credentials: CredentialRow[] }>("/api/admin/credentials").then((data) => data.credentials),
  saveCredential: (provider: string, slot: string, value: string) =>
    request<{ created: boolean }>("/api/admin/credentials", {
      method: "PUT",
      body: { provider, slot, value },
    }),
  deleteCredential: (provider: string, slot: string) =>
    request<{ ok: boolean }>(`/api/admin/credentials/${provider}/${slot}`, { method: "DELETE" }),

  // 凭据表单的可选值：providers = 插件声明过的 provider 去重；widgets = 插件 id（slot 专属值用）
  listCredentialProviders: () =>
    request<{ providers: string[]; widgets: string[] }>("/api/admin/credential-providers"),

  listTokens: () => request<{ tokens: TokenRow[] }>("/api/admin/tokens").then((data) => data.tokens),
  createToken: (widgetId: string, label: string, credentials: string[] = []) =>
    request<IssuedToken>("/api/admin/tokens", { method: "POST", body: { widgetId, label, credentials } }),
  deleteToken: (id: string, clearLogs = false) =>
    request<{ ok: boolean; clearedLogs: boolean }>(
      `/api/admin/tokens/${id}${clearLogs ? "?clearLogs=1" : ""}`,
      { method: "DELETE" },
    ),
  tokenRequests: (id: string, days = 7) =>
    request<{ requests: TokenRequestStat[] }>(`/api/admin/tokens/${id}/usage?days=${days}`).then(
      (data) => data.requests,
    ),
  blockTokenIp: (id: string, ip: string) =>
    request<{ ok: boolean }>(`/api/admin/tokens/${id}/ip-blocks`, { method: "POST", body: { ip } }),
  unblockTokenIp: (id: string, ip: string) =>
    request<{ ok: boolean }>(`/api/admin/tokens/${id}/ip-blocks/${encodeURIComponent(ip)}`, {
      method: "DELETE",
    }),

  // 各插件固定声明的第三方密钥需求 + 是否需要令牌：签发令牌与配置密钥时据此展示"该填什么"
  listWidgetMeta: () => request<WidgetMetaInfo>("/api/admin/widget-credentials"),

  // 调用记录列表：可按令牌过滤
  listCallLogs: (tokenId?: string, days = 7, limit = 200) => {
    const params = new URLSearchParams({ days: String(days), limit: String(limit) });
    if (tokenId) params.set("tokenId", tokenId);
    return request<{ logs: CallLogRow[] }>(`/api/admin/call-logs?${params}`).then((data) => data.logs);
  },
  callLogStats: () =>
    request<{ stats: CallLogStats }>("/api/admin/call-logs/stats").then((data) => data.stats),
  setCallLogRetention: (days: number) =>
    request<{ stats: CallLogStats }>("/api/admin/call-logs/retention", {
      method: "PUT",
      body: { days },
    }).then((data) => data.stats),
  // olderThanDays 省略 = 清空全部
  clearCallLogs: (olderThanDays?: number) => {
    const params = olderThanDays === undefined ? "all=1" : `olderThanDays=${olderThanDays}`;
    return request<{ deleted: number; stats: CallLogStats }>(`/api/admin/call-logs?${params}`, {
      method: "DELETE",
    });
  },
};
