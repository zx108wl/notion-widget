// 仅供 vitest 使用：vite-node 2.1 的内置模块清单早于 node:sqlite，
// normalizeModuleId 会把 node: 前缀硬剥成裸 "sqlite"，导致外部化与原生 import 双双失败。
// 这里通过 createRequire 在运行时直接向 Node 索取原生模块，完全绕开打包器的静态解析。
// 生产运行（tsx/node 直接启动 server）走的是源码里真正的 import，与此 shim 无关。
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const { DatabaseSync } = require("node:sqlite");
