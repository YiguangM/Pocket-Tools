/// <reference types="vitest/config" />
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { CONTENT_SECURITY_POLICY } from "./csp.ts";

/*
 * pdf.js needs a few data files at runtime (CMaps for East Asian text, the
 * standard fonts, wasm image decoders, ICC profiles). Ship them with the app
 * under /pdfjs/ so rendering never reaches for a CDN and works offline.
 */
function pdfjsAssets(): Plugin {
  const root = fileURLToPath(new URL("./node_modules/pdfjs-dist/", import.meta.url));
  const dirs = ["cmaps", "standard_fonts", "wasm", "iccs"];
  const types: Record<string, string> = { ".wasm": "application/wasm", ".js": "text/javascript", ".ttf": "font/ttf" };
  let base = "/";
  return {
    name: "pocket-tools:pdfjs-assets",
    configResolved(config) {
      base = config.base;
    },
    configureServer(server) {
      server.middlewares.use(`${base}pdfjs/`, (req, res, next) => {
        const rel = normalize(decodeURIComponent((req.url ?? "").split("?")[0]).replace(/^\/+/, ""));
        const file = join(root, rel);
        if (!dirs.includes(rel.split(/[\\/]/)[0]) || !file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
    generateBundle() {
      for (const dir of dirs) {
        for (const name of readdirSync(join(root, dir))) {
          this.emitFile({ type: "asset", fileName: `pdfjs/${dir}/${name}`, source: readFileSync(join(root, dir, name)) });
        }
      }
    },
  };
}

/* The policy goes into built pages only: the dev server needs inline scripts and a websocket for hot reload. */
function contentSecurityPolicy(): Plugin {
  return {
    name: "pocket-tools:csp",
    apply: "build",
    transformIndexHtml: {
      order: "pre",
      handler: () => [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CONTENT_SECURITY_POLICY }, injectTo: "head-prepend" }],
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    pdfjsAssets(),
    contentSecurityPolicy(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "script",
      manifest: {
        name: "Pocket Tools",
        short_name: "Pocket Tools",
        description: "Small, private tools that run in your browser. Your files never leave the tab.",
        theme_color: "#171717",
        background_color: "#fafafa",
        display: "standalone",
        start_url: ".",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Precache everything, including the pdf.js data files, so every route works with no connection.
        globPatterns: ["**/*.{js,mjs,css,html,svg,png,woff2,wasm,bcmap,pfb,ttf,icc}"],
        // The background remover's AI runtime and model (~19 MB) are cached the first time that tool is used, not up front.
        globIgnores: ["**/ort-wasm*.wasm", "**/*.onnx"],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "pages",
              networkTimeoutSeconds: 3,
              // Offline and never visited this address: serve the precached app shell, which routes it.
              precacheFallback: { fallbackURL: "index.html" },
            },
          },
          {
            urlPattern: /\/assets\/(ort-wasm[^/]*\.wasm|[^/]*\.onnx)$/,
            handler: "CacheFirst",
            options: { cacheName: "ai-models", expiration: { maxEntries: 8 } },
          },
        ],
        // Pages come from the server whenever it answers, so a new version shows up on the very next
        // open. The cached copy is only the fallback for when the server can't be reached (offline).
        navigateFallback: null,
        directoryIndex: "", // don't let the precache answer "/" with its stored index.html first

        // Control the page on the first visit, so tools opened later in that visit also load offline.
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  build: {
    // pdf.js and pdf-lib are large, but they load only when the PDF tool opens.
    chunkSizeWarningLimit: 1400,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.ts"],
  },
});
