// 插件接口的路由分发：精确 key 表 + 单个无路径分发中间件。
// 刻意不用 app.use(path, handler)：那是前缀匹配，会把 /api/weatherXYZ 误匹配到 /api/weather。
// 语法常量与 src/core/schema/widget-server.schema.ts 保持一致（那边是 TS，纯 JS 侧无法 import）。
// 仅供 Node 侧使用。

export const ROUTE_KEY_RE =
  /^(GET|POST|PUT|PATCH|DELETE) \/api\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;

// 核心保留路由：插件声明这些 key 一律拒绝
export const CORE_RESERVED_ROUTES = ["GET /api/health"];

// 核心保留前缀：用户系统与密钥托管的接口段，插件不得占用
export const CORE_RESERVED_PREFIXES = ["/api/auth/", "/api/admin/"];

// 未声明任何凭据时的默认上下文：读到未声明的凭据必须直接报错，而不是返回空值
export const EMPTY_CONTEXT = Object.freeze({
  credential(ref) {
    throw new Error(`插件未声明该凭据: ${ref}`);
  },
});

// 未配置 authorize 时的兜底：一律放行（等价于所有接口 auth: none）
const ALLOW = Object.freeze({ ok: true });

export function isValidRouteKey(key) {
  return typeof key === "string" && ROUTE_KEY_RE.test(key) && !key.includes("..");
}

export function isReservedRouteKey(key) {
  if (CORE_RESERVED_ROUTES.includes(key)) return true;
  const space = String(key).indexOf(" ");
  if (space < 0) return false;
  const requestPath = key.slice(space + 1);
  return CORE_RESERVED_PREFIXES.some((prefix) => requestPath.startsWith(prefix));
}

export function routeKeyOf(method, requestPath) {
  const normalized = requestPath.length > 1 && requestPath.endsWith("/")
    ? requestPath.slice(0, -1)
    : requestPath;
  return `${method.toUpperCase()} ${normalized}`;
}

/**
 * @param {{
 *   table: Map<string, unknown>,
 *   createContext?: (entry: any, request: any, response: any, decision: any) => any,
 *   authorize?: (entry: any, request: any) => { ok: boolean, status?: number, body?: unknown } | Promise<any>,
 * }} options
 */
export function createPluginDispatcher({ table, createContext, authorize }) {
  return function pluginDispatcher(request, response, next) {
    const entry = table.get(routeKeyOf(request.method, request.path));
    if (!entry) return next();
    // Express 5 的 async 自动捕获在自定义分发器下失效：handler 的 promise 不会回到 router，
    // 必须自己把失败交给 next()，否则请求会悬挂
    Promise.resolve()
      .then(() => (authorize ? authorize(entry, request) : ALLOW))
      .then((decision) => {
        // 凭据无效/已注销：401；语义与核心接口一致，不落到 404
        if (!decision?.ok) {
          response.status(decision?.status ?? 401).json(decision?.body ?? { error: "凭据无效或已注销" });
          return undefined;
        }
        return Promise.resolve()
          .then(() => (createContext ? createContext(entry, request, response, decision) : EMPTY_CONTEXT))
          .then((context) => entry.handler(request, response, context));
      })
      .catch(next);
  };
}
