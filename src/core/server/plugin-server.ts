// 插件服务端模块的类型契约（仅 `import type` 引用，运行时零开销）。
// 服务端执行进程是纯 JS，实际加载的是 SSR 编译产物，本文件只服务于类型检查与插件作者体验。
// 这里刻意不 import express 类型：结构上兼容 express 的 req/res 即可，避免给核心层引入框架依赖。

export interface WidgetServerRequest {
  readonly method: string;
  readonly path: string;
  readonly query: Record<string, unknown>;
  readonly params: Record<string, string>;
  readonly headers: Record<string, string | string[] | undefined>;
}

export interface WidgetServerResponse {
  status(code: number): WidgetServerResponse;
  json(body: unknown): unknown;
  set(field: string, value: string): WidgetServerResponse;
}

export interface WidgetServerContext {
  // 读取 config.json 中 server.credentials 声明过的密钥；未声明的 provider 一律抛错
  credential(ref: string): string;
}

export type WidgetRouteHandler = (
  request: WidgetServerRequest,
  response: WidgetServerResponse,
  ctx: WidgetServerContext,
) => unknown | Promise<unknown>;

export interface WidgetServerModule {
  routes: Record<string, WidgetRouteHandler>;
}
