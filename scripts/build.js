import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { widgets } from "../src/widgets-registry.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = {};

await build({ root, configFile: path.join(root, "vite.config.js") });

for (const widget of Object.values(widgets)) {
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
        input: path.join(root, "widgets", widget.id, "index.js"),
        preserveEntrySignatures: "strict",
        output: {
          entryFileNames: `widgets/${widget.id}-[hash].js`,
          chunkFileNames: `widgets/chunks/[name]-[hash].js`,
          assetFileNames: (asset) => asset.name?.endsWith(".css")
            ? `widgets/${widget.id}-[hash][extname]`
            : "widgets/assets/[name]-[hash][extname]",
        },
      },
    },
  });

  const outputs = (Array.isArray(result) ? result : [result]).flatMap((output) => output.output);
  const entry = outputs.find((output) => output.type === "chunk" && output.isEntry);
  const css = outputs.filter((output) => output.type === "asset" && output.fileName.endsWith(".css"));

  if (!entry) throw new Error(`组件 ${widget.id} 没有生成入口文件`);
  manifest[widget.id] = {
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
