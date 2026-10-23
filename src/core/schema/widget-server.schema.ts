import { z } from "zod";

// 插件服务端模块的路由声明语法。
// 本文件保持零 `node:` 依赖：既被构建侧/工作台的 zod 校验使用，
// 其语法常量也与运行时（server/plugin-routes.js，纯 JS，无法 import TS）保持一致。
// 修改本文件的路由语法时必须同步 server/plugin-routes.js。

export const ROUTE_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type RouteMethod = (typeof ROUTE_METHODS)[number];

// "<METHOD> /api/<静态路径>"：路径只允许静态段，禁止参数、通配、查询、目录穿越与结尾斜杠
export const ROUTE_KEY_RE =
  /^(GET|POST|PUT|PATCH|DELETE) \/api\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;

// 核心保留路由：插件声明这些 key 一律拒绝，保证核心接口不可被插件遮蔽
export const CORE_RESERVED_ROUTES = ["GET /api/health"] as const;

// 核心保留前缀：用户系统与密钥托管的接口段，插件不得占用
export const CORE_RESERVED_PREFIXES = ["/api/auth/", "/api/admin/"] as const;

export function routeKey(method: RouteMethod, path: string): string {
  return `${method} ${path}`;
}

export function parseRouteKey(key: string): { method: RouteMethod; path: string } | null {
  if (!ROUTE_KEY_RE.test(key) || key.includes("..")) return null;
  const [method, path] = key.split(" ");
  return { method: method as RouteMethod, path };
}

export function isReservedRoute(key: string): boolean {
  const parsed = parseRouteKey(key);
  if (!parsed) return false;
  if ((CORE_RESERVED_ROUTES as readonly string[]).includes(key)) return true;
  return CORE_RESERVED_PREFIXES.some((prefix) => parsed.path.startsWith(prefix));
}

// provider.slot 形式的凭据引用：provider/slot 限字母数字与下划线
export const CREDENTIAL_REF_RE = /^[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/;

// 凭据声明：字符串是向后兼容的最简写法；对象写法让工作台知道"这里该填什么"。
// required 未声明时按必选处理（安全优先），可选密钥必须显式写 required: false。
export const credentialRequirementSchema = z.object({
  ref: z.string(),
  label: z.string().min(1),
  description: z.string().optional(),
  placeholder: z.string().optional(),
  required: z.boolean().optional(),
});

export const credentialDeclarationSchema = z.union([z.string(), credentialRequirementSchema]);

export type CredentialRequirement = {
  ref: string;
  label?: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
};

export function credentialRequirementsOf(
  server: { credentials?: (string | { ref: string; label: string; description?: string; placeholder?: string; required?: boolean })[] } | undefined,
): CredentialRequirement[] {
  return (server?.credentials ?? []).map((item) =>
    typeof item === "string"
      ? { ref: item, required: true }
      : { ...item, required: item.required !== false },
  );
}

export function credentialRefsOf(
  server: { credentials?: (string | { ref: string })[] } | undefined,
): string[] {
  return (server?.credentials ?? []).map((item) => (typeof item === "string" ? item : item.ref));
}

export const widgetServerSchema = z.object({
  entry: z.string(),
  expose: z.array(z.string()),
  auth: z.enum(["none", "token"]).optional(),
  credentials: z.array(credentialDeclarationSchema).optional(),
});

export type WidgetServerConfig = z.infer<typeof widgetServerSchema>;
