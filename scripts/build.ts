import type { RollupOutput } from "rollup";
import { publishControls } from "./widget-control-assets.js";
import { publishIcon } from "./widget-icon-assets.js";
import { buildWidgetServerModule } from "./widget-server-build.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { validateConfig } from "../src/core/schema/widget-config.schema.js";
import { widgetConfigUrl, widgetMetadata } from "../src/core/schema/widget-config.runtime.js";
import type { WidgetConfig } from "../src/core/schema/widget-config.schema.js";
import { getWidgets } from "../src/core/registry.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest: Record<string, unknown> = {};

// --server-only：只编译插件服务端产物（api 镜像的构建阶段使用），不构建前端与工作台
if (process.argv.includes("--server-only")) {
  let count = 0;
  for (const widget of Object.values(getWidgets())) {
    const config = JSON.parse(
      await readFile(path.join(root, "widgets", widget.id, "config.json"), "utf8"),
    ) as WidgetConfig;
    validateConfig(config, widget.id);
    if (!config.server) continue;
    await buildWidgetServerModule({ root, widgetId: widget.id, server: config.server });
    count += 1;
  }
  console.log(`已编译 ${count} 个插件服务端模块`);
  process.exit(0);
}

// 1. 构建工作台 + 嵌入页（多入口）
await build({ root, configFile: path.join(root, "vite.config.ts") });

// 2. 逐个构建 widget
for (const widget of Object.values(getWidgets())) {
  const config = JSON.parse(
    await readFile(path.join(root, "widgets", widget.id, "config.json"), "utf8"),
  ) as WidgetConfig;
  validateConfig(config, widget.id);

  await mkdir(path.join(root, "dist", "widgets", widget.id), { recursive: true });

  const result = await build({
    root,
    configFile: false,
    publicDir: false,
    build: {
      target: "es2022",
      minify: "esbuild",
      outDir: path.join(root, "dist"),
      emptyOutDir: false,
      cssCodeSplit: true,
      rollupOptions: {
        input: path.join(root, "widgets", widget.id, config.entry.js),
        preserveEntrySignatures: "strict",
        output: {
          entryFileNames: `widgets/${widget.id}/index-[hash].js`,
          chunkFileNames: `widgets/${widget.id}/chunks/[name]-[hash].js`,
          assetFileNames: (asset) =>
            asset.name?.endsWith(".css")
              ? `widgets/${widget.id}/style-[hash][extname]`
              : `widgets/${widget.id}/assets/[name]-[hash][extname]`,
        },
      },
    },
  });

  const outputs = (Array.isArray(result) ? result : [result]).flatMap((output) =>
    (output as RollupOutput).output,
  );
  const entry = outputs.find((output) => output.type === "chunk" && output.isEntry);
  const css = outputs.filter((output) => output.type === "asset" && output.fileName.endsWith(".css"));

  if (!entry) throw new Error(`组件 ${widget.id} 没有生成入口文件`);

  const prefix = `widgets/${widget.id}/`;
  const publishedConfig = {
    ...config,
    entry: {
      js: `./${entry.fileName.slice(prefix.length)}`,
      css: css.map((asset) => `./${asset.fileName.slice(prefix.length)}`),
    },
  };
  // 服务端声明不进入公开产物：嵌入页/工作台拿到的 config 与声明前完全一致；
  // 声明信息始终来自源 widgets/<id>/config.json（这正是"在插件配置文件中注册"）
  delete publishedConfig.server;

  publishedConfig.fields = await publishControls(publishedConfig, root, path.join(root, "dist"));
  publishedConfig.icon = await publishIcon(
    config.icon,
    path.join(root, "widgets", widget.id),
    path.join(root, "dist", "widgets", widget.id),
  );

  await writeFile(
    path.join(root, "dist", "widgets", widget.id, "config.json"),
    JSON.stringify(publishedConfig, null, 2) + "\n",
  );

  manifest[widget.id] = {
    ...widgetMetadata(publishedConfig, widgetConfigUrl(widget.id)),
    config: widgetConfigUrl(widget.id),
    js: `/${entry.fileName}`,
    css: css.map((asset) => `/${asset.fileName}`),
  };

  // 含 server 声明的插件：独立编译服务端模块，与前端产物互不 import
  if (config.server) {
    await buildWidgetServerModule({ root, widgetId: widget.id, server: config.server });
  }
}

await mkdir(path.join(root, "dist", "widgets"), { recursive: true });
await writeFile(
  path.join(root, "dist", "widgets", "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

console.log(`已独立构建 ${Object.keys(manifest).length} 个组件`);
