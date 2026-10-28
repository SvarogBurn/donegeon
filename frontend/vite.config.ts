import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { SassString } from "sass";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const nesRoot = path.dirname(createRequire(import.meta.url).resolve("nes.css/package.json"));

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // A service worker keeps the built app on the phone, so it opens with no connection (the data comes from the
    // query cache kept in IndexedDB, see main.tsx), and shows pushed notifications. It never answers /api. A deploy
    // reaches the phone on its next open: the new worker takes over and the page reloads into it (see main.tsx). Not in dev.
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      // public/manifest.webmanifest, linked from index.html.
      manifest: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // The fonts only some pick (lib/fonts.ts) and the pixel font's Greek and Cyrillic letters aren't fetched on the
        // first visit, where they held up the phone's connection: each is kept once it is first used (below).
        globIgnores: ["**/opendyslexic-*", "**/atkinson-hyperlegible-*", "**/press-start-2p-{cyrillic,cyrillic-ext,greek}-*"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/assets/") && url.pathname.endsWith(".woff2"),
            handler: "CacheFirst",
            options: { cacheName: "fonts", expiration: { maxEntries: 20 } },
          },
        ],
        // Shows the notifications the server pushes, and opens their page on a tap (public/push-sw.js).
        importScripts: ["push-sw.js"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  css: {
    preprocessorOptions: {
      scss: {
        // NES.css is compiled from its Sass sources (src/styles/nes.scss), which
        // expect this helper from its own build: a file inlined as a data URI.
        // Its paths are relative to the package's scss/ folder.
        functions: {
          "get-file-as-data-uri($file)": ([file]: unknown[]) => {
            const png = readFileSync(path.resolve(nesRoot, "scss", (file as SassString).assertString("file").text));
            return new SassString(`data:image/png;base64,${png.toString("base64")}`, { quotes: false });
          },
        },
        // NES.css still uses Sass's older syntax; that is its business, not a problem in this app.
        quietDeps: true,
        silenceDeprecations: ["import", "global-builtin", "color-functions", "slash-div"],
      },
    },
  },
  server: {
    // The pixel-art borders and buttons live in the repo's top-level assets/ folder.
    fs: { allow: [".."] },
    // Same-origin in dev as in production, so the session cookie just works.
    proxy: { "/api": "http://localhost:3001" },
  },
});
