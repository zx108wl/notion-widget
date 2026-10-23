import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { isBuiltin } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { OutputChunk, RollupOutput } from "rollup";
import { build } from "vite";
import type { WidgetServerConfig } from "../src/core/schema/widget-server.schema.js";

// 插件服务端模块的独立（SSR）编译与产物校验。
// 与前端构建完全分离：这里只看见 server.entry，前端构建只看见 entry.js，两份产物互不 import。
// 运行时（server/plugin-loader.js）按固定文件名定位产物，故此处文件名不可随意更改。
export const widgetServerArtifact = "server.js";

function collectOutputs(result: Awaited<ReturnType<typeof build>>): (OutputChunk | RollupOutput["output"][number])[] {
  return (Array.isArray(result) ? result : [result]).flatMap((output) => (output as RollupOutput).output);
}

// 服务端模块只允许 import Node 内置模块或根 package.json 的 dependencies：
// 生产镜像是 `npm ci --omit=dev`，没有 per-plugin 依赖树，未声明的依赖在运行时必崩
function assertExternalAllowed(widgetId: string, id: string, dependencies: Set<string>): void {
  if (isBuiltin(id)) return;
  const name = id.startsWith("@") ? id.split("/").slice(0, 2).join("/") : id.split("/")[0];
  if (dependencies.has(name)) return;
  throw new Error(
    `插件 ${widgetId} 的服务端模块 import 了未声明的依赖: ${id}（请加入根 package.json 的 dependencies，或改用 Node 内置模块）`,
  );
}

// 子进程隔离地动态 import 产物：插件顶层若有副作用（定时器/连接）也挂不住构建进程
function assertRoutesCoverage(widgetId: string, filePath: string, expose: string[]): void {
  const script = `
const url = process.argv[1];
const expose = JSON.parse(process.env.WIDGET_SERVER_EXPOSE ?? "[]");
const module = await import(url);
if (!module.routes || typeof module.routes !== "object") {
  throw new Error("服务端模块必须导出 routes 对象");
}
for (const key of expose) {
  if (typeof module.routes[key] !== "function") {
    throw new Error("服务端模块缺少已声明的接口: " + key);
  }
}
`;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", script, pathToFileURL(filePath).href],
    {
      timeout: 10_000,
      encoding: "utf8",
      env: { ...process.env, WIDGET_SERVER_EXPOSE: JSON.stringify(expose) },
    },
  );
  if (result.error) {
    throw new Error(`插件 ${widgetId} 的服务端模块无法加载：${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `插件 ${widgetId} 的服务端模块校验失败：${(result.stderr || result.stdout || "").trim() || "进程异常退出"}`,
    );
  }
}

export async function buildWidgetServerModule(options: {
  root: string;
  widgetId: string;
  server: WidgetServerConfig;
}): Promise<string> {
  const { root, widgetId, server } = options;
  const entry = path.resolve(root, "widgets", widgetId, server.entry);
  const bareSpecifiers = new Set<string>();

  const result = await build({
    root,
    configFile: false,
    publicDir: false,
    plugins: [
      {
        name: "widget-server-external-audit",
        enforce: "pre",
        // 在插件链最前端记录所有裸模块说明符，用于事后断言允许的依赖范围
        resolveId(source, importer) {
          if (importer && !source.startsWith(".") && !path.isAbsolute(source) && !source.startsWith("\0")) {
            bareSpecifiers.add(source);
          }
          return null;
        },
      },
    ],
    build: {
      ssr: entry,
      target: "es2022",
      minify: false,
      outDir: path.join(root, "dist"),
      emptyOutDir: false,
      rollupOptions: {
        // "strict" 保证入口的 routes 导出不被 tree-shaking 裁剪
        preserveEntrySignatures: "strict",
        output: {
          format: "es",
          entryFileNames: `widgets/${widgetId}/${widgetServerArtifact}`,
          chunkFileNames: `widgets/${widgetId}/server-chunks/[name]-[hash].js`,
          assetFileNames: `widgets/${widgetId}/server-chunks/[name]-[hash][extname]`,
        },
      },
    },
  });

  const outputs = collectOutputs(result);
  const assets = outputs.filter((output) => output.type === "asset");
  if (assets.length) {
    throw new Error(
      `插件 ${widgetId} 的服务端构建产出了非 JS 资源（服务端模块禁止 import CSS）：${assets.map((asset) => asset.fileName).join(", ")}`,
    );
  }

  const chunk = outputs.find((output): output is OutputChunk => output.type === "chunk" && output.isEntry);
  const expected = `widgets/${widgetId}/${widgetServerArtifact}`;
  if (!chunk || chunk.fileName !== expected) {
    throw new Error(`插件 ${widgetId} 的服务端模块没有生成预期产物 ${expected}`);
  }

  const { dependencies = {} } = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };
  const allowed = new Set(Object.keys(dependencies));
  for (const id of bareSpecifiers) assertExternalAllowed(widgetId, id, allowed);

  assertRoutesCoverage(widgetId, path.join(root, "dist", chunk.fileName), server.expose);
  return chunk.fileName;
}
