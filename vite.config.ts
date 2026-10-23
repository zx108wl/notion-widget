import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { validateConfig } from "./src/core/schema/widget-config.schema.js";
import { widgetConfigUrl, widgetMetadata } from "./src/core/schema/widget-config.runtime.js";
import { defineConfig, type Connect } from "vite";
import react from "@vitejs/plugin-react";
import { getWidgets } from "./src/core/registry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    {
      name: "widget-development-manifest",
      configureServer(server) {
        server.middlewares.use("/widgets/manifest.json", async (_request, response, next) => {
          try {
            const entries = await Promise.all(
              // 每次请求重新扫描：新增插件目录后刷新页面即可上线，无需重启 dev server
              Object.values(getWidgets()).map(async ({ id }) => {
                const config = JSON.parse(
                  await readFile(new URL(`./widgets/${id}/config.json`, import.meta.url), "utf8"),
                );
                validateConfig(config, id);
                return [
                  id,
                  {
                    ...widgetMetadata(config, widgetConfigUrl(id)),
                    config: widgetConfigUrl(id),
                    js: `/widgets/${id}/${config.entry.js.slice(2)}`,
                    css: [],
                  },
                ];
              }),
            );
            response.setHeader("Content-Type", "application/json; charset=utf-8");
            response.setHeader("Cache-Control", "no-store");
            response.end(JSON.stringify(Object.fromEntries(entries)));
          } catch (error) {
            next(error);
          }
        });
      },
    },
    {
      name: "widget-route-fallback",
      configureServer(server) {
        server.middlewares.use((req: Connect.IncomingMessage, _res, next) => {
          if (req.url && /^\/widget\/[^/]/.test(req.url.split("?")[0])) {
            req.url = "/widget.html";
          }
          next();
        });
      },
    },
  ],
  resolve: {
    alias: [
      // 仅测试：vite-node 2.1 无法外部化 node:sqlite（normalizeModuleId 硬剥 node: 前缀），
      // 指向运行时 shim 绕过静态解析；dev 与生产构建（server 由 Node 直接运行）不加载此别名
      ...(process.env.VITEST
        ? [{ find: /^node:sqlite$/, replacement: resolve(__dirname, "tests/helpers/node-sqlite.js") }]
        : []),
      { find: "@", replacement: resolve(__dirname, "src") },
    ],
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    target: "es2022",
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        widget: resolve(__dirname, "widget.html"),
      },
    },
  },
});
