import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { validateConfig, widgetMetadata } from "./src/core/schema/widget-config.schema.js";
import { defineConfig, type Connect } from "vite";
import react from "@vitejs/plugin-react";
import { widgets } from "./src/core/registry.js";

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
              Object.values(widgets).map(async ({ id }) => {
                const config = JSON.parse(
                  await readFile(new URL(`./widgets/${id}/config.json`, import.meta.url), "utf8"),
                );
                validateConfig(config, id);
                return [
                  id,
                  {
                    ...widgetMetadata(config, `/widgets/${id}/config.json`),
                    config: `/widgets/${id}/config.json`,
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
    alias: {
      "@": resolve(__dirname, "src"),
    },
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
