import { defineConfig } from "vite";
import { widgets } from "./src/widgets-registry.js";

export default defineConfig({
  plugins: [
    {
      name: "widget-development-manifest",
      configureServer(server) {
        server.middlewares.use("/widgets/manifest.json", (_request, response) => {
          const manifest = Object.fromEntries(Object.values(widgets).map((widget) => [
            widget.id,
            { js: `/widgets/${widget.id}/index.js`, css: [] },
          ]));
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.setHeader("Cache-Control", "no-store");
          response.end(JSON.stringify(manifest));
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
