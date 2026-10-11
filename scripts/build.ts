import type { RollupOutput } from "rollup";
import { publishControls } from "./widget-control-assets.js";
import { publishIcon } from "./widget-icon-assets.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { validateConfig, widgetMetadata } from "../src/core/schema/widget-config.schema.js";
import type { WidgetConfig } from "../src/core/schema/widget-config.schema.js";
import { widgets } from "../src/core/registry.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest: Record<string, unknown> = {};

// 1. 构建工作台 + 嵌入页（多入口）
await build({ root, configFile: path.join(root, "vite.config.ts") });

// 2. 逐个构建 widget
for (const widget of Object.values(widgets)) {
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
    ...widgetMetadata(publishedConfig, `/widgets/${widget.id}/config.json`),
    config: `/widgets/${widget.id}/config.json`,
    js: `/${entry.fileName}`,
    css: css.map((asset) => `/${asset.fileName}`),
  };
}

await mkdir(path.join(root, "dist", "widgets"), { recursive: true });
await writeFile(
  path.join(root, "dist", "widgets", "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

console.log(`已独立构建 ${Object.keys(manifest).length} 个组件`);
