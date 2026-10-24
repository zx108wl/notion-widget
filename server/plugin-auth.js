import { readCredential } from "./auth/credentials.js";
import { clientIp, readCookie, resolveSession, SESSION_COOKIE } from "./auth/session.js";
import {
  isTokenIpBlocked,
  readBearerToken,
  tokenCredentials,
  touchToken,
  verifyToken,
} from "./auth/tokens.js";
import { callLoggerOf } from "./auth/usage.js";

// 插件接口的鉴权与上下文注入，注入给 dispatcher 的两颗回调。
// 仅供 Node 侧使用。

const INVALID = Object.freeze({ status: 401, body: { error: "凭据无效或已注销" } });
const IP_BLOCKED = Object.freeze({ status: 403, body: { error: "该 IP 已被禁用" } });
const PASSWORD_CHANGE_REQUIRED = Object.freeze({
  status: 403,
  body: { error: "首次登录需要先修改密码", code: "PASSWORD_CHANGE_REQUIRED" },
});

// entry.auth === "token" 时的凭据校验：
// - 带了 Bearer 令牌：只认令牌。有效则放行；无效/已注销立刻 401，不再回退到会话——
//   这样"注销令牌 → 立刻 401"是可预期的、与 Cookie 无关；
// - 没带 Bearer：认管理员会话（工作台同源预览的捷径；Notion 跨站时 Cookie 不发送）。
export function createPluginAuthorizer({ db }) {
  return function authorize(entry, request) {
    if (entry.auth !== "token") return { ok: true };
    const bearer = readBearerToken(request);
    if (bearer) {
      const row = verifyToken(db, bearer);
      if (!row) return { ok: false, ...INVALID };
      // 令牌级黑名单：该令牌从这个 IP 来的调用一律 403，且不计入调用监控
      if (isTokenIpBlocked(db, row.id, clientIp(request))) return { ok: false, ...IP_BLOCKED };
      touchToken(db, row.id);
      return { ok: true, token: row, tokenCredentials: new Set(tokenCredentials(db, row.id)) };
    }
    const session = resolveSession(db, readCookie(request, SESSION_COOKIE));
    if (!session) return { ok: false, ...INVALID };
    // 首次登录未改密前不允许通过会话调用插件接口（令牌调用不受影响）
    if (Number(session.must_change_password) === 1) return { ok: false, ...PASSWORD_CHANGE_REQUIRED };
    return { ok: true, session };
  };
}

// 上下文：按 entry.credentials 白名单惰性解密密钥，未声明的一律抛错（与路由白名单同一套思路）；
// 令牌调用额外受 tokenCredentials 约束：未绑定的 ref 直接拒绝（最小权限）；
// 工作台会话预览不受此约束（管理员可访问所有已声明凭据）。
// 凭据解析按「专属优先，default 兜底」：先试 provider.<widgetId>，没有回落声明的 slot（通常是 default）。
// 令牌校验通过的调用顺带写一条监控记录（只在令牌通过后记录，工作台会话预览不写）。
export function createPluginContextFactory({ db, key, logCall = callLoggerOf(db) }) {
  return function createContext(entry, request, response, decision) {
    if (decision?.token) logCall(request, response, decision.token.id);
    const allowed = decision?.token ? decision.tokenCredentials : null;
    return {
      credential(ref) {
        if (!entry.credentials.includes(ref)) throw new Error(`插件未声明该凭据: ${ref}`);
        if (allowed && !allowed.has(ref)) throw new Error(`令牌未授权该凭据: ${ref}`);
        return readCredential(db, ref, key, entry.widgetId ?? null);
      },
    };
  };
}
