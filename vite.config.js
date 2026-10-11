import { readFile } from "node:fs/promises";
import { validateConfig, widgetMetadata } from "./src/widget-config.js";
import { defineConfig } from "vite";
import { widgets } from "./src/widgets-registry.js";

export default defineConfig({
  plugins: [
    {
      name: "widget-development-manifest",
      configureServer(server) {
        server.middlewares.use("/widgets/manifest.json", async (_request, response, next) => {
          try {
            const entries = await Promise.all(Object.values(widgets).map(async ({ id }) => {
              const config = JSON.parse(await readFile(new URL(`./widgets/${id}/config.json`, import.meta.url), "utf8"));
              validateConfig(config, id);
              return [id, {
                ...widgetMetadata(config, `/widgets/${id}/config.json`),
                config: `/widgets/${id}/config.json`,
                js: `/widgets/${id}/${config.entry.js.slice(2)}`,
                css: [], // Vite 在开发模式通过 JS 导入注入样式。
              }];
            }));
            response.setHeader("Content-Type", "application/json; charset=utf-8");
            response.setHeader("Cache-Control", "no-store");
            response.end(JSON.stringify(Object.fromEntries(entries)));
          } catch (error) { next(error); }
        });
      },
    },
  ],
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
  },
});
