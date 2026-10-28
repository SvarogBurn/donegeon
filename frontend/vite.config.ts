import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SassString } from "sass";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const nesRoot = path.dirname(createRequire(import.meta.url).resolve("nes.css/package.json"));

/**
 * `virtual:git-log`: the repo's commits as the app is built, newest first ([{ hash, date, subject }]), which the News
 * page makes its changelog of (lib/news.ts). Without git (or a repo) it is empty, and the page says so. In dev a
 * commit reloads it, and the news/ folder (outside the app's root, so not watched by itself) is watched for its files.
 */
function gitLog(): Plugin {
  const id = "virtual:git-log";
  const repo = fileURLToPath(new URL("..", import.meta.url));
  const head = path.join(repo, ".git", "logs", "HEAD");
  return {
    name: "git-log",
    configureServer(server) {
      const news = path.join(repo, "news");
      server.watcher.add([news, head]);
      // A commit, or a file of news/ added, changed or taken away: the modules made from them are made again.
      const reload = (file: string) => {
        const made = file === head ? [server.moduleGraph.getModuleById(`\0${id}`)] : file.startsWith(news) ? [...server.moduleGraph.idToModuleMap.values()].filter((found) => found.id?.includes("/src/lib/newsContent.ts") || found.id?.startsWith(news)) : [];
        if (made.length === 0) return;
        for (const found of made) if (found) server.moduleGraph.invalidateModule(found);
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.on("change", reload);
      server.watcher.on("add", reload);
      server.watcher.on("unlink", reload);
    },
    resolveId: (source) => (source === id ? `\0${id}` : null),
    load(loaded) {
      if (loaded !== `\0${id}`) return null;
      let commits: { hash: string; date: string; subject: string }[] = [];
      try {
        const out = execFileSync("git", ["log", "--no-merges", "--format=%h%x1f%ad%x1f%s", "--date=short"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
        commits = out.split("\n").filter(Boolean).map((line) => {
          const [hash, date, subject] = line.split("\x1f");
          return { hash, date, subject };
        });
      } catch {
        // No git here: no changelog.
      }
      return `export default ${JSON.stringify(commits)};`;
    },
  };
}

/**
 * A new export of the characters (`npm run parts`) while the app is open reloads the page. The sprite and the face keep
 * their pixels once loaded, so the data swapped in place left them drawing the old ones: a body moved to a new file
 * (the duck's v4 to v5) drew nothing until a reload.
 */
function characterData(): Plugin {
  return {
    name: "character-data",
    handleHotUpdate({ file, server }) {
      if (!/\/lib\/character\/(parts|faces)\.data\.json$/.test(file)) return;
      server.ws.send({ type: "full-reload" });
      return [];
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    gitLog(),
    characterData(),
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
